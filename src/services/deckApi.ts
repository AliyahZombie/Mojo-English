import { Deck } from '../store/useAppStore';

export const uploadAndParseApkg = async (file: File): Promise<Deck> => {
  // Simulate network delay to backend
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Fake parsing: generate a list of words for the deck
  // In reality, it would upload the .apkg file, parse SQLite/JSON inside, and return the words.
  const commonWords = [
    "abandon", "ability", "abnormal", "aboard", "abolish",
    "abound", "abroad", "absence", "absent", "absolute",
    "absorb", "abstract", "abundant", "abuse", "academic",
    "accelerate", "accent", "accept", "acceptable", "acceptance",
    "access", "accessible", "accident", "accommodate", "accommodation"
  ];
  
  // Random extra words to simulate different sizes
  const extraWords = Array.from(
    {length: Math.floor(Math.random() * 50) + 10}, 
    (_, i) => `word_${Math.floor(Math.random() * 10000)}`
  );
  
  const allWords = [...commonWords, ...extraWords].sort(() => Math.random() - 0.5);
  
  return {
    id: `deck_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: file.name.replace(/\.apkg$/i, ''),
    words: allWords,
    createdAt: Date.now()
  };
};
