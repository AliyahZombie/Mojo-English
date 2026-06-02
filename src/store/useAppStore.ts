import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language } from '../lib/i18n';

export interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  activeModel: string;
}

export interface Deck {
  id: string;
  name: string;
  words: string[];
  createdAt: number;
}

interface AppState {
  hasConfigured: boolean;
  activeProvider: string;
  providers: Record<string, Provider>;
  preferences: string[];
  theme: 'light' | 'dark';
  language: Language;
  dailyGoal: number;
  decks: Deck[];
  activeDeckId: string | null;
  
  setHasConfigured: (val: boolean) => void;
  setActiveProvider: (name: string) => void;
  updateProvider: (name: string, provider: Provider) => void;
  setPreferences: (prefs: string[]) => void;
  setDailyGoal: (goal: number) => void;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
  addDeck: (deck: Deck) => void;
  setActiveDeckId: (deckId: string | null) => void;
  deleteDeck: (deckId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasConfigured: false,
      activeProvider: 'gemini',
      providers: {
        gemini: {
          name: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKey: '',
          models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
          activeModel: 'gemini-1.5-flash',
        }
      },
      preferences: [],
      dailyGoal: 5,
      theme: 'light',
      language: 'zh',
      decks: [],
      activeDeckId: null,
      
      setHasConfigured: (val) => set({ hasConfigured: val }),
      setActiveProvider: (name) => set({ activeProvider: name }),
      updateProvider: (name, provider) => set((state) => ({
        providers: { ...state.providers, [name]: provider }
      })),
      setPreferences: (prefs) => set({ preferences: prefs }),
      setDailyGoal: (goal) => set({ dailyGoal: goal }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setLanguage: (lang) => set({ language: lang }),
      addDeck: (deck) => set((state) => ({ decks: [...state.decks, deck] })),
      setActiveDeckId: (id) => set({ activeDeckId: id }),
      deleteDeck: (id) => set((state) => ({ 
        decks: state.decks.filter(d => d.id !== id), 
        activeDeckId: state.activeDeckId === id ? null : state.activeDeckId 
      })),
    }),
    {
      name: 'mojo-app-store',
    }
  )
);
