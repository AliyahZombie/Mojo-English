import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language } from '../lib/i18n';
import type { NewsShortAnswerEvaluation } from '../services/newsTypes';

const defaultNewsdataApiKey = import.meta.env.VITE_NEWSDATA_API_KEY || '';
const defaultTavilyApiKey = import.meta.env.VITE_TAVILY_API_KEY || '';

export const DEFAULT_STORY_PROMPT = 'Write an engaging, coherent English story for language learners. Keep the story concise, natural, and easy to read.';

export type AssistantReplyStyle = 'cute' | 'precise';

export interface NewsCompletionRecord {
  articleId: string;
  title: string;
  completedAt: number;
}

export type NewsHistoryByDate = Record<string, NewsCompletionRecord[]>;

export interface AssistantMemoryRecord {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantScheduleRecord {
  id: string;
  title: string;
  content: string;
  dueAt: number;
  createdAt: number;
  status: 'planned' | 'sent' | 'failed';
  errorMessage?: string;
}

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
  | 'writing-topic-generation'
  | 'news-optimization'
  | 'quiz-evaluation'
  | 'story-generation';

export const LLM_TASK_LABELS: Record<LlmTask, string> = {
  'assistant-chat': '助手聊天',
  'article-parsing': '文章解析',
  'dictionary-lookup': '查词',
  'writing-evaluation': '作文评估',
  'writing-topic-generation': '写作题目生成',
  'news-optimization': '新闻界面优化 / 语言过滤',
  'quiz-evaluation': 'Quiz 出题与简答评估',
  'story-generation': 'Story 故事生成',
};

export interface Deck {
  id: string;
  name: string;
  words: string[];
  createdAt: number;
  useFrequencyOrder?: boolean;
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
    topic?: string;
    sourceTitle?: string;
    sourceType?: 'story' | 'news';
    sourceContent?: string;
  };
}

export interface Essay {
  id: string;
  title: string;
  content: string;
  topic?: string;
  sourceTitle?: string;
  sourceType?: 'story' | 'news';
  sourceContent?: string;
  createdAt: number;
  updatedAt: number;
  annotations?: EssayAnnotation[];
  evaluationScore?: number;
  evaluationSummary?: string;
  messages?: ChatMessage[];
}

export interface Story {
  id: string;
  title: string;
  content: string;
  words: string[];
  createdAt: number;
  deckId: string | null;
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
  storyPrompt: string;
  preferences: string[];
  theme: 'light' | 'dark';
  language: Language;
  dailyGoal: number;
  decks: Deck[];
  activeDeckId: string | null;
  essays: Essay[];
  stories: Story[];
  activeEssayId: string | null;
  newsQuizStates: NewsQuizStateByArticleId;
  newsHistoryByDate: NewsHistoryByDate;
  assistantReplyStyle: AssistantReplyStyle;
  hasSeenAssistantStylePrompt: boolean;
  hasDismissedNotificationSetupReminder: boolean;
  assistantMemories: AssistantMemoryRecord[];
  assistantSchedules: AssistantScheduleRecord[];
  
  isAssistantOpen: boolean;
  alertData: AlertData | null;
  
  setHasConfigured: (val: boolean) => void;
  setAnalyticsConsent: (val: boolean) => void;
  setAnalyticsOnlineUsers: (count: number) => void;
  setNewsdataApiKey: (apiKey: string) => void;
  setTavilyApiKey: (apiKey: string) => void;
  setNotificationConfig: (token: string, url: string, headers: string, template: string) => void;
  replaceProviders: (providers: Provider[], activeProviderId: string) => void;
  setStoryPrompt: (prompt: string) => void;
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
  updateDeck: (deckId: string, updates: Partial<Pick<Deck, 'name' | 'words' | 'useFrequencyOrder'>>) => void;
  addWordToDeck: (deckId: string, word: string) => void;
  setActiveDeckId: (deckId: string | null) => void;
  deleteDeck: (deckId: string) => void;
  addEssay: (essay: Essay) => void;
  updateEssay: (id: string, essay: Partial<Essay>) => void;
  deleteEssay: (id: string) => void;
  setActiveEssayId: (id: string | null) => void;
  addStory: (story: Story) => void;
  deleteStory: (id: string) => void;
  setNewsQuizArticleState: (articleId: string, updates: Partial<NewsQuizArticleState>) => void;
  recordNewsCompletion: (record: Omit<NewsCompletionRecord, 'completedAt'> & { completedAt?: number }) => void;
  setAssistantReplyStyle: (style: AssistantReplyStyle) => void;
  setHasSeenAssistantStylePrompt: (seen: boolean) => void;
  setHasDismissedNotificationSetupReminder: (dismissed: boolean) => void;
  upsertAssistantMemory: (memory: Omit<AssistantMemoryRecord, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }) => AssistantMemoryRecord;
  deleteAssistantMemory: (id: string) => void;
  addAssistantSchedule: (schedule: Omit<AssistantScheduleRecord, 'createdAt' | 'status'> & { createdAt?: number; status?: AssistantScheduleRecord['status'] }) => AssistantScheduleRecord;
  updateAssistantSchedule: (id: string, updates: Partial<AssistantScheduleRecord>) => void;
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
      storyPrompt: DEFAULT_STORY_PROMPT,
      preferences: [],
      dailyGoal: 5,
      theme: 'light',
      language: 'zh',
      decks: [],
      activeDeckId: null,
      essays: [],
      stories: [],
      activeEssayId: null,
      newsQuizStates: {},
      newsHistoryByDate: {},
      assistantReplyStyle: 'cute',
      hasSeenAssistantStylePrompt: false,
      hasDismissedNotificationSetupReminder: false,
      assistantMemories: [],
      assistantSchedules: [],
      isAssistantOpen: false,
      alertData: null,
      
      setHasConfigured: (val) => set({ hasConfigured: val }),
      setAnalyticsConsent: (val) => set({ analyticsConsent: val, analyticsConsentSetAt: Date.now() }),
      setAnalyticsOnlineUsers: (count) => set({ analyticsOnlineUsers: Math.max(0, count) }),
      setNewsdataApiKey: (apiKey) => set({ newsdataApiKey: apiKey.trim() || defaultNewsdataApiKey }),
      setTavilyApiKey: (apiKey) => set({ tavilyApiKey: apiKey.trim() || defaultTavilyApiKey }),
      setNotificationConfig: (token, url, headers, template) => set({ upstashQstashToken: token, webhookUrl: url, webhookHeaders: headers, webhookTemplate: template }),
      replaceProviders: (providers, activeProviderId) => set({ providers, activeProviderId }),
      setStoryPrompt: (prompt) => set({ storyPrompt: prompt }),
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
      updateDeck: (id, updates) => set((state) => ({
        decks: state.decks.map(deck => deck.id === id ? { ...deck, ...updates } : deck)
      })),
      addWordToDeck: (id, word) => set((state) => {
        const normalizedWord = word.trim().toLowerCase();
        if (!normalizedWord) return {};

        return {
          decks: state.decks.map(deck => {
            if (deck.id !== id) return deck;
            if (deck.words.some(entry => entry.toLowerCase() === normalizedWord)) return deck;
            return { ...deck, words: [...deck.words, normalizedWord] };
          })
        };
      }),
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
      addStory: (story) => set((state) => ({ stories: [story, ...state.stories] })),
      deleteStory: (id) => set((state) => ({ stories: state.stories.filter(story => story.id !== id) })),
      setNewsQuizArticleState: (articleId, updates) => set((state) => ({
        newsQuizStates: {
          ...state.newsQuizStates,
          [articleId]: {
            ...(state.newsQuizStates[articleId] ?? createDefaultNewsQuizArticleState()),
            ...updates,
          },
        },
      })),
      recordNewsCompletion: (record) => set((state) => {
        const completedAt = record.completedAt ?? Date.now();
        const date = new Date(completedAt);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const currentRecords = state.newsHistoryByDate[dateKey] || [];
        const nextRecord: NewsCompletionRecord = {
          articleId: record.articleId,
          title: record.title,
          completedAt,
        };
        const withoutDuplicate = currentRecords.filter(item => item.articleId !== record.articleId);
        return {
          newsHistoryByDate: {
            ...state.newsHistoryByDate,
            [dateKey]: [nextRecord, ...withoutDuplicate].slice(0, 20),
          },
        };
      }),
      setAssistantReplyStyle: (style) => set({ assistantReplyStyle: style }),
      setHasSeenAssistantStylePrompt: (seen) => set({ hasSeenAssistantStylePrompt: seen }),
      setHasDismissedNotificationSetupReminder: (dismissed) => set({ hasDismissedNotificationSetupReminder: dismissed }),
      upsertAssistantMemory: (memory) => {
        const now = Date.now();
        const nextMemory: AssistantMemoryRecord = {
          id: memory.id,
          title: memory.title,
          content: memory.content,
          createdAt: memory.createdAt ?? now,
          updatedAt: memory.updatedAt ?? now,
        };
        set((state) => {
          const exists = state.assistantMemories.some(item => item.id === nextMemory.id);
          return {
            assistantMemories: exists
              ? state.assistantMemories.map(item => item.id === nextMemory.id ? { ...item, ...nextMemory, createdAt: item.createdAt } : item)
              : [nextMemory, ...state.assistantMemories],
          };
        });
        return nextMemory;
      },
      deleteAssistantMemory: (id) => set((state) => ({
        assistantMemories: state.assistantMemories.filter(memory => memory.id !== id),
      })),
      addAssistantSchedule: (schedule) => {
        const nextSchedule: AssistantScheduleRecord = {
          ...schedule,
          createdAt: schedule.createdAt ?? Date.now(),
          status: schedule.status ?? 'planned',
        };
        set((state) => ({ assistantSchedules: [nextSchedule, ...state.assistantSchedules] }));
        return nextSchedule;
      },
      updateAssistantSchedule: (id, updates) => set((state) => ({
        assistantSchedules: state.assistantSchedules.map(schedule => schedule.id === id ? { ...schedule, ...updates } : schedule),
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
        storyPrompt: state.storyPrompt,
        preferences: state.preferences,
        theme: state.theme,
        language: state.language,
        dailyGoal: state.dailyGoal,
        decks: state.decks,
        activeDeckId: state.activeDeckId,
        essays: state.essays,
        stories: state.stories,
        activeEssayId: state.activeEssayId,
        newsQuizStates: state.newsQuizStates,
        newsHistoryByDate: state.newsHistoryByDate,
        assistantReplyStyle: state.assistantReplyStyle,
        hasSeenAssistantStylePrompt: state.hasSeenAssistantStylePrompt,
        hasDismissedNotificationSetupReminder: state.hasDismissedNotificationSetupReminder,
        assistantMemories: state.assistantMemories,
        assistantSchedules: state.assistantSchedules
      })
    }
  )
);
