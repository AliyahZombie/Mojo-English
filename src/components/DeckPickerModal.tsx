import { X, Star, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useAppStore, type Deck } from '../store/useAppStore';
import { translations } from '../lib/i18n';

interface DeckPickerModalProps {
  isOpen: boolean;
  word: string;
  decks: Deck[];
  onClose: () => void;
  onSelect: (deckId: string) => void;
}

export function DeckPickerModal({ isOpen, word, decks, onClose, onSelect }: DeckPickerModalProps) {
  const { language } = useAppStore();
  const t = translations[language];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-900/20 backdrop-blur-sm dark:bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%', opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-[80] flex max-h-[75vh] flex-col rounded-t-3xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:bottom-auto md:left-1/2 md:top-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                  <Star size={20} className="text-yellow-400" />
                  {t.addToDeck}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.chooseDeckForWordBefore} “{word}” {t.chooseDeckForWordAfter}</p>
              </div>
              <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-400 transition-colors hover:text-slate-700 dark:bg-slate-800 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {decks.length === 0 ? (
                <div className="py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t.noDecksCreateFirst}
                </div>
              ) : decks.map(deck => (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => onSelect(deck.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-blue-900 dark:hover:bg-blue-950/30"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-800 dark:text-slate-100">{deck.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{deck.words.length} {t.wordsCount}</div>
                  </div>
                  <BookOpen size={18} className="shrink-0 text-blue-500" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
