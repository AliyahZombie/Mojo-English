import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, User as UserIcon, Wand2, X, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../store/useChatStore';
import { useAppStore } from '../store/useAppStore';
import { translations, type Language } from '../lib/i18n';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const getErrorMessage = (error: unknown, language: Language) => error instanceof Error ? error.message : translations[language].chatFetchError;

const consumedAutoSendRequestIds = new Set<string>();

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
  const { language } = useAppStore();
  const t = translations[language];
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { sessions, addMessage, clearSession, updateMessage } = useChatStore();
  const messages = sessions[contextId] || [];

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

    setInput('');
    onClearAttachedContext?.();
    setIsTyping(true);

    const currentMessages = useChatStore.getState().sessions[contextId] || [];

    addMessage(contextId, {
      id: Date.now().toString(),
      role: 'user',
      type: 'text',
      content: visibleUserText,
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

      const sessionHistory = currentMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      sessionHistory.push({ role: 'user', content: effectiveUserText });

      await streamChatCompletion(sessionHistory, systemContext || t.helpfulAssistantPrompt, (partialContent, partialReasoning) => {
        updateMessage(contextId, assistantMessageId, { content: partialContent, reasoning: partialReasoning });
      }, { task: 'assistant-chat' });

    } catch (error) {
      console.error(error);
      updateMessage(contextId, assistantMessageId, { content: `Error: ${getErrorMessage(error, language)}` });
    } finally {
      setIsTyping(false);
    }
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
                  {msg.content ? (
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                  ) : msg.role === 'assistant' && msg.reasoning ? (
                    <div className="text-xs text-slate-400 italic">{t.thinking}</div>
                  ) : null}
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
