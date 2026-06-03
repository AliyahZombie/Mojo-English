import { BookOpen } from 'lucide-react';

import type { Deck } from '../store/useAppStore';
import { cn } from '../lib/utils';

interface DeckMembershipChipsProps {
  decks: Deck[];
  emptyLabel?: string;
  className?: string;
}

export function DeckMembershipChips({ decks, emptyLabel, className }: DeckMembershipChipsProps) {
  if (decks.length === 0 && !emptyLabel) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-xs', className)}>
      <BookOpen size={13} className="text-slate-400 dark:text-slate-500" />
      {decks.length > 0 ? decks.map(deck => (
        <span
          key={deck.id}
          className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 font-semibold text-blue-600 dark:border-blue-900/60 dark:bg-blue-900/30 dark:text-blue-300"
          title={deck.name}
        >
          {deck.name}
        </span>
      )) : (
        <span className="font-medium text-slate-400 dark:text-slate-500">{emptyLabel}</span>
      )}
    </div>
  );
}
