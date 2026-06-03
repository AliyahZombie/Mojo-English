import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Card, FSRS, createEmptyCard, Rating, State, ReviewLog } from 'ts-fsrs';

export interface DailyStats {
  date: string; // YYYY-MM-DD
  studiedCount: number;
  studiedKeys?: string[];
  legacyStudiedCount?: number;
}

interface FsrsState {
  cards: Record<string, Card>;
  masteredWords: Record<string, boolean>;
  logs: ReviewLog[];
  dailyStats: Record<string, DailyStats>;

  // Dynamic queue state
  activeQueueDeckId: string | null;

  getCard: (deckId: string, word: string) => Card;
  getStoredCard: (deckId: string, word: string) => Card | undefined;
  isWordMastered: (deckId: string, word: string) => boolean;
  processReview: (deckId: string, word: string, rating: Rating, now?: Date) => { card: Card; log: ReviewLog } | null;
  markWordMastered: (deckId: string, word: string) => void;
  getDueStats: (deckId: string, words: string[]) => { dueCount: number; newCount: number; learningCount: number; reviewCount: number };
  getNextDueTime: (deckId: string, words: string[]) => number | null;
  getNextCard: (deckId: string, words: string[]) => string | null;
  getDailyStudiedCount: () => number;
  getNextIntervals: (deckId: string, word: string) => { again: string; hard: string; good: string; easy: string };

  // Session management
  initQueue: (deckId: string, words?: string[]) => void;
  continueSession: () => void;
}

export const getFsrsCardKey = (deckId: string, word: string) => `${deckId}::${word}`;

export const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fsrs = new FSRS({
  enable_fuzz: false // matches the python code
});

function formatInterval(due: Date, now: Date): string {
  const diffMinutes = Math.round((due.getTime() - now.getTime()) / 60000);
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}m`;
  if (diffMinutes < 24 * 60) return `${Math.round(diffMinutes / 60)}h`;
  const diffDays = Math.round(diffMinutes / (24 * 60));
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  return `${(diffMonths / 12).toFixed(1)}y`;
}

function rehydrateCard(card: Card): Card {
  return {
    ...card,
    due: card.due ? new Date(card.due) : new Date(),
    last_review: card.last_review ? new Date(card.last_review) : undefined
  };
}

function recordDailyStudy(stats: Record<string, DailyStats>, studyKey: string) {
  const today = getLocalDateString();
  const currentStats = stats[today] || { date: today, studiedCount: 0 };
  const existingKeys = currentStats.studiedKeys || [];
  const studiedKeys = existingKeys.includes(studyKey) ? existingKeys : [...existingKeys, studyKey];
  const legacyBaseCount = currentStats.legacyStudiedCount ?? (currentStats.studiedKeys ? 0 : currentStats.studiedCount);

  return {
    ...stats,
    [today]: {
      ...currentStats,
      legacyStudiedCount: legacyBaseCount,
      studiedKeys,
      studiedCount: legacyBaseCount + studiedKeys.length
    }
  };
}

export const useFsrsStore = create<FsrsState>()(
  persist(
    (set, get) => ({
      cards: {},
      masteredWords: {},
      logs: [],
      dailyStats: {},
       
      activeQueueDeckId: null,

      initQueue: (deckId: string, words: string[] = []) => {
        set((state) => {
          const migratedCards = { ...state.cards };
          for (const word of words) {
            const scopedKey = getFsrsCardKey(deckId, word);
            if (!migratedCards[scopedKey] && migratedCards[word]) {
              migratedCards[scopedKey] = migratedCards[word];
            }
          }

          return { activeQueueDeckId: deckId, cards: migratedCards };
        });
      },

      continueSession: () => {
        // No-op for dynamic
      },

      getStoredCard: (deckId: string, word: string) => {
        const state = get();
        const scopedKey = getFsrsCardKey(deckId, word);
        const storedCard = state.cards[scopedKey] || state.cards[word];
        return storedCard ? rehydrateCard(storedCard) : undefined;
      },

      getCard: (deckId: string, word: string) => {
        const storedCard = get().getStoredCard(deckId, word);
        if (storedCard) return storedCard;
        return createEmptyCard();
      },

      isWordMastered: (deckId: string, word: string) => {
        return !!get().masteredWords[getFsrsCardKey(deckId, word)];
      },

      processReview: (deckId: string, word: string, rating: Rating, now = new Date()) => {
        const card = get().getCard(deckId, word);
        const scopedKey = getFsrsCardKey(deckId, word);
        try {
          const scheduling_cards = fsrs.repeat(card, now);
          const result = scheduling_cards[rating];
          if (!result) return null;

          const newCard = result.card;
          const newLog = result.log;
           
          set((state) => {
            return {
              cards: { ...state.cards, [scopedKey]: newCard },
              logs: [...state.logs, newLog],
              dailyStats: recordDailyStudy(state.dailyStats, scopedKey)
            };
          });

          return result;
        } catch (error) {
          console.error("FSRS Review error", error);
          return null;
        }
      },

      markWordMastered: (deckId: string, word: string) => {
        const scopedKey = getFsrsCardKey(deckId, word);
        set((state) => ({
          masteredWords: { ...state.masteredWords, [scopedKey]: true },
          dailyStats: recordDailyStudy(state.dailyStats, scopedKey)
        }));
      },

      getDueStats: (deckId: string, words: string[]) => {
        const state = get();
        const now = new Date();
        let dueCount = 0;
        let newCount = 0;
        let learningCount = 0;
        let reviewCount = 0;

        for (const word of words) {
          const scopedKey = getFsrsCardKey(deckId, word);
          if (state.masteredWords[scopedKey]) continue;

          const card = state.cards[scopedKey] || state.cards[word];
          if (!card) {
            newCount++;
          } else {
            if (card.state === State.New) {
              newCount++;
            } else if (card.state === State.Learning || card.state === State.Relearning) {
              if (card.due && new Date(card.due) <= now) {
                learningCount++;
                dueCount++;
              }
            } else if (card.state === State.Review) {
              if (card.due && new Date(card.due) <= now) {
                reviewCount++;
                dueCount++;
              }
            }
          }
        }

        return { dueCount, newCount, learningCount, reviewCount };
      },

      getNextDueTime: (deckId: string, words: string[]) => {
        const state = get();
        const now = Date.now();
        let minDue: number | null = null;
        
        for (const w of words) {
          const scopedKey = getFsrsCardKey(deckId, w);
          if (state.masteredWords[scopedKey]) continue;

          const card = state.cards[scopedKey] || state.cards[w];
          if (card && card.state !== State.New && card.due) {
            const dueTime = new Date(card.due).getTime();
            if (dueTime > now) {
              if (minDue === null || dueTime < minDue) {
                minDue = dueTime;
              }
            }
          }
        }
        return minDue;
      },

      getNextCard: (deckId: string, words: string[]) => {
        const state = get();
        const t = new Date();

        const dueLearning: string[] = [];
        const review: string[] = [];
        const newCards: string[] = [];

        for (const w of words) {
          const scopedKey = getFsrsCardKey(deckId, w);
          if (state.masteredWords[scopedKey]) continue;

          const card = state.cards[scopedKey] || state.cards[w];
          if (!card || card.state === State.New) {
            newCards.push(w);
          } else if (card.state === State.Learning || card.state === State.Relearning) {
            if (card.due) {
              const dueTime = new Date(card.due).getTime();
              if (dueTime <= t.getTime()) {
                dueLearning.push(w);
              }
            }
          } else if (card.state === State.Review) {
            if (card.due && new Date(card.due).getTime() <= t.getTime()) {
              review.push(w);
            }
          }
        }

        const dueTimeFor = (word: string) => {
          const scopedKey = getFsrsCardKey(deckId, word);
          const card = state.cards[scopedKey] || state.cards[word];
          return card?.due ? new Date(card.due).getTime() : 0;
        };

        // Sort by due date (ascending) so the most overdue/soonest comes first
        dueLearning.sort((a, b) => dueTimeFor(a) - dueTimeFor(b));
        review.sort((a, b) => dueTimeFor(a) - dueTimeFor(b));

        if (dueLearning.length > 0) return dueLearning[0];
        if (review.length > 0) return review[0];
        
        // Return the first new card deterministically instead of shuffling on every render
        if (newCards.length > 0) {
           return newCards[0];
        }

        return null;
      },

      getDailyStudiedCount: () => {
        const state = get();
        const today = getLocalDateString();
        return state.dailyStats[today]?.studiedCount || 0;
      },

      getNextIntervals: (deckId: string, word: string) => {
        const card = get().getCard(deckId, word);
        const now = new Date();
        try {
          const scheduling_cards = fsrs.repeat(card, now);
          return {
            again: formatInterval(scheduling_cards[Rating.Again].card.due, now),
            hard: formatInterval(scheduling_cards[Rating.Hard].card.due, now),
            good: formatInterval(scheduling_cards[Rating.Good].card.due, now),
            easy: formatInterval(scheduling_cards[Rating.Easy].card.due, now)
          };
        } catch {
          return { again: '< 1m', hard: '5m', good: '10m', easy: '4d' };
        }
      }
    }),
    {
      name: 'mojo-fsrs-store'
    }
  )
);
