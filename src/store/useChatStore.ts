import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EssayAnnotation } from './useAppStore';

export interface ChatAttachment {
  id: string;
  label: string;
  content: string;
}

export interface ChatToolEvent {
  id: string;
  toolName: 'CreateWritingTopic' | 'Schedule' | 'ReadNews' | 'Memory' | 'Essays';
  status: 'requested' | 'completed' | 'failed';
  input: string;
  output?: string;
  action?: {
    type: 'open-writing';
    label?: string;
    payload: {
      topic: string;
      sourceTitle?: string;
      sourceType?: 'story' | 'news';
      sourceContent?: string;
    };
  };
  createdAt: number;
  completedAt?: number;
}

export type ChatMessagePart =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'tool-event'; toolEventId: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'evaluation';
  content: string;
  reasoning?: string;
  createdAt: number;
  modelContent?: string;
  attachments?: ChatAttachment[];
  toolEvents?: ChatToolEvent[];
  parts?: ChatMessagePart[];
  // Payload for evaluation types
  evaluation?: {
    score: number;
    summary: string;
    annotations: EssayAnnotation[];
    contentSnapshot: string;
    topic?: string;
    sourceTitle?: string;
    sourceType?: 'story' | 'news';
    sourceContent?: string;
  };
}

interface ChatState {
  sessions: Record<string, ChatMessage[]>; // dictionary by contextId
  addMessage: (contextId: string, message: ChatMessage) => void;
  updateMessage: (contextId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  clearSession: (contextId: string) => void;
  setSession: (contextId: string, messages: ChatMessage[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessions: {},
      addMessage: (contextId, message) => 
        set((state) => ({
          sessions: {
            ...state.sessions,
            [contextId]: [...(state.sessions[contextId] || []), message]
          }
        })),
      updateMessage: (contextId, messageId, updates) => 
        set((state) => {
          const sessionMsg = state.sessions[contextId] || [];
          return {
            sessions: {
              ...state.sessions,
              [contextId]: sessionMsg.map(m => m.id === messageId ? { ...m, ...updates } : m)
            }
          };
        }),
      clearSession: (contextId) => 
        set((state) => ({
          sessions: {
            ...state.sessions,
            [contextId]: []
          }
        })),
      setSession: (contextId, messages) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            [contextId]: messages
          }
        })),
    }),
    {
      name: 'mojo-chat-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
