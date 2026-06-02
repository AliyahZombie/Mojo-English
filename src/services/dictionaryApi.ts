import { WordDetail } from "../components/WordCard";
import { searchOfflineDictionary, EcdictWord, getAiCache, setAiCache } from "./dictionaryDb";

function formatOfflineWord(word: EcdictWord): WordDetail {
  // Convert local EcdictWord to WordDetail format
  const mockDetail = [];
  
  return {
    id: `dict-${word.word}`,
    word: word.originalWord || word.word,
    phonetic: word.phonetic,
    translation: word.translation.replace(/\\n/g, '\n'), // Replace literal \n with newlines if they exist
    definition: word.definition.replace(/\\n/g, '\n'),
    tag: word.tag,
    bnc: parseInt(word.bnc) || 0,
    frq: parseInt(word.frq) || 0,
    exchange: word.exchange,
    collins: parseInt(word.collins) || 0,
    oxford: parseInt(word.oxford) || 0,
    detail: mockDetail.length > 0 ? mockDetail : undefined
  };
}

export async function searchDictionary(query: string, options?: { forceAi?: boolean }): Promise<WordDetail | null> {
  if (!query || query.trim() === '') return null;
  const normalizedQuery = query.trim().toLowerCase();

  if (!options?.forceAi) {
    // Try AI Cache first
    const cached = await getAiCache(normalizedQuery);
    if (cached) {
      return cached;
    }

    const localResult = await searchOfflineDictionary(query);
    if (localResult) {
      return formatOfflineWord(localResult);
    }
  }

  try {
    const { chatCompletion } = await import('./llm');
    const systemPrompt = `You are a dictionary API. Provide the definition of the word in JSON format exactly matching this schema:
{
  "word": "<string>",
  "phonetic": "<string, phonetic transcription>",
  "translation": "<string, translation in Chinese>",
  "definition": "<string, English definition>",
  "tag": "<string>",
  "bnc": <number, 0 if unknown>,
  "frq": <number, 0 if unknown>,
  "exchange": "<string, variations>",
  "collins": <number, 0-5>,
  "oxford": <number, 1 or 0>,
  "detail": [
    { "en": "<string, example sentence>", "cn": "<string, translated sentence>" }
  ]
}
Return ONLY valid JSON.
`;
    
    // Attempt fallback via LLM
    const response = await chatCompletion([{ role: 'user', content: `Word to look up: "${query}"` }], systemPrompt);
    const cleanedResponse = response.replace(/^```json\n?/, '').replace(/```$/, '').trim();
    const result = JSON.parse(cleanedResponse);
    
    const wordParam = {
      id: `ai-${result.word || query}`,
      word: result.word || query,
      phonetic: result.phonetic || '',
      translation: result.translation || '',
      definition: result.definition || '',
      tag: result.tag || '',
      bnc: parseInt(result.bnc) || 0,
      frq: parseInt(result.frq) || 0,
      exchange: result.exchange || '',
      collins: parseInt(result.collins) || 0,
      oxford: parseInt(result.oxford) || 0,
      detail: result.detail || []
    };

    await setAiCache(normalizedQuery, wordParam);
    return wordParam;
  } catch (error) {
    console.error("Dictionary lookup failed using LLM", error);
    
    // Return standard mock if LLM fails or is unconfigured
    return {
      id: `dict-${normalizedQuery}`,
      word: normalizedQuery,
      phonetic: '',
      translation: '未能获取此单词的翻译，请检查AI大模型配置',
      definition: 'Failed to find definition. Please verify your AI provider configuration in Settings.',
      tag: '',
      bnc: 0,
      frq: 0,
      exchange: '',
      collins: 0,
      oxford: 0,
      detail: []
    };
  }
}
