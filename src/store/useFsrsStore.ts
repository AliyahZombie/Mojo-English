import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Card, FSRS, createEmptyCard, Rating, State, ReviewLog } from 'ts-fsrs';

export interface DailyStats {
  date: string; // YYYY-MM-DD
  studiedCount: number;
}

interface FsrsState {
  cards: Record<string, Card>;
  logs: ReviewLog[];
  dailyStats: Record<string, DailyStats>;

  // Dynamic queue state
  activeQueueDeckId: string | null;

  getCard: (word: string) => Card;
  processReview: (word: string, rating: Rating, now?: Date) => { card: Card; log: ReviewLog } | null;
  getDueStats: (words: string[]) => { dueCount: number; newCount: number; learningCount: number; reviewCount: number };
  getNextDueTime: (words: string[]) => number | null;
  getNextCard: (deckId: string, words: string[]) => string | null;
  getDailyStudiedCount: () => number;
  getNextIntervals: (word: string) => { again: string; hard: string; good: string; easy: string };

  // Session management
  initQueue: (deckId: string) => void;
  continueSession: () => void;
}

const getTodayString = () => new Date().toISOString().split('T')[0];

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

export const useFsrsStore = create<FsrsState>()(
  persist(
    (set, get) => ({
      cards: {},
      logs: [],
      dailyStats: {},
      
      activeQueueDeckId: null,

      initQueue: (deckId: string) => {
        set({ activeQueueDeckId: deckId });
      },

      continueSession: () => {
        // No-op for dynamic
      },

      getCard: (word: string) => {
        const state = get();
        if (state.cards[word]) {
          const c = state.cards[word];
          return {
            ...c,
            due: c.due ? new Date(c.due) : new Date(),
            last_review: c.last_review ? new Date(c.last_review) : undefined
          };
        }
        return createEmptyCard();
      },

      processReview: (word: string, rating: Rating, now = new Date()) => {
        const card = get().getCard(word);
        try {
          const scheduling_cards = fsrs.repeat(card, now);
          const result = scheduling_cards[rating];
          if (!result) return null;

          const newCard = result.card;
          const newLog = result.log;
          
          set((state) => {
            const today = getTodayString();
            const currentStats = state.dailyStats[today] || { date: today, studiedCount: 0 };
            
            return {
              cards: { ...state.cards, [word]: newCard },
              logs: [...state.logs, newLog],
              dailyStats: {
                ...state.dailyStats,
                [today]: {
                  ...currentStats,
                  studiedCount: currentStats.studiedCount + 1
                }
              }
            };
          });

          return result;
        } catch (error) {
          console.error("FSRS Review error", error);
          return null;
        }
      },

      getDueStats: (words: string[]) => {
        const state = get();
        const now = new Date();
        const learnAheadTime = new Date(now.getTime() + 20 * 60 * 1000); // 20 mins
        let dueCount = 0;
        let newCount = 0;
        let learningCount = 0;
        let reviewCount = 0;

        for (const word of words) {
          const card = state.cards[word];
          if (!card) {
            newCount++;
          } else {
            if (card.state === State.New) {
              newCount++;
            } else if (card.state === State.Learning || card.state === State.Relearning) {
              if (card.due && new Date(card.due) <= learnAheadTime) {
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

      getNextDueTime: (words: string[]) => {
        const state = get();
        const now = Date.now();
        let minDue: number | null = null;
        
        for (const w of words) {
          const card = state.cards[w];
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
        const learnAheadTime = new Date(t.getTime() + 20 * 60 * 1000); // 20 mins

        const dueLearning: string[] = [];
        const review: string[] = [];
        const newCards: string[] = [];
        const aheadLearning: string[] = [];

        for (const w of words) {
          const card = state.cards[w];
          if (!card || card.state === State.New) {
            newCards.push(w);
          } else if (card.state === State.Learning || card.state === State.Relearning) {
            if (card.due) {
              const dueTime = new Date(card.due).getTime();
              if (dueTime <= t.getTime()) {
                dueLearning.push(w);
              } else if (dueTime <= learnAheadTime.getTime()) {
                aheadLearning.push(w);
              }
            }
          } else if (card.state === State.Review) {
            if (card.due && new Date(card.due).getTime() <= t.getTime()) {
              review.push(w);
            }
          }
        }

        // Sort by due date (ascending) so the most overdue/soonest comes first
        dueLearning.sort((a, b) => new Date(state.cards[a].due!).getTime() - new Date(state.cards[b].due!).getTime());
        review.sort((a, b) => new Date(state.cards[a].due!).getTime() - new Date(state.cards[b].due!).getTime());
        aheadLearning.sort((a, b) => new Date(state.cards[a].due!).getTime() - new Date(state.cards[b].due!).getTime());

        if (dueLearning.length > 0) return dueLearning[0];
        if (review.length > 0) return review[0];
        
        // Return the first new card deterministically instead of shuffling on every render
        if (newCards.length > 0) {
           return newCards[0];
        }
        
        if (aheadLearning.length > 0) return aheadLearning[0];

        return null;
      },

      getDailyStudiedCount: () => {
        const state = get();
        const today = getTodayString();
        return state.dailyStats[today]?.studiedCount || 0;
      },

      getNextIntervals: (word: string) => {
        const card = get().getCard(word);
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
