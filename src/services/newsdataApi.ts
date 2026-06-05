import type { NewsFeedItem, NewsFeedPage } from './newsTypes';

export type FetchNewsFeedParams = {
  apiKey: string;
  preferences: string[];
  search?: string;
  nextPage?: string;
};

type NewsDataResponse = {
  status?: string;
  results?: NewsDataArticle[];
  nextPage?: string;
  message?: string;
};

type NewsDataArticle = {
  article_id?: string;
  title?: string;
  link?: string;
  description?: string | null;
  content?: string | null;
  pubDate?: string;
  source_id?: string;
  source_name?: string;
  image_url?: string | null;
  category?: string[];
  keywords?: string[] | null;
};

const API_ENDPOINT = 'https://newsdata.io/api/1/news';
export const NEWSDATA_CATEGORIES = new Set([
  'business',
  'crime',
  'domestic',
  'education',
  'entertainment',
  'environment',
  'food',
  'health',
  'lifestyle',
  'other',
  'politics',
  'science',
  'sports',
  'technology',
  'top',
  'tourism',
  'world',
]);

export async function fetchNewsFeedPage({
  apiKey,
  preferences,
  search,
  nextPage,
}: FetchNewsFeedParams): Promise<NewsFeedPage> {
  if (!apiKey.trim()) {
    throw new Error('NewsData.io API key is missing. Add it in Settings first.');
  }

  const url = new URL(API_ENDPOINT);
  url.searchParams.set('apikey', apiKey.trim());
  url.searchParams.set('language', 'en');
  url.searchParams.set('size', '10');

  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    url.searchParams.set('q', normalizedSearch);
  }

  const normalizedNextPage = nextPage?.trim();
  if (normalizedNextPage) {
    url.searchParams.set('page', normalizedNextPage);
  }

  const categories = preferences.filter((preference) => NEWSDATA_CATEGORIES.has(preference));
  if (categories.length > 0) {
    url.searchParams.set('category', categories.slice(0, 5).join(','));
  }

  const customTopics = preferences.filter((preference) => !NEWSDATA_CATEGORIES.has(preference));
  if (!normalizedSearch && customTopics.length > 0) {
    url.searchParams.set('q', customTopics.slice(0, 3).join(' OR '));
  }

  const response = await fetch(url.toString());
  const data = await readJsonResponse<NewsDataResponse>(response, 'NewsData.io');

  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || `NewsData.io request failed with status ${response.status}`);
  }

  return {
    items: (data.results || []).map(mapNewsFeedItem).filter((item): item is NewsFeedItem => Boolean(item)),
    nextPage: data.nextPage || null,
  };
}

function mapNewsFeedItem(article: NewsDataArticle): NewsFeedItem | null {
  if (!article.article_id || !article.title) {
    return null;
  }

  const excerpt = (article.description || article.content || article.title).trim();

  return {
    id: article.article_id,
    title: article.title,
    source: article.source_name || article.source_id || 'NewsData.io',
    date: formatDate(article.pubDate),
    category: titleCase(article.category?.[0] || 'news'),
    excerpt,
    link: article.link || null,
    imageUrl: article.image_url || null,
    keywords: (article.keywords || []).filter(Boolean),
    rawCategory: article.category || [],
  };
}

export function estimateReadTime(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 220))} min read`;
}

export function formatDate(value?: string): string {
  if (!value) {
    return 'Today';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
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
