import { chatCompletion } from './llm';
import {
  getCachedNewsArticle,
  getCachedNewsFeedPage,
  getNewsDomainHealth,
  recordNewsDomainFailure,
  recordNewsDomainSuccess,
  setCachedNewsArticle,
  setCachedNewsFeedPage,
} from './dictionaryDb';
import { estimateReadTime, fetchNewsFeedPage, NEWSDATA_CATEGORIES } from './newsdataApi';
import type {
  CachedNewsFeedPage,
  EnrichedNewsArticle,
  NewsFeedItem,
  NewsFeedPage,
  NewsQuiz,
  NewsShortAnswerEvaluation,
} from './newsTypes';

const PIPELINE_VERSION = 'news-pipeline-v3';
export const NEWS_FEED_CACHE_TTL_MS = 30 * 60 * 1000;
export const NEWS_ARTICLE_FAILURE_RETRY_MS = 30 * 60 * 1000;
export const NEWS_ARTICLE_NON_ENGLISH_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_ARTICLE_PROMPT_CHARS = 18000;

class NewsSourceExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewsSourceExtractionError';
  }
}

type LoadFeedParams = {
  newsdataApiKey: string;
  preferences: string[];
  search?: string;
  nextPage?: string | null;
  forceRefresh?: boolean;
};

type EnrichArticleParams = {
  feedItem: NewsFeedItem;
  tavilyApiKey: string;
  preferences: string[];
  forceRefresh?: boolean;
};

type EvaluateShortAnswerParams = {
  article: EnrichedNewsArticle;
  answer: string;
};

export async function loadNewsFeedPageWithCache({
  newsdataApiKey,
  preferences,
  search,
  nextPage,
  forceRefresh = false,
}: LoadFeedParams): Promise<NewsFeedPage> {
  const cacheKey = buildFeedCacheKey(preferences, search, nextPage);
  if (!forceRefresh) {
    const cachedPage = await getCachedNewsFeedPage(cacheKey);
    if (cachedPage && Date.now() - cachedPage.fetchedAt < NEWS_FEED_CACHE_TTL_MS) {
      return { items: cachedPage.items, nextPage: cachedPage.nextPage };
    }
  }

  const page = await fetchNewsFeedPage({
    apiKey: newsdataApiKey,
    preferences,
    search,
    nextPage: nextPage || undefined,
  });

  const payload: CachedNewsFeedPage = {
    key: cacheKey,
    items: page.items,
    nextPage: page.nextPage,
    fetchedAt: Date.now(),
  };
  await setCachedNewsFeedPage(payload);
  return page;
}

export async function enrichNewsArticle({
  feedItem,
  tavilyApiKey,
  preferences,
  forceRefresh = false,
}: EnrichArticleParams): Promise<EnrichedNewsArticle> {
  if (!forceRefresh) {
    const cached = await getCachedNewsArticle(feedItem.id);
    if (cached && cached.pipelineVersion === PIPELINE_VERSION && !shouldAttemptNewsArticleEnrichment(cached)) {
      return withRecommendation(cached, preferences);
    }
  }

  const sourceDomain = getSourceDomain(feedItem.link);
  if (sourceDomain && !forceRefresh) {
    const domainHealth = await getNewsDomainHealth(sourceDomain);
    if (domainHealth?.blacklistedAt) {
      const blacklisted = buildFallbackArticle(feedItem, sourceDomain, 'blacklisted-source');
      await setCachedNewsArticle(blacklisted);
      return withRecommendation(blacklisted, preferences);
    }
  }

  let rawArticleText = '';
  try {
    rawArticleText = await extractArticleBody(feedItem, tavilyApiKey);
    if (sourceDomain) {
      await recordNewsDomainSuccess(sourceDomain);
    }
  } catch (error) {
    if (sourceDomain && isNewsSourceExtractionError(error)) {
      const domainHealth = await recordNewsDomainFailure(sourceDomain);
      const fallbackStatus = domainHealth.blacklistedAt ? 'blacklisted-source' : 'failed';
      const fallback = buildFallbackArticle(feedItem, sourceDomain, fallbackStatus);
      await setCachedNewsArticle(fallback);
      return withRecommendation(fallback, preferences);
    }

    const fallback = buildFallbackArticle(feedItem, null, 'failed');
    await setCachedNewsArticle(fallback);
    return withRecommendation(fallback, preferences);
  }

  const language = await detectEnglishArticle(feedItem, rawArticleText);
  if (!language.isEnglish) {
    const nonEnglish = buildFallbackArticle(feedItem, sourceDomain, 'non-english', {
      detectedLanguage: language.detectedLanguage,
      isEnglish: false,
    });
    await setCachedNewsArticle(nonEnglish);
    return withRecommendation(nonEnglish, preferences);
  }

  let cleanedParagraphs: string[];
  let quiz: NewsQuiz;
  try {
    cleanedParagraphs = await cleanArticleParagraphs(feedItem, rawArticleText);
    quiz = await generateArticleQuiz(feedItem, cleanedParagraphs);
  } catch {
    const fallback = buildFallbackArticle(feedItem, sourceDomain, 'failed', {
      detectedLanguage: language.detectedLanguage,
      isEnglish: true,
    });
    await setCachedNewsArticle(fallback);
    return withRecommendation(fallback, preferences);
  }
  const enriched: EnrichedNewsArticle = withRecommendation(
    {
      ...feedItem,
      paragraphs: cleanedParagraphs,
      readTime: estimateReadTime(cleanedParagraphs.join(' ')),
      quiz,
      recommendationScore: 0,
      enrichmentStatus: 'ready',
      sourceDomain,
      sourceUrl: feedItem.link,
      fetchedAt: Date.now(),
      cleanedAt: Date.now(),
      quizGeneratedAt: Date.now(),
      pipelineVersion: PIPELINE_VERSION,
      detectedLanguage: language.detectedLanguage,
      isEnglish: true,
    },
    preferences,
  );
  await setCachedNewsArticle(enriched);
  return enriched;
}

export async function evaluateNewsShortAnswer({
  article,
  answer,
}: EvaluateShortAnswerParams): Promise<NewsShortAnswerEvaluation> {
  if (!article.quiz) {
    throw new Error('Quiz is not available for this article.');
  }

  const normalizedAnswer = answer.trim();
  const shortAnswerPrompt = article.quiz.shortAnswer;
  if (!normalizedAnswer) {
    return {
      score: 0,
      isCorrect: false,
      feedback: 'Please write an answer before submitting.',
      sampleAnswer: shortAnswerPrompt?.expectedAnswer || article.quiz.compQuestion,
    };
  }

  const response = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          `Article title: ${article.title}`,
          `Question: ${shortAnswerPrompt?.question || article.quiz.compQuestion}`,
          `Expected answer: ${shortAnswerPrompt?.expectedAnswer || 'Evaluate whether the answer captures the article content accurately.'}`,
          `Rubric: ${(shortAnswerPrompt?.rubric || []).join('; ')}`,
          `Student answer: ${normalizedAnswer}`,
          'Return strict JSON: {"score":0,"isCorrect":false,"feedback":"","sampleAnswer":""}. Score is 0-100.',
        ].join('\n\n'),
      },
    ],
    'You grade short English reading-comprehension answers. Be specific, fair, and concise. Output strict JSON only.',
    { task: 'quiz-evaluation' },
  );
  const parsed = parseJson<Partial<NewsShortAnswerEvaluation>>(response);
  return normalizeShortAnswerEvaluation(parsed);
}

export function shouldAttemptNewsArticleEnrichment(article: EnrichedNewsArticle | undefined): boolean {
  if (!article) {
    return true;
  }

  const age = Date.now() - article.fetchedAt;

  if (article.enrichmentStatus === 'ready') {
    return !article.quiz || article.paragraphs.length === 0;
  }

  if (article.enrichmentStatus === 'non-english') {
    return age >= NEWS_ARTICLE_NON_ENGLISH_RETRY_MS;
  }

  if (article.enrichmentStatus === 'failed' || article.enrichmentStatus === 'blacklisted-source') {
    return age >= NEWS_ARTICLE_FAILURE_RETRY_MS;
  }

  return true;
}

function buildFeedCacheKey(preferences: string[], search?: string, nextPage?: string | null): string {
  const normalizedPreferences = [...preferences].sort().join('|');
  return [normalizedPreferences, search?.trim() || '', nextPage || 'first-page'].join('::');
}

function getSourceDomain(link: string | null): string | null {
  if (!link) {
    return null;
  }

  try {
    return new URL(link).hostname;
  } catch {
    return null;
  }
}

async function extractArticleBody(feedItem: NewsFeedItem, tavilyApiKey: string): Promise<string> {
  if (!tavilyApiKey.trim()) {
    throw new Error('Tavily API key is missing.');
  }
  if (!feedItem.link) {
    throw new Error('Article link is missing.');
  }

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tavilyApiKey.trim()}`,
    },
    body: JSON.stringify({
      urls: [feedItem.link],
      extract_depth: 'advanced',
      format: 'markdown',
    }),
  });

  const data = await readJsonResponse<{
    results?: Array<{ raw_content?: string; content?: string; markdown?: string; text?: string }>;
    error?: string;
    detail?: string;
    message?: string;
  }>(response, 'Tavily');

  if (!response.ok) {
    throw new Error(data.error || data.detail || data.message || 'Tavily extraction failed.');
  }

  const payload = data.results?.[0];
  const rawContent = payload?.raw_content || payload?.content || payload?.markdown || payload?.text || '';
  if (!rawContent.trim()) {
    throw new NewsSourceExtractionError('Tavily returned empty article content.');
  }
  return rawContent;
}

async function cleanArticleParagraphs(feedItem: NewsFeedItem, rawArticleText: string): Promise<string[]> {
  const promptArticleText = truncateArticleText(rawArticleText);
  const cleaned = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          `Title: ${feedItem.title}`,
          `Source: ${feedItem.source}`,
          `Category: ${feedItem.category}`,
          'Clean the crawled article body into concise reading paragraphs for an English learner.',
          'Remove navigation, cookie notices, byline noise, related links, duplicated fragments, markdown clutter, and trailing boilerplate.',
          'Return strict JSON: {"paragraphs":["paragraph 1", "paragraph 2"]}.',
          'Each paragraph should be natural prose and there should be 3 to 6 paragraphs max.',
          promptArticleText,
        ].join('\n\n'),
      },
    ],
    'You convert noisy crawled webpages into clean article reading passages. Output strict JSON only.',
    { task: 'article-parsing' },
  );

  const parsed = parseJson<{ paragraphs?: string[] }>(cleaned);
  const paragraphs = (parsed.paragraphs || []).map((paragraph) => paragraph.trim()).filter(Boolean).slice(0, 6);
  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return rawArticleText
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 6);
}

async function detectEnglishArticle(feedItem: NewsFeedItem, rawArticleText: string): Promise<{ isEnglish: boolean; detectedLanguage: string }> {
  const sample = [feedItem.title, feedItem.excerpt, rawArticleText.slice(0, 2400)].join('\n\n');
  try {
    const response = await chatCompletion(
      [
        {
          role: 'user',
          content: [
            'Detect whether this news article is primarily English prose suitable for an English learner.',
            'Return strict JSON: {"isEnglish":true,"detectedLanguage":"English"}.',
            sample,
          ].join('\n\n'),
        },
      ],
      'You are a precise language classifier. Output strict JSON only.',
      { task: 'news-optimization' },
    );
    const parsed = parseJson<{ isEnglish?: boolean; detectedLanguage?: string }>(response);
    return {
      isEnglish: parsed.isEnglish === true,
      detectedLanguage: parsed.detectedLanguage?.trim() || (parsed.isEnglish ? 'English' : 'Unknown'),
    };
  } catch {
    const asciiLetterCount = (sample.match(/[A-Za-z]/g) || []).length;
    const nonAsciiCount = (sample.match(/[^\x00-\x7F]/g) || []).length;
    const isEnglish = asciiLetterCount > 120 && asciiLetterCount > nonAsciiCount * 2;
    return { isEnglish, detectedLanguage: isEnglish ? 'English' : 'Unknown' };
  }
}

async function generateArticleQuiz(feedItem: NewsFeedItem, paragraphs: string[]): Promise<NewsQuiz> {
  const articleText = paragraphs.join('\n\n');
  const quizResponse = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          `Article title: ${feedItem.title}`,
          'Generate reading questions that test the article content, not generic vocabulary only.',
          'Return strict JSON with this exact shape:',
          '{"vocabQuestion":{"word":"","options":["","","",""],"answer":0,"explanation":""},"contentQuestion":{"question":"","options":["","","",""],"answer":0,"explanation":""},"compQuestion":"","shortAnswer":{"question":"","expectedAnswer":"","rubric":["",""]}}',
          'The answer indexes must be 0-3. The contentQuestion must check a key fact, cause/effect, or implication from the article.',
          articleText,
        ].join('\n\n'),
      },
    ],
    'You generate concise English-learning quizzes from news articles. Output strict JSON only.',
    { task: 'quiz-evaluation' },
  );

  const parsed = parseJson<Partial<NewsQuiz>>(quizResponse);
  const word = parsed.vocabQuestion?.word?.trim();
  const options = parsed.vocabQuestion?.options?.map((option) => option.trim()).filter(Boolean) || [];
  const answer = typeof parsed.vocabQuestion?.answer === 'number' ? parsed.vocabQuestion.answer : -1;
  const contentQuestion = parseContentQuestion(parsed.contentQuestion);
  const shortAnswer = parseShortAnswerPrompt(parsed.shortAnswer);

  if (!word || options.length !== 4 || answer < 0 || answer > 3 || !parsed.compQuestion?.trim() || !contentQuestion || !shortAnswer) {
    throw new Error('Quiz generation returned incomplete content.');
  }

  return {
    vocabQuestion: {
      word,
      options,
      answer,
      explanation: parsed.vocabQuestion?.explanation?.trim() || '',
    },
    compQuestion: parsed.compQuestion.trim(),
    contentQuestion,
    shortAnswer,
  };
}

function parseContentQuestion(question: NewsQuiz['contentQuestion'] | undefined): NonNullable<NewsQuiz['contentQuestion']> | null {
  if (!question?.question?.trim()) return null;
  const options = question?.options?.map((option) => option.trim()).filter(Boolean) || [];
  const answer = typeof question?.answer === 'number' && question.answer >= 0 && question.answer <= 3 ? question.answer : -1;
  if (options.length !== 4 || answer === -1 || !question.explanation?.trim()) return null;

  return {
    question: question.question.trim(),
    options,
    answer,
    explanation: question.explanation.trim(),
  };
}

function parseShortAnswerPrompt(prompt: NewsQuiz['shortAnswer'] | undefined): NonNullable<NewsQuiz['shortAnswer']> | null {
  if (!prompt?.question?.trim() || !prompt.expectedAnswer?.trim()) return null;
  const rubric = prompt?.rubric?.map((item) => item.trim()).filter(Boolean) || [];
  if (rubric.length === 0) return null;

  return {
    question: prompt.question.trim(),
    expectedAnswer: prompt.expectedAnswer.trim(),
    rubric,
  };
}

function parseJson<T>(input: string): T {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] || trimmed;
  return JSON.parse(jsonText) as T;
}

function isNewsSourceExtractionError(error: unknown): error is NewsSourceExtractionError {
  return error instanceof NewsSourceExtractionError;
}

async function readJsonResponse<T>(response: Response, serviceName: string): Promise<T> {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as T;
  } catch {
    const preview = responseText.trim().replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`${serviceName} returned an unexpected non-JSON response${response.status ? ` with status ${response.status}` : ''}${preview ? `: ${preview}` : '.'}`);
  }
}

function truncateArticleText(text: string): string {
  if (text.length <= MAX_ARTICLE_PROMPT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_ARTICLE_PROMPT_CHARS)}\n\n[Article text truncated for processing.]`;
}

function buildFallbackArticle(
  feedItem: NewsFeedItem,
  sourceDomain: string | null,
  enrichmentStatus: EnrichedNewsArticle['enrichmentStatus'],
  overrides?: Pick<EnrichedNewsArticle, 'detectedLanguage' | 'isEnglish'>,
): EnrichedNewsArticle {
  const paragraphs = [feedItem.excerpt];
  return {
    ...feedItem,
    paragraphs,
    readTime: estimateReadTime(feedItem.excerpt),
    quiz: null,
    recommendationScore: 0,
    enrichmentStatus,
    sourceDomain,
    sourceUrl: feedItem.link,
    fetchedAt: Date.now(),
    cleanedAt: null,
    quizGeneratedAt: null,
    pipelineVersion: PIPELINE_VERSION,
    detectedLanguage: overrides?.detectedLanguage,
    isEnglish: overrides?.isEnglish,
  };
}

function withRecommendation(article: EnrichedNewsArticle, preferences: string[]): EnrichedNewsArticle {
  const normalizedPreferences = preferences.map((preference) => preference.toLowerCase());
  const categoryMatches = article.rawCategory.filter((category) => normalizedPreferences.includes(category.toLowerCase())).length;
  const keywordMatches = article.keywords.filter((keyword) =>
    normalizedPreferences.some((preference) => keyword.toLowerCase().includes(preference) || preference.includes(keyword.toLowerCase())),
  ).length;
  const customPreferenceMatches = normalizedPreferences.filter(
    (preference) => !NEWSDATA_CATEGORIES.has(preference) && `${article.title} ${article.excerpt}`.toLowerCase().includes(preference),
  ).length;
  const textPreferenceMatches = normalizedPreferences.filter((preference) =>
    `${article.title} ${article.excerpt} ${article.keywords.join(' ')}`.toLowerCase().includes(preference),
  ).length;

  const languagePenalty = article.enrichmentStatus === 'non-english' ? -100 : 0;
  const recommendationScore = languagePenalty + categoryMatches * 5 + keywordMatches * 3 + customPreferenceMatches * 4 + textPreferenceMatches * 2 + (article.enrichmentStatus === 'ready' ? 1 : 0);

  return {
    ...article,
    recommendationScore,
  };
}

function normalizeShortAnswerEvaluation(
  evaluation: Partial<NewsShortAnswerEvaluation>,
): NewsShortAnswerEvaluation {
  if (typeof evaluation.score !== 'number') {
    throw new Error('Short-answer evaluation response is missing numeric score.');
  }
  if (typeof evaluation.isCorrect !== 'boolean') {
    throw new Error('Short-answer evaluation response is missing isCorrect.');
  }
  if (typeof evaluation.feedback !== 'string' || !evaluation.feedback.trim()) {
    throw new Error('Short-answer evaluation response is missing feedback.');
  }
  if (typeof evaluation.sampleAnswer !== 'string' || !evaluation.sampleAnswer.trim()) {
    throw new Error('Short-answer evaluation response is missing sampleAnswer.');
  }

  const score = Math.max(0, Math.min(100, Math.round(evaluation.score)));
  return {
    score,
    isCorrect: evaluation.isCorrect,
    feedback: evaluation.feedback.trim(),
    sampleAnswer: evaluation.sampleAnswer.trim(),
  };
}
