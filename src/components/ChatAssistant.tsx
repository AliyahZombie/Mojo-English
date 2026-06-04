import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Send, User as UserIcon, Wand2, X, Trash2, PenLine } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore, type ChatAttachment, type ChatMessagePart, type ChatToolEvent } from '../store/useChatStore';
import { useAppStore } from '../store/useAppStore';
import { translations, type Language } from '../lib/i18n';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const getErrorMessage = (error: unknown, language: Language) => error instanceof Error ? error.message : translations[language].chatFetchError;

const consumedAutoSendRequestIds = new Set<string>();
const MAX_TOOL_ROUNDS = 3;

type AssistantToolName = ChatToolEvent['toolName'];

type AssistantToolRequest = {
  id: string;
  toolName: AssistantToolName;
  args: Record<string, unknown>;
};

type AssistantToolResult = {
  output: string;
  action?: ChatToolEvent['action'];
};

const TOOL_BLOCK_PATTERN = /```mojo_tools\s*([\s\S]*?)```/g;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const getNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeToolResult = (result: string | AssistantToolResult): AssistantToolResult => {
  return typeof result === 'string' ? { output: result } : result;
};

const isAssistantToolName = (value: unknown): value is AssistantToolName => {
  return value === 'CreateWritingTopic' || value === 'Schedule' || value === 'ReadNews' || value === 'Memory' || value === 'Essays';
};

const titleFromContext = (context?: string) => {
  if (!context) return '';
  const titleLine = context.split('\n').find(line => line.toLowerCase().startsWith('title:'));
  return titleLine?.slice(titleLine.indexOf(':') + 1).trim() || '';
};

const parseToolRequests = (content: string): { cleanContent: string; requests: AssistantToolRequest[] } => {
  const requests: AssistantToolRequest[] = [];
  const matches = Array.from(content.matchAll(TOOL_BLOCK_PATTERN));
  for (const match of matches) {
    const rawPayload = match[1]?.trim();
    if (!rawPayload) continue;
    try {
      const parsed: unknown = JSON.parse(rawPayload);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (!isRecord(entry) || !isAssistantToolName(entry.toolName) || !isRecord(entry.args)) continue;
        requests.push({
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `tool-${Date.now()}-${requests.length}`,
          toolName: entry.toolName,
          args: entry.args,
        });
      }
    } catch {
      continue;
    }
  }

  return {
    cleanContent: content.replace(TOOL_BLOCK_PATTERN, '').trim(),
    requests,
  };
};

const joinAssistantContent = (previous: string, next: string) => {
  const left = previous.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
};

const formatToolRequestsForModel = (requests: AssistantToolRequest[]) => {
  if (requests.length === 0) return '';
  return [
    'Mojo requested local tools:',
    JSON.stringify(requests.map(request => ({ id: request.id, toolName: request.toolName, args: request.args })), null, 2),
  ].join('\n');
};

const formatToolResultsForModel = (events: ChatToolEvent[]) => {
  return [
    'Tool results for your previous local tool requests:',
    JSON.stringify(events.map(event => ({
      id: event.id,
      toolName: event.toolName,
      status: event.status,
      input: event.input,
      output: event.output || '',
    })), null, 2),
    'Use these tool results to continue your answer to the learner. If more local tools are needed, emit another single fenced mojo_tools block at the end; otherwise answer normally without a tool block.',
  ].join('\n\n');
};

const upsertTextPart = (parts: ChatMessagePart[], partId: string, content: string): ChatMessagePart[] => {
  const cleanContent = content.trim();
  const existingIndex = parts.findIndex(part => part.id === partId);
  if (!cleanContent) {
    return existingIndex === -1 ? parts : parts.filter(part => part.id !== partId);
  }

  const textPart: ChatMessagePart = { id: partId, type: 'text', content: cleanContent };
  if (existingIndex === -1) {
    return [...parts, textPart];
  }

  return parts.map(part => part.id === partId ? textPart : part);
};

const appendToolEventPart = (parts: ChatMessagePart[], toolEventId: string): ChatMessagePart[] => {
  if (parts.some(part => part.type === 'tool-event' && part.toolEventId === toolEventId)) {
    return parts;
  }

  return [...parts, { id: `${toolEventId}-part`, type: 'tool-event', toolEventId }];
};

interface AutoSendRequest {
  id: string;
  message: string;
  displayMessage?: string;
}

interface ChatAssistantProps {
  contextId: string; // Used to isolate conversations
  title?: string;
  description?: string;
  onClose?: () => void;
  className?: string;
  systemContext?: string; // Any context to inject silently or conceptually
  isEmbedded?: boolean;
  attachedContext?: string | null;
  attachedContextLabel?: string;
  onClearAttachedContext?: () => void;
  autoSendRequest?: AutoSendRequest | null;
}

export function ChatAssistant({ 
  contextId, 
  title, 
  description,
  onClose,
  className,
  systemContext,
  attachedContext,
  attachedContextLabel,
  onClearAttachedContext,
  autoSendRequest,
}: ChatAssistantProps) {
  const navigate = useNavigate();
  const {
    language,
    assistantReplyStyle,
    hasSeenAssistantStylePrompt,
    setAssistantReplyStyle,
    setHasSeenAssistantStylePrompt,
    upsertAssistantMemory,
    deleteAssistantMemory,
    essays,
    addAssistantSchedule,
  } = useAppStore();
  const t = translations[language];
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { sessions, addMessage, clearSession, updateMessage } = useChatStore();
  const messages = sessions[contextId] || [];

  const buildSystemPrompt = () => {
    const styleInstruction = assistantReplyStyle === 'precise'
      ? 'Reply style: Precise. Use concise, accurate language. Avoid unnecessary decoration.'
      : 'Reply style: Cute. Use a warmer, cuter tone, more emoticons when natural, and often refer to yourself as Mojo, for example “让Mojo来帮你……”.';
    const toolContract = [
      'You have local app tools. When you need a tool, include exactly one fenced block named mojo_tools at the end of your reply:',
      '```mojo_tools',
      '[{"toolName":"Memory","args":{"action":"list"}}]',
      '```',
      'Available tools:',
      '- CreateWritingTopic: args {title?: string, content?: string, source?: "news"|"story"}. Creates a writing topic and returns a chat card button the learner can click to open the Writing UI.',
      '- Schedule: args {title: string, content: string, dueAt: number}. Creates a planned push notification using a future Unix millisecond timestamp.',
      '- ReadNews: args {title: string}. Reads cached news content by title.',
      '- Memory: args {action: "create"|"list"|"read"|"update"|"delete", id?: string, title?: string, content?: string}.',
      '- Essays: args {action: "list"|"read"|"search", id?: string, query?: string}. Lists or reads user essays and AI evaluations.',
      'Never invent tool results. The app will execute valid tool requests and show results in the chat.',
    ].join('\n');

    return [
      t.assistantIdentityPrompt,
      styleInstruction,
      systemContext || t.helpfulAssistantPrompt,
      toolContract,
    ].filter(Boolean).join('\n\n');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async (message: string, options?: { displayMessage?: string }) => {
    const userText = message.trim();
    if (!userText || isTyping) return;
    const visibleUserText = options?.displayMessage?.trim() || userText;

    const effectiveUserText = attachedContext
      ? `${t.selectedSentencePrompt}\n"""${attachedContext}"""\n\n${userText}`
      : userText;
    const attachments: ChatAttachment[] = attachedContext
      ? [{ id: `${Date.now()}-attachment`, label: attachedContextLabel || t.selectedSentence, content: attachedContext }]
      : [];

    setInput('');
    onClearAttachedContext?.();
    setIsTyping(true);

    const currentMessages = useChatStore.getState().sessions[contextId] || [];

    addMessage(contextId, {
      id: Date.now().toString(),
      role: 'user',
      type: 'text',
      content: visibleUserText,
      modelContent: effectiveUserText,
      attachments,
      createdAt: Date.now()
    });

    const assistantMessageId = (Date.now() + 1).toString();
    addMessage(contextId, {
      id: assistantMessageId,
      role: 'assistant',
      type: 'text',
      content: '',
      createdAt: Date.now()
    });

    try {
      const { streamChatCompletion } = await import('../services/llm');

      const conversationHistory = currentMessages.map(m => ({
        role: m.role,
        content: m.modelContent || m.content
      }));

      conversationHistory.push({ role: 'user', content: effectiveUserText });

      let visibleAssistantContent = '';
      let visibleReasoning = '';
      const toolEvents: ChatToolEvent[] = [];
      let assistantParts: ChatMessagePart[] = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const baseContent = visibleAssistantContent;
        const baseReasoning = visibleReasoning;
        const roundTextPartId = `${assistantMessageId}-round-${round}`;
        let roundContent = '';
        let roundReasoning = '';

        await streamChatCompletion(conversationHistory, buildSystemPrompt(), (partialContent, partialReasoning) => {
          roundContent = partialContent;
          roundReasoning = partialReasoning;
          assistantParts = upsertTextPart(assistantParts, roundTextPartId, partialContent);
          updateMessage(contextId, assistantMessageId, {
            content: joinAssistantContent(baseContent, partialContent),
            reasoning: joinAssistantContent(baseReasoning, partialReasoning),
            toolEvents: [...toolEvents],
            parts: [...assistantParts],
          });
        }, { task: 'assistant-chat' });

        const { cleanContent, requests } = parseToolRequests(roundContent);
        visibleAssistantContent = joinAssistantContent(baseContent, cleanContent);
        visibleReasoning = joinAssistantContent(baseReasoning, roundReasoning);
        assistantParts = upsertTextPart(assistantParts, roundTextPartId, cleanContent);
        updateMessage(contextId, assistantMessageId, {
          content: visibleAssistantContent,
          reasoning: visibleReasoning,
          toolEvents: [...toolEvents],
          parts: [...assistantParts],
        });

        conversationHistory.push({
          role: 'assistant',
          content: cleanContent || formatToolRequestsForModel(requests) || 'Mojo is continuing the conversation.',
        });

        if (requests.length === 0) {
          break;
        }

        const roundEvents: ChatToolEvent[] = [];
        for (const request of requests) {
          const startedEvent: ChatToolEvent = {
            id: request.id,
            toolName: request.toolName,
            status: 'requested',
            input: JSON.stringify(request.args),
            createdAt: Date.now(),
          };
          toolEvents.push(startedEvent);
          roundEvents.push(startedEvent);
          assistantParts = appendToolEventPart(assistantParts, startedEvent.id);
          updateMessage(contextId, assistantMessageId, { toolEvents: [...toolEvents], parts: [...assistantParts] });
          const completedEvent = await executeToolRequest(request);
          toolEvents[toolEvents.length - 1] = completedEvent;
          roundEvents[roundEvents.length - 1] = completedEvent;
          updateMessage(contextId, assistantMessageId, { toolEvents: [...toolEvents], parts: [...assistantParts] });
        }

        conversationHistory.push({ role: 'user', content: formatToolResultsForModel(roundEvents) });

        if (round === MAX_TOOL_ROUNDS - 1) {
          const limitNotice = assistantReplyStyle === 'precise'
            ? 'Tool limit reached. I used the available results above; ask again if you need another action.'
            : 'Mojo 已经完成这一轮工具调用啦～如果还想继续操作，可以再告诉 Mojo 一次 (｡•̀ᴗ-)✧';
          visibleAssistantContent = joinAssistantContent(visibleAssistantContent, limitNotice);
          assistantParts = upsertTextPart(assistantParts, `${assistantMessageId}-tool-limit`, limitNotice);
          updateMessage(contextId, assistantMessageId, { content: visibleAssistantContent, toolEvents: [...toolEvents], parts: [...assistantParts] });
        }
      }

    } catch (error) {
      console.error(error);
      updateMessage(contextId, assistantMessageId, { content: `Error: ${getErrorMessage(error, language)}` });
    } finally {
      setIsTyping(false);
    }
  };

  const executeToolRequest = async (request: AssistantToolRequest): Promise<ChatToolEvent> => {
    const baseEvent: ChatToolEvent = {
      id: request.id,
      toolName: request.toolName,
      status: 'requested',
      input: JSON.stringify(request.args),
      createdAt: Date.now(),
    };
    try {
      const result = normalizeToolResult(await runAssistantTool(request));
      return { ...baseEvent, status: 'completed', output: result.output, action: result.action, completedAt: Date.now() };
    } catch (error) {
      return { ...baseEvent, status: 'failed', output: getErrorMessage(error, language), completedAt: Date.now() };
    }
  };

  const runAssistantTool = async (request: AssistantToolRequest): Promise<string | AssistantToolResult> => {
    const args = request.args;
    if (request.toolName === 'CreateWritingTopic') {
      const { generateWritingTopic } = await import('../services/writingTopicService');
      const source = getString(args.source) === 'story' ? 'story' : 'news';
      const title = getString(args.title) || titleFromContext(systemContext) || 'Mojo writing topic';
      const content = getString(args.content) || systemContext || title;
      const topic = await generateWritingTopic({ source, title, content, language });
      return {
        output: language === 'zh' ? `写作题目已生成：${topic}` : `Writing topic ready: ${topic}`,
        action: {
          type: 'open-writing',
          payload: {
            topic,
            sourceTitle: title,
            sourceType: source,
            sourceContent: content,
          },
        },
      };
    }

    if (request.toolName === 'Schedule') {
      const title = getString(args.title) || 'Mojo Reminder';
      const content = getString(args.content) || 'Mojo has a reminder for you.';
      const dueAt = getNumber(args.dueAt);
      if (!dueAt) throw new Error('Schedule requires dueAt as a future Unix millisecond timestamp.');
      const { NotificationService } = await import('../services/notificationService');
      await NotificationService.scheduleAssistantNotification(title, content, dueAt, `assistant-${request.id}`);
      addAssistantSchedule({ id: request.id, title, content, dueAt });
      return `Scheduled “${title}” for ${new Date(dueAt).toLocaleString()}.`;
    }

    if (request.toolName === 'ReadNews') {
      const query = getString(args.title);
      if (!query) throw new Error('ReadNews requires a title.');
      const { searchCachedNewsArticlesByTitle } = await import('../services/dictionaryDb');
      const articles = await searchCachedNewsArticlesByTitle(query, 3);
      if (articles.length === 0) return `No cached news article matched “${query}”.`;
      return articles.map(article => [
        `Title: ${article.title}`,
        `Source: ${article.source}`,
        `Content: ${article.paragraphs.join('\n')}`,
      ].join('\n')).join('\n\n---\n\n');
    }

    if (request.toolName === 'Memory') {
      const action = getString(args.action);
      if (action === 'list') {
        const assistantMemories = useAppStore.getState().assistantMemories;
        return assistantMemories.length
          ? assistantMemories.map(memory => `${memory.id}: ${memory.title} — ${memory.content}`).join('\n')
          : 'No memories saved yet.';
      }
      const id = getString(args.id) || `memory-${Date.now()}`;
      if (action === 'delete') {
        deleteAssistantMemory(id);
        return `Deleted memory ${id}.`;
      }
      if (action === 'read') {
        const assistantMemories = useAppStore.getState().assistantMemories;
        const memory = assistantMemories.find(item => item.id === id);
        return memory ? `${memory.title}\n${memory.content}` : `Memory ${id} was not found.`;
      }
      if (action === 'create' || action === 'update') {
        const title = getString(args.title) || 'Mojo memory';
        const content = getString(args.content);
        if (!content) throw new Error('Memory create/update requires content.');
        const assistantMemories = useAppStore.getState().assistantMemories;
        const existing = assistantMemories.find(item => item.id === id);
        const memory = upsertAssistantMemory({ id, title, content, createdAt: existing?.createdAt });
        return `Saved memory ${memory.id}: ${memory.title}`;
      }
      throw new Error('Memory action must be create, list, read, update, or delete.');
    }

    if (request.toolName === 'Essays') {
      const action = getString(args.action) || 'list';
      const query = getString(args.query).toLowerCase();
      if (action === 'list' || action === 'search') {
        const filteredEssays = query
          ? essays.filter(essay => [essay.title, essay.content, essay.topic, essay.evaluationSummary].some(value => value?.toLowerCase().includes(query)))
          : essays;
        return filteredEssays.length
          ? filteredEssays.slice(0, 10).map(essay => `${essay.id}: ${essay.title || 'Untitled'} (${essay.evaluationScore ?? 'no score'}) — ${essay.evaluationSummary || 'No evaluation yet.'}`).join('\n')
          : 'No essays matched.';
      }
      if (action === 'read') {
        const id = getString(args.id);
        const essay = essays.find(item => item.id === id);
        if (!essay) return `Essay ${id} was not found.`;
        return [
          `Title: ${essay.title}`,
          essay.topic ? `Topic: ${essay.topic}` : '',
          `Content:\n${essay.content || 'No content yet.'}`,
          essay.evaluationScore !== undefined ? `Score: ${essay.evaluationScore}` : '',
          essay.evaluationSummary ? `Evaluation: ${essay.evaluationSummary}` : 'No evaluation yet.',
        ].filter(Boolean).join('\n');
      }
      throw new Error('Essays action must be list, search, or read.');
    }

    throw new Error(`Unsupported tool: ${request.toolName}`);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await sendMessage(input);
  };

  useEffect(() => {
    if (!autoSendRequest || consumedAutoSendRequestIds.has(autoSendRequest.id)) {
      return;
    }

    if (isTyping) {
      return;
    }

    consumedAutoSendRequestIds.add(autoSendRequest.id);
    void sendMessage(autoSendRequest.message, { displayMessage: autoSendRequest.displayMessage });
  }, [autoSendRequest, isTyping]);

  const clearChat = () => {
    useAppStore.getState().showAlert({
      message: t.clearConversationConfirm,
      isConfirm: true,
      onConfirm: () => {
        clearSession(contextId);
      }
    });
  };

  const renderToolEvent = (event: ChatToolEvent) => {
    const hasOpenWritingAction = event.action?.type === 'open-writing';

    return (
      <div key={event.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white/80 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
        {hasOpenWritingAction && (
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => navigate('/writing', { state: event.action?.payload })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-600"
            >
              <PenLine size={14} />
              {t.openWritingTopic}
            </button>
          </div>
        )}
        <details open={hasOpenWritingAction}>
          <summary className="cursor-pointer select-none p-2 font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {event.status === 'failed' ? t.assistantToolFailed : event.status === 'completed' ? t.assistantToolResult : t.assistantToolCall}: {event.toolName}
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-2 dark:border-slate-800">
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2 text-[10px] dark:bg-slate-950">{event.input}</pre>
            {event.output && <pre className="whitespace-pre-wrap break-words rounded-lg bg-blue-50 p-2 text-[10px] dark:bg-blue-950/40">{event.output}</pre>}
          </div>
        </details>
      </div>
    );
  };

  const renderTimelineParts = (parts: ChatMessagePart[], toolEvents: ChatToolEvent[] = []) => {
    return parts.map((part) => {
      if (part.type === 'text') {
        return part.content ? <Markdown key={part.id} remarkPlugins={[remarkGfm]}>{part.content}</Markdown> : null;
      }

      const event = toolEvents.find(item => item.id === part.toolEventId);
      return event ? renderToolEvent(event) : null;
    });
  };

  return (
    <div className={cn("flex flex-col bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] md:rounded-[32px] shadow-xl overflow-hidden", className)}>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Wand2 size={16} className="text-blue-500" />
            {title || t.chatAssistant}
          </h3>
          <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description || t.chatDefaultDescription}</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button 
              onClick={clearChat}
              className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              title={t.clearContext}
            >
              <Trash2 size={16} />
            </button>
          )}
          {onClose && (
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 block lg:hidden"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 dark:text-slate-500 text-sm mt-10">
            {t.noMessagesYet}
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex max-w-[85%] w-fit", msg.role === 'user' ? "self-end" : "self-start")}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                <Wand2 size={12} className="text-blue-600 dark:text-blue-400 md:w-4 md:h-4" />
              </div>
            )}
            <div className={cn(
              "rounded-2xl p-3 md:p-4 text-sm shadow-sm",
              msg.role === 'user' 
                ? "bg-slate-800 dark:bg-blue-600 text-white rounded-tr-sm" 
                : "bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-100 dark:border-slate-700/50"
            )}>
              {msg.type === 'evaluation' && msg.evaluation ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Wand2 size={14} className="text-blue-500" />
                      {t.analysisReport}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-bold",
                      msg.evaluation.score >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      msg.evaluation.score >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    )}>
                      {msg.evaluation.score}/100
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 text-xs md:text-sm leading-relaxed">
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.evaluation.summary}</Markdown>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700/50">
                    {Object.entries(msg.evaluation.annotations.reduce((acc: Record<string, number>, curr) => {
                      acc[curr.type] = (acc[curr.type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)).map(([type, count]) => (
                      <div key={type} className="px-2 py-1 bg-white dark:bg-slate-900 rounded-lg text-[10px] text-slate-500 capitalize border border-slate-100 dark:border-slate-800">
                        {count as number} {type as string}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={cn("markdown-body space-y-4", msg.role === 'user' ? 'text-white' : '')}>
                  {msg.reasoning && (
                    <details className="text-slate-500 text-xs border border-slate-200 dark:border-slate-700/50 rounded-lg bg-slate-100/50 dark:bg-slate-900/50 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="cursor-pointer font-medium p-2 select-none hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-2 rounded-lg">
                        <Wand2 size={12} className="text-slate-400" />
                        {t.thoughtProcess}
                      </summary>
                      <div className="p-3 pt-0 whitespace-pre-wrap font-mono leading-relaxed opacity-80 border-t border-slate-200 dark:border-slate-700/50 mt-1">
                        {msg.reasoning}
                      </div>
                    </details>
                  )}
                  {msg.parts?.length ? (
                    renderTimelineParts(msg.parts, msg.toolEvents)
                  ) : msg.content ? (
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                  ) : msg.role === 'assistant' && msg.reasoning ? (
                    <div className="text-xs text-slate-400 italic">{t.thinking}</div>
                  ) : null}
                  {msg.attachments?.map((attachment) => (
                    <div key={attachment.id} className={cn(
                      "rounded-xl border p-2 text-xs leading-relaxed",
                      msg.role === 'user'
                        ? "border-white/20 bg-white/10 text-white/90"
                        : "border-blue-100 bg-blue-50/70 text-slate-600 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-slate-300"
                    )}>
                      <div className="mb-1 font-bold">{attachment.label}</div>
                      <div className="line-clamp-4">“{attachment.content}”</div>
                    </div>
                  ))}
                  {!msg.parts?.length && msg.toolEvents?.map((event) => renderToolEvent(event))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 ml-2 mt-1 shadow-sm">
                <UserIcon size={12} className="text-slate-500 dark:text-slate-400 md:w-4 md:h-4" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex max-w-[85%]">
             <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                <Wand2 size={12} className="text-blue-600 dark:text-blue-400 md:w-4 md:h-4" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl rounded-tl-sm p-4 border border-slate-100 dark:border-slate-700/50 flex items-center gap-1">
                <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
              </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 md:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B1120]/50 backdrop-blur z-10 shrink-0">
        {!hasSeenAssistantStylePrompt && messages.some(message => message.role === 'assistant' && message.content.trim()) && (
          <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800 shadow-sm dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            <div className="mb-2 font-bold">{t.assistantStyleModalTitle}</div>
            <p className="mb-3 leading-relaxed">{t.assistantStyleModalDesc}</p>
            <div className="flex gap-2">
              {(['cute', 'precise'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => {
                    setAssistantReplyStyle(style);
                    setHasSeenAssistantStylePrompt(true);
                    useAppStore.getState().showAlert(t.assistantStyleModalSaved);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                    assistantReplyStyle === style
                      ? "bg-amber-500 text-white"
                      : "bg-white text-amber-700 hover:bg-amber-100 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
                  )}
                >
                  {style === 'cute' ? t.assistantStyleCute : t.assistantStylePrecise}
                </button>
              ))}
            </div>
          </div>
        )}
        {attachedContext && (
          <div className="mb-2 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-900/20 p-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="mb-1 flex items-center justify-between gap-2 font-bold text-blue-600 dark:text-blue-400">
              <span>{attachedContextLabel || t.selectedSentence}</span>
              {onClearAttachedContext && (
                <button
                  type="button"
                  onClick={onClearAttachedContext}
                  className="rounded-full p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/50 dark:hover:text-blue-300"
                  aria-label={t.clearSelectedSentence}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <p className="line-clamp-2 leading-relaxed">“{attachedContext}”</p>
          </div>
        )}
        <form onSubmit={handleSend} className="relative flex items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.typeMessage}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl md:rounded-3xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none min-h-[44px] md:min-h-[50px] max-h-[120px] shadow-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            rows={1}
            style={{
              height: input ? Math.min(120, Math.max(50, input.split('\n').length * 24 + 26)) : 50
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 bottom-2 md:bottom-2.5 p-1.5 md:p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white rounded-xl md:rounded-2xl transition-colors shadow-sm disabled:shadow-none"
          >
            <Send size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );
}
