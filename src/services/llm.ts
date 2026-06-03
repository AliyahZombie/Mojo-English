import { useAppStore } from '../store/useAppStore';
import type { LlmTask, Provider } from '../store/useAppStore';

type ChatCompletionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type StreamUpdate = (content: string, reasoning: string) => void;

type LlmRequestOptions = {
  task?: LlmTask;
};

const resolveModel = (provider: Provider, task?: LlmTask) => {
  const taskModel = task ? provider.taskModels?.[task]?.trim() : '';
  const model = taskModel || provider.activeModel.trim();
  if (!model) {
    throw new Error(`Model is missing for ${provider.name}${task ? ` (${task})` : ''}`);
  }
  return model;
};

const parseOpenAiCompatibleDelta = (data: string, onDelta: (contentDelta: string, reasoningDelta: string) => void) => {
  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: {
        content?: string | null;
        reasoning?: string | null;
        reasoning_content?: string | null;
      };
    }>;
  };
  const delta = parsed.choices?.[0]?.delta;
  if (!delta) return;

  onDelta(delta.content ?? '', delta.reasoning_content ?? delta.reasoning ?? '');
};

const findSseBoundary = (buffer: string) => {
  const lfIndex = buffer.indexOf('\n\n');
  const crlfIndex = buffer.indexOf('\r\n\r\n');

  if (lfIndex === -1 && crlfIndex === -1) return undefined;
  if (lfIndex === -1) return { index: crlfIndex, length: 4 };
  if (crlfIndex === -1) return { index: lfIndex, length: 2 };

  return lfIndex < crlfIndex ? { index: lfIndex, length: 2 } : { index: crlfIndex, length: 4 };
};

const handleSseChunk = (buffer: string, value: Uint8Array, decoder: TextDecoder, onEvent: (data: string) => void) => {
  let nextBuffer = buffer + decoder.decode(value, { stream: true });
  let eventBoundary = findSseBoundary(nextBuffer);

  while (eventBoundary) {
    const event = nextBuffer.slice(0, eventBoundary.index).trim();
    nextBuffer = nextBuffer.slice(eventBoundary.index + eventBoundary.length);

    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (data && data !== '[DONE]') {
      try {
        onEvent(data);
      } catch (error) {
        console.warn('Skipping malformed stream event', error);
      }
    }

    eventBoundary = findSseBoundary(nextBuffer);
  }

  return nextBuffer;
};

export async function chatCompletion(messages: ChatCompletionMessage[], systemPrompt?: string, options?: LlmRequestOptions) {
  const { providers, activeProviderId } = useAppStore.getState();
  const providerArray = Array.isArray(providers) ? providers : [];
  const provider = providerArray.find(p => p.id === activeProviderId);
  
  if (!provider) throw new Error('No active provider found');
  const apiKey = provider.apiKey;
  if (!apiKey) throw new Error(`API key is missing for ${provider.name}`);
  const model = resolveModel(provider, options?.task);

  if (provider.type === 'OPENAI') {
    const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    let processedMessages = [...messages];
    if (systemPrompt) {
      processedMessages = [{ role: 'system', content: systemPrompt }, ...processedMessages];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: processedMessages,
      })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
    
  } else if (provider.type === 'GEMINI') {
    const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const formattedMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body: { contents: typeof formattedMessages; systemInstruction?: { parts: Array<{ text: string }> } } = { contents: formattedMessages };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
    
  } else if (provider.type === 'CLAUDE') {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/messages`;
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content[0].text;
  }
  
  throw new Error('Unsupported provider type');
}

export async function streamChatCompletion(
  messages: ChatCompletionMessage[],
  systemPrompt: string | undefined,
  onUpdate: StreamUpdate,
  options?: LlmRequestOptions,
) {
  const { providers, activeProviderId } = useAppStore.getState();
  const providerArray = Array.isArray(providers) ? providers : [];
  const provider = providerArray.find(p => p.id === activeProviderId);
  
  if (!provider) throw new Error('No active provider found');
  const apiKey = provider.apiKey;
  if (!apiKey) throw new Error(`API key is missing for ${provider.name}`);
  const model = resolveModel(provider, options?.task);

  let fullContent = '';
  let fullReasoning = '';

  if (provider.type === 'OPENAI') {
    const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    let processedMessages = [...messages];
    if (systemPrompt) {
      processedMessages = [{ role: 'system', content: systemPrompt }, ...processedMessages];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: processedMessages,
        stream: true
      })
    });

    if (!res.ok) throw new Error(await res.text());
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) return;

    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = handleSseChunk(buffer, value, decoder, (data) => {
        parseOpenAiCompatibleDelta(data, (contentDelta, reasoningDelta) => {
          fullContent += contentDelta;
          fullReasoning += reasoningDelta;
          if (contentDelta || reasoningDelta) onUpdate(fullContent, fullReasoning);
        });
      });
    }
  } else if (provider.type === 'GEMINI') {
    const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    
    const formattedMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body: { contents: typeof formattedMessages; systemInstruction?: { parts: Array<{ text: string }> } } = { contents: formattedMessages };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(await res.text());
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) return;
    
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = handleSseChunk(buffer, value, decoder, (data) => {
        const parsed = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };
        const parts = parsed.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts)
          ? parts.map(part => part.text ?? '').join('')
          : '';

        if (text) {
          fullContent += text;
          onUpdate(fullContent, fullReasoning);
        }
      });
    }
  } else if (provider.type === 'CLAUDE') {
    const baseUrl = provider.baseUrl || 'https://api.anthropic.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/messages`;
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        stream: true,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      })
    });

    if (!res.ok) throw new Error(await res.text());
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) return;

    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = handleSseChunk(buffer, value, decoder, (data) => {
        const parsed = JSON.parse(data) as {
          type?: string;
          delta?: {
            text?: string;
            thinking?: string;
          };
        };

        if (parsed.type === 'content_block_delta') {
          const contentDelta = parsed.delta?.text ?? '';
          const reasoningDelta = parsed.delta?.thinking ?? '';
          fullContent += contentDelta;
          fullReasoning += reasoningDelta;
          if (contentDelta || reasoningDelta) onUpdate(fullContent, fullReasoning);
        }
      });
    }
  } else {
    throw new Error('Unsupported provider type');
  }
  
  return { content: fullContent, reasoning: fullReasoning };
}
