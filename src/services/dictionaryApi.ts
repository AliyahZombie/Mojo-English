import { WordDetail } from "../components/WordCard";

// Mock implementation
export async function searchDictionary(query: string): Promise<WordDetail | null> {
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network latency

  if (!query || query.trim() === '') return null;

  const normalizedQuery = query.trim().toLowerCase();

  return {
    id: `dict-${normalizedQuery}`,
    word: normalizedQuery,
    phonetic: 'juːˈbɪkwɪtəs', // mock phonetic
    translation: 'n. (测试数据) 未知单词的翻译\nadj. 这是一个模拟的词典返回结果',
    definition: '(Mock data) A word definition that simulates the API response.\nAnother definition here.',
    tag: 'toefl gre ielts',
    bnc: Math.floor(Math.random() * 20000),
    frq: Math.floor(Math.random() * 20000),
    exchange: 'p:plurals/d:past/i:v-ing/3:3rd pers',
    collins: Math.floor(Math.random() * 5),
    oxford: Math.random() > 0.5 ? 1 : 0,
    detail: [
      { en: `This is a mock example sentence for ${normalizedQuery}.`, cn: `这是 ${normalizedQuery} 的一个模拟例句。` },
      { en: `You can see ${normalizedQuery} everywhere.`, cn: `你到处都能看到 ${normalizedQuery}。` }
    ]
  };
}
