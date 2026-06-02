export type NewsFeedItem = {
  id: string;
  title: string;
  source: string;
  date: string;
  category: string;
  excerpt: string;
  link: string | null;
  imageUrl: string | null;
  keywords: string[];
  rawCategory: string[];
};

export type NewsQuiz = {
  vocabQuestion: {
    word: string;
    options: string[];
    answer: number;
    explanation?: string;
  };
  compQuestion: string;
  contentQuestion?: {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  };
  shortAnswer?: {
    question: string;
    expectedAnswer: string;
    rubric: string[];
  };
};

export type NewsShortAnswerEvaluation = {
  score: number;
  isCorrect: boolean;
  feedback: string;
  sampleAnswer: string;
};

export type NewsEnrichmentStatus =
  | 'idle'
  | 'extracting'
  | 'cleaning'
  | 'quizing'
  | 'ready'
  | 'failed'
  | 'non-english'
  | 'blacklisted-source';

export type EnrichedNewsArticle = NewsFeedItem & {
  paragraphs: string[];
  readTime: string;
  quiz: NewsQuiz;
  recommendationScore: number;
  enrichmentStatus: NewsEnrichmentStatus;
  sourceDomain: string | null;
  sourceUrl: string | null;
  fetchedAt: number;
  cleanedAt: number | null;
  quizGeneratedAt: number | null;
  pipelineVersion: string;
  detectedLanguage?: string;
  isEnglish?: boolean;
};

export type NewsDomainHealth = {
  domain: string;
  consecutiveFailures: number;
  blacklistedAt: number | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
};

export type NewsFeedPage = {
  items: NewsFeedItem[];
  nextPage: string | null;
};

export type CachedNewsFeedPage = {
  key: string;
  items: NewsFeedItem[];
  nextPage: string | null;
  fetchedAt: number;
};
