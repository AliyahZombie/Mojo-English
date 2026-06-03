import { streamChatCompletion } from './llm';

type StoryStreamUpdate = (content: string) => void;

export async function streamStoryFromWords(words: string[], language: 'en' | 'zh', storyPrompt: string, onUpdate: StoryStreamUpdate): Promise<{ title: string; content: string }> {
  const uniqueWords = Array.from(new Set(words.map(word => word.trim()).filter(Boolean)));
  if (uniqueWords.length === 0) {
    throw new Error(language === 'zh' ? '今天还没有可用于生成故事的单词。' : 'No words learned today are available for story generation.');
  }

  const baseSystemPrompt = language === 'zh'
    ? `你是 Mojo 的英语学习故事作者。请用自然、适合语言学习者阅读的英文写一个短故事，并确保给定单词都出现在故事中。返回纯 Markdown，不要使用代码块。第一行必须是一个 Markdown 一级标题。`
    : `You are Mojo's English learning story writer. Write a natural short English story for language learners and ensure every given word appears in the story. Return plain Markdown only, without code fences. The first line must be a Markdown H1 title.`;
  const trimmedStoryPrompt = storyPrompt.trim();
  const systemPrompt = trimmedStoryPrompt
    ? `${baseSystemPrompt}\n\nAdditional story requirements from the user:\n${trimmedStoryPrompt}`
    : baseSystemPrompt;

  const result = await streamChatCompletion([
    {
      role: 'user',
      content: `Use all of these words in one coherent story:\n${uniqueWords.join(', ')}\n\nKeep it engaging, concise, and easy to read.`,
    },
  ], systemPrompt, (partialContent) => {
    onUpdate(partialContent);
  }, { task: 'story-generation' });

  const content = (result?.content || '').trim();
  const firstLine = content.split('\n').find(line => line.trim()) || '';
  const title = firstLine.replace(/^#\s*/, '').trim() || (language === 'zh' ? '今日故事' : 'Today\'s Story');

  return { title, content };
}
