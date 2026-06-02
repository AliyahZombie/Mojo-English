import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'evaluation';
  content: string;
  reasoning?: string;
  createdAt: number;
  // Payload for evaluation types
  evaluation?: {
    score: number;
    summary: string;
    annotations: any[];
    contentSnapshot: string;
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
