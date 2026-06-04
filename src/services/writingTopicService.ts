import { chatCompletion } from './llm';

type TopicSource = 'story' | 'news';

type GenerateWritingTopicParams = {
  source: TopicSource;
  title: string;
  content: string;
  language: 'en' | 'zh';
};

const stripWrappingQuotes = (value: string) => value.replace(/^["“”'`]+|["“”'`]+$/g, '').trim();

export async function generateWritingTopic({ source, title, content, language }: GenerateWritingTopicParams): Promise<string> {
  const systemPrompt = language === 'zh'
    ? '你是 Mojo 的英语写作教练。请根据用户刚读完的故事或新闻，生成一个适合英语学习者写作的英文题目。只返回一个题目，不要解释，不要编号，不要 Markdown。题目应具体、有启发性，长度不超过 28 个英文单词。故事内容优先生成续写/改写题，新闻内容优先生成相关议题或观点讨论题。'
    : 'You are Mojo\'s English writing coach. Generate one English writing topic based on the story or news article the learner just read. Return only the topic, with no explanation, numbering, or Markdown. Keep it specific, thought-provoking, and under 28 words. For stories, prefer a continuation or retelling prompt. For news, prefer a related issue or discussion prompt.';

  const response = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          `Source type: ${source}`,
          `Title: ${title}`,
          'Content:',
          content.slice(0, 6000),
        ].join('\n\n'),
      },
    ],
    systemPrompt,
    { task: 'writing-topic-generation' },
  );

  const firstLine = response.split('\n').map(line => line.trim()).find(Boolean) || '';
  const topic = stripWrappingQuotes(firstLine.replace(/^[-*\d.\s]+/, ''));
  if (topic) return topic;

  return source === 'story'
    ? 'Continue the story and show how the main character changes.'
    : 'Discuss the key issue in this article and explain your own view.';
}
