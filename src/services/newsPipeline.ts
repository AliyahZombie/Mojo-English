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

const PIPELINE_VERSION = 'news-pipeline-v2';

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
    if (cachedPage) {
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
}: EnrichArticleParams): Promise<EnrichedNewsArticle> {
  const cached = await getCachedNewsArticle(feedItem.id);
  if (cached && cached.pipelineVersion === PIPELINE_VERSION) {
    return withRecommendation(cached, preferences);
  }

  const sourceDomain = getSourceDomain(feedItem.link);
  if (sourceDomain) {
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
    if (sourceDomain) {
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
    if (sourceDomain) {
      const domainHealth = await recordNewsDomainFailure(sourceDomain);
      const fallbackStatus = domainHealth.blacklistedAt ? 'blacklisted-source' : 'failed';
      const fallback = buildFallbackArticle(feedItem, sourceDomain, fallbackStatus, {
        detectedLanguage: language.detectedLanguage,
        isEnglish: true,
      });
      await setCachedNewsArticle(fallback);
      return withRecommendation(fallback, preferences);
    }

    const fallback = buildFallbackArticle(feedItem, null, 'failed', {
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

  try {
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
    return normalizeShortAnswerEvaluation(parsed, shortAnswerPrompt?.expectedAnswer || article.quiz.compQuestion);
  } catch {
    return fallbackShortAnswerEvaluation(article, normalizedAnswer);
  }
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

  const data = (await response.json()) as {
    results?: Array<{ raw_content?: string; content?: string; markdown?: string; text?: string }>;
    error?: string;
    detail?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || data.detail || data.message || 'Tavily extraction failed.');
  }

  const payload = data.results?.[0];
  const rawContent = payload?.raw_content || payload?.content || payload?.markdown || payload?.text || '';
  if (!rawContent.trim()) {
    throw new Error('Tavily returned empty article content.');
  }
  return rawContent;
}

async function cleanArticleParagraphs(feedItem: NewsFeedItem, rawArticleText: string): Promise<string[]> {
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
          rawArticleText,
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
  const word = parsed.vocabQuestion?.word?.trim() || pickQuizWord(articleText);
  const options = parsed.vocabQuestion?.options?.map((option) => option.trim()).filter(Boolean) || [];
  const answer = typeof parsed.vocabQuestion?.answer === 'number' ? parsed.vocabQuestion.answer : 0;
  const normalizedOptions = options.length === 4
    ? options
    : [
        'The main context that explains the word.',
        'A type of person mentioned in the article.',
        'A place where the news happened.',
        'A number used in the report.',
      ];

  return {
    vocabQuestion: {
      word,
      options: normalizedOptions,
      answer: answer >= 0 && answer <= 3 ? answer : 0,
      explanation: parsed.vocabQuestion?.explanation?.trim() || `The meaning of "${word}" should be inferred from the surrounding article context.`,
    },
    compQuestion: parsed.compQuestion?.trim() || `What is the main point of "${feedItem.title}"?`,
    contentQuestion: normalizeContentQuestion(parsed.contentQuestion, feedItem.title),
    shortAnswer: normalizeShortAnswerPrompt(parsed.shortAnswer, feedItem.title),
  };
}

function normalizeContentQuestion(question: NewsQuiz['contentQuestion'] | undefined, title: string): NonNullable<NewsQuiz['contentQuestion']> {
  const options = question?.options?.map((option) => option.trim()).filter(Boolean) || [];
  const answer = typeof question?.answer === 'number' && question.answer >= 0 && question.answer <= 3 ? question.answer : 0;
  return {
    question: question?.question?.trim() || `Which statement best captures the key point of "${title}"?`,
    options: options.length === 4 ? options : [
      'The article reports the central development described in the headline.',
      'The article is mainly a weather forecast.',
      'The article is only an advertisement.',
      'The article focuses on unrelated entertainment gossip.',
    ],
    answer,
    explanation: question?.explanation?.trim() || 'The correct option should match the main development and supporting details in the article.',
  };
}

function normalizeShortAnswerPrompt(prompt: NewsQuiz['shortAnswer'] | undefined, title: string): NonNullable<NewsQuiz['shortAnswer']> {
  const rubric = prompt?.rubric?.map((item) => item.trim()).filter(Boolean) || [];
  return {
    question: prompt?.question?.trim() || `Summarize the main point of "${title}" in one or two sentences.`,
    expectedAnswer: prompt?.expectedAnswer?.trim() || `A good answer identifies the main update in "${title}" and mentions at least one supporting detail from the article.`,
    rubric: rubric.length > 0 ? rubric : ['Mentions the main event or claim.', 'Uses at least one concrete supporting detail.', 'Avoids adding facts not present in the article.'],
  };
}

function parseJson<T>(input: string): T {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] || trimmed;
  return JSON.parse(jsonText) as T;
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
    quiz: {
      vocabQuestion: {
        word: pickQuizWord(feedItem.excerpt),
        options: [
          'A clue from the article context.',
          'A proper name in the story.',
          'A date mentioned by the reporter.',
          'A platform where the article was shared.',
        ],
        answer: 0,
        explanation: 'Use the article preview to infer the word from context.',
      },
      compQuestion: `What is the core update in "${feedItem.title}"?`,
      contentQuestion: normalizeContentQuestion(undefined, feedItem.title),
      shortAnswer: normalizeShortAnswerPrompt(undefined, feedItem.title),
    },
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

function pickQuizWord(text: string): string {
  return text.match(/\b[a-zA-Z]{7,}\b/)?.[0]?.toLowerCase() || 'context';
}

function normalizeShortAnswerEvaluation(
  evaluation: Partial<NewsShortAnswerEvaluation>,
  fallbackSampleAnswer: string,
): NewsShortAnswerEvaluation {
  const score = typeof evaluation.score === 'number' ? Math.max(0, Math.min(100, Math.round(evaluation.score))) : 0;
  return {
    score,
    isCorrect: typeof evaluation.isCorrect === 'boolean' ? evaluation.isCorrect : score >= 70,
    feedback: evaluation.feedback?.trim() || (score >= 70 ? 'Good answer. It captures the article content.' : 'Review the article and add more concrete details.'),
    sampleAnswer: evaluation.sampleAnswer?.trim() || fallbackSampleAnswer,
  };
}

function fallbackShortAnswerEvaluation(article: EnrichedNewsArticle, answer: string): NewsShortAnswerEvaluation {
  const expected = article.quiz.shortAnswer?.expectedAnswer || article.quiz.compQuestion;
  const importantWords: string[] = expected.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? [];
  const answerText = answer.toLowerCase();
  const matched = importantWords.filter((word, index) => importantWords.indexOf(word) === index && answerText.includes(word)).length;
  const score = Math.max(20, Math.min(85, Math.round((matched / Math.max(importantWords.length, 1)) * 100)));
  return {
    score,
    isCorrect: score >= 70,
    feedback: score >= 70
      ? 'Good answer. It overlaps with the expected key points; compare it with the sample for nuance.'
      : 'This needs more article-specific detail. Mention the main event and one supporting fact from the passage.',
    sampleAnswer: expected,
  };
}
