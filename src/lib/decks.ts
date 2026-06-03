import type { Deck } from '../store/useAppStore';

export function normalizeDeckWord(word: string): string {
  return word.trim().toLowerCase();
}

export function parseDeckWords(input: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  for (const part of input.split(/[\n,，;；\s]+/)) {
    const word = normalizeDeckWord(part);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }

  return words;
}

export function getDecksForWord(decks: Deck[], word: string): Deck[] {
  const normalizedWord = normalizeDeckWord(word);
  if (!normalizedWord) return [];

  return decks.filter(deck => deck.words.some(entry => normalizeDeckWord(entry) === normalizedWord));
}
