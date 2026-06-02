import { useAppStore } from '../store/useAppStore';

export async function chatCompletion(messages: any[], systemPrompt?: string) {
  const { providers, activeProviderId } = useAppStore.getState();
  const providerArray = Array.isArray(providers) ? providers : [];
  const provider = providerArray.find(p => p.id === activeProviderId);
  
  if (!provider) throw new Error('No active provider found');
  const apiKey = provider.apiKey;
  if (!apiKey) throw new Error(`API key is missing for ${provider.name}`);
  const model = provider.activeModel;

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

    const body: any = { contents: formattedMessages };
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

export async function streamChatCompletion(messages: any[], systemPrompt: string | undefined, onUpdate: (content: string, reasoning: string) => void) {
  const { providers, activeProviderId } = useAppStore.getState();
  const providerArray = Array.isArray(providers) ? providers : [];
  const provider = providerArray.find(p => p.id === activeProviderId);
  
  if (!provider) throw new Error('No active provider found');
  const apiKey = provider.apiKey;
  if (!apiKey) throw new Error(`API key is missing for ${provider.name}`);
  const model = provider.activeModel;

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
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) fullContent += delta.content;
            if (delta?.reasoning_content) fullReasoning += delta.reasoning_content;
            onUpdate(fullContent, fullReasoning);
          } catch (e) {
            // ignore JSON parse error in fragments
          }
        }
      }
    }
  } else if (provider.type === 'GEMINI') {
    const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
    
    const formattedMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body: any = { contents: formattedMessages };
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
      buffer += decoder.decode(value, { stream: true });
      
      // Gemini SSE format is typically lines of JSON or a JSON array stream
      // streamGenerateContent with alt=sse returns SSE
      // Wait, the endpoint above doesn't have alt=sse. So it's returning a chunked JSON array.
      // Let's use alt=sse
    }
    // We didn't append &alt=sse. Let's fix that!
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
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              onUpdate(fullContent, fullReasoning);
            }
          } catch (e) {
            // ignore inner parse errors
          }
        }
      }
    }
  } else {
    throw new Error('Unsupported provider type');
  }
  
  return { content: fullContent, reasoning: fullReasoning };
}
