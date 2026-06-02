import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language } from '../lib/i18n';
import type { NewsShortAnswerEvaluation } from '../services/newsTypes';

const defaultNewsdataApiKey = import.meta.env.VITE_NEWSDATA_API_KEY || '';
const defaultTavilyApiKey = import.meta.env.VITE_TAVILY_API_KEY || '';

export interface Provider {
  id: string;
  name: string;
  type: 'OPENAI' | 'GEMINI' | 'CLAUDE';
  baseUrl: string;
  apiKey: string;
  models: string[];
  activeModel: string;
  taskModels?: Partial<Record<LlmTask, string>>;
}

export type LlmTask =
  | 'assistant-chat'
  | 'article-parsing'
  | 'dictionary-lookup'
  | 'writing-evaluation'
  | 'news-optimization'
  | 'quiz-evaluation';

export const LLM_TASK_LABELS: Record<LlmTask, string> = {
  'assistant-chat': '助手聊天',
  'article-parsing': '文章解析',
  'dictionary-lookup': '查词',
  'writing-evaluation': '作文评估',
  'news-optimization': '新闻界面优化 / 语言过滤',
  'quiz-evaluation': 'Quiz 出题与简答评估',
};

export interface Deck {
  id: string;
  name: string;
  words: string[];
  createdAt: number;
}

export interface EssayAnnotation {
  id: string;
  startIndex: number;
  endIndex: number;
  suggestion: string;
  reason: string;
  type: 'grammar' | 'vocabulary' | 'style' | 'overlap';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'evaluation';
  content: string;
  createdAt: number;
  evaluation?: {
    score: number;
    summary: string;
    annotations: EssayAnnotation[];
    contentSnapshot: string;
  };
}

export interface Essay {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  annotations?: EssayAnnotation[];
  evaluationScore?: number;
  evaluationSummary?: string;
  messages?: ChatMessage[];
}

export interface AlertData {
  title?: string;
  message: string;
  isConfirm?: boolean;
  variant?: 'default' | 'analytics-consent';
  cancelText?: string;
  confirmText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface NewsQuizArticleState {
  selectedOption: number | null;
  answerSubmitted: boolean;
  shortAnswerDraft: string;
  shortAnswerEvaluation: NewsShortAnswerEvaluation | null;
}

export type NewsQuizStateByArticleId = Record<string, NewsQuizArticleState>;

interface AppState {
  hasConfigured: boolean;
  analyticsConsent: boolean | null;
  analyticsConsentSetAt: number | null;
  analyticsOnlineUsers: number;
  upstashQstashToken: string;
  newsdataApiKey: string;
  tavilyApiKey: string;
  webhookUrl: string;
  webhookHeaders: string;
  webhookTemplate: string;
  activeProviderId: string;
  providers: Provider[];
  preferences: string[];
  theme: 'light' | 'dark';
  language: Language;
  dailyGoal: number;
  decks: Deck[];
  activeDeckId: string | null;
  essays: Essay[];
  activeEssayId: string | null;
  newsQuizStates: NewsQuizStateByArticleId;
  
  isAssistantOpen: boolean;
  alertData: AlertData | null;
  
  setHasConfigured: (val: boolean) => void;
  setAnalyticsConsent: (val: boolean) => void;
  setAnalyticsOnlineUsers: (count: number) => void;
  setNewsdataApiKey: (apiKey: string) => void;
  setTavilyApiKey: (apiKey: string) => void;
  setNotificationConfig: (token: string, url: string, headers: string, template: string) => void;
  replaceProviders: (providers: Provider[], activeProviderId: string) => void;
  setActiveProviderId: (id: string) => void;
  addProvider: (provider: Provider) => void;
  updateProvider: (id: string, provider: Provider) => void;
  deleteProvider: (id: string) => void;
  setPreferences: (prefs: string[]) => void;
  setDailyGoal: (goal: number) => void;
  toggleTheme: () => void;
  toggleAssistant: () => void;
  showAlert: (data: AlertData | string) => void;
  clearAlert: () => void;
  setLanguage: (lang: Language) => void;
  addDeck: (deck: Deck) => void;
  setActiveDeckId: (deckId: string | null) => void;
  deleteDeck: (deckId: string) => void;
  addEssay: (essay: Essay) => void;
  updateEssay: (id: string, essay: Partial<Essay>) => void;
  deleteEssay: (id: string) => void;
  setActiveEssayId: (id: string | null) => void;
  setNewsQuizArticleState: (articleId: string, updates: Partial<NewsQuizArticleState>) => void;
}

function createDefaultNewsQuizArticleState(): NewsQuizArticleState {
  return {
    selectedOption: null,
    answerSubmitted: false,
    shortAnswerDraft: '',
    shortAnswerEvaluation: null,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasConfigured: false,
      analyticsConsent: null,
      analyticsConsentSetAt: null,
      analyticsOnlineUsers: 0,
      upstashQstashToken: '',
      newsdataApiKey: defaultNewsdataApiKey,
      tavilyApiKey: defaultTavilyApiKey,
      webhookUrl: 'https://api.telegram.org/bot$telegram_bot_token/sendMessage',
      webhookHeaders: '',
      webhookTemplate: '{\n  "chat_id": 00000000,\n  "text": "$title:$content"\n}',
      activeProviderId: 'default-gemini',
      providers: [
        {
          id: 'default-gemini',
          type: 'GEMINI',
          name: 'Gemini (Default)',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKey: '',
          models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
          activeModel: 'gemini-1.5-flash',
        }
      ],
      preferences: [],
      dailyGoal: 5,
      theme: 'light',
      language: 'zh',
      decks: [],
      activeDeckId: null,
      essays: [],
      activeEssayId: null,
      newsQuizStates: {},
      isAssistantOpen: false,
      alertData: null,
      
      setHasConfigured: (val) => set({ hasConfigured: val }),
      setAnalyticsConsent: (val) => set({ analyticsConsent: val, analyticsConsentSetAt: Date.now() }),
      setAnalyticsOnlineUsers: (count) => set({ analyticsOnlineUsers: Math.max(0, count) }),
      setNewsdataApiKey: (apiKey) => set({ newsdataApiKey: apiKey.trim() || defaultNewsdataApiKey }),
      setTavilyApiKey: (apiKey) => set({ tavilyApiKey: apiKey.trim() || defaultTavilyApiKey }),
      setNotificationConfig: (token, url, headers, template) => set({ upstashQstashToken: token, webhookUrl: url, webhookHeaders: headers, webhookTemplate: template }),
      replaceProviders: (providers, activeProviderId) => set({ providers, activeProviderId }),
      setActiveProviderId: (id) => set({ activeProviderId: id }),
      addProvider: (provider) => set((state) => ({ providers: [...(Array.isArray(state.providers) ? state.providers : []), provider] })),
      updateProvider: (id, provider) => set((state) => ({
        providers: (Array.isArray(state.providers) ? state.providers : []).map(p => p.id === id ? provider : p)
      })),
      deleteProvider: (id: string) => set((state) => {
        const provs = Array.isArray(state.providers) ? state.providers : [];
        return {
          providers: provs.filter(p => p.id !== id),
          activeProviderId: state.activeProviderId === id ? (provs.find(p => p.id !== id)?.id || '') : state.activeProviderId
        };
      }),
      setPreferences: (prefs) => set({ preferences: prefs }),
      setDailyGoal: (goal) => set({ dailyGoal: goal }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      toggleAssistant: () => set((state) => ({ isAssistantOpen: !state.isAssistantOpen })),
      showAlert: (data) => set({ alertData: typeof data === 'string' ? { message: data } : data }),
      clearAlert: () => set({ alertData: null }),
      setLanguage: (lang) => set({ language: lang }),
      addDeck: (deck) => set((state) => ({ decks: [...state.decks, deck] })),
      setActiveDeckId: (id) => set({ activeDeckId: id }),
      deleteDeck: (id) => set((state) => ({ 
        decks: state.decks.filter(d => d.id !== id), 
        activeDeckId: state.activeDeckId === id ? null : state.activeDeckId 
      })),
      addEssay: (essay) => set((state) => ({ essays: [essay, ...state.essays], activeEssayId: essay.id })),
      updateEssay: (id, updates) => set((state) => ({
        essays: state.essays.map(e => e.id === id ? { ...e, ...updates } : e)
      })),
      deleteEssay: (id) => set((state) => ({
        essays: state.essays.filter(e => e.id !== id),
        activeEssayId: state.activeEssayId === id ? null : state.activeEssayId
      })),
      setActiveEssayId: (id) => set({ activeEssayId: id }),
      setNewsQuizArticleState: (articleId, updates) => set((state) => ({
        newsQuizStates: {
          ...state.newsQuizStates,
          [articleId]: {
            ...(state.newsQuizStates[articleId] ?? createDefaultNewsQuizArticleState()),
            ...updates,
          },
        },
      })),
    }),
    {
      name: 'mojo-app-store',
      partialize: (state) => ({ 
        hasConfigured: state.hasConfigured,
        analyticsConsent: state.analyticsConsent,
        analyticsConsentSetAt: state.analyticsConsentSetAt,
        upstashQstashToken: state.upstashQstashToken,
        newsdataApiKey: state.newsdataApiKey.trim() || defaultNewsdataApiKey,
        tavilyApiKey: state.tavilyApiKey.trim() || defaultTavilyApiKey,
        webhookUrl: state.webhookUrl,
        webhookHeaders: state.webhookHeaders,
        webhookTemplate: state.webhookTemplate,
        activeProviderId: state.activeProviderId,
        providers: state.providers,
        preferences: state.preferences,
        theme: state.theme,
        language: state.language,
        dailyGoal: state.dailyGoal,
        decks: state.decks,
        activeDeckId: state.activeDeckId,
        essays: state.essays,
        activeEssayId: state.activeEssayId,
        newsQuizStates: state.newsQuizStates
      })
    }
  )
);
