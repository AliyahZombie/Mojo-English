import { openDB, DBSchema, IDBPDatabase } from 'idb';
import Papa from 'papaparse';
import type { CachedNewsFeedPage, EnrichedNewsArticle, NewsDomainHealth } from './newsTypes';

const DB_NAME = 'MojoDictionaryDB';
const STORE_NAME = 'words';
const TAG_STORE_NAME = 'tagWords';
const META_STORE_NAME = 'dictionaryMeta';
const NEWS_ARTICLES_STORE_NAME = 'newsArticles';
const NEWS_FEED_PAGES_STORE_NAME = 'newsFeedPages';
const NEWS_CRAWL_DOMAINS_STORE_NAME = 'newsCrawlDomains';
const IMPORT_BATCH_SIZE = 15000;
const WORD_CACHE_LIMIT = 1000;

interface DictionarySchema extends DBSchema {
  words: {
    key: string;
    value: EcdictWord;
    indexes: { 'by-word': string };
  };
  tagWords: {
    key: string;
    value: DictionaryTagWords;
  };
  dictionaryMeta: {
    key: string;
    value: DictionaryMetaValue;
  };
  aiCache: {
    key: string;
    value: any;
  };
  newsArticles: {
    key: string;
    value: EnrichedNewsArticle;
  };
  newsFeedPages: {
    key: string;
    value: CachedNewsFeedPage;
  };
  newsCrawlDomains: {
    key: string;
    value: NewsDomainHealth;
  };
}

interface DictionaryTagWords {
  tag: string;
  words: string[];
}

interface DictionaryMetaValue {
  key: string;
  value: string;
}

interface DictionaryCsvRow {
  word?: string;
  phonetic?: string;
  definition?: string;
  translation?: string;
  pos?: string;
  collins?: string;
  oxford?: string;
  tag?: string;
  bnc?: string;
  frq?: string;
  exchange?: string;
}

export interface EcdictWord {
  word: string;
  originalWord?: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
  collins: string;
  oxford: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
}

let dbPromise: Promise<IDBPDatabase<DictionarySchema>> | null = null;
let tagIndexRebuildPromise: Promise<void> | null = null;
const wordCache = new Map<string, EcdictWord>();

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DictionarySchema>(DB_NAME, 5, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORE_NAME, { keyPath: 'word' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('aiCache');
        }
        if (oldVersion < 3) {
          db.createObjectStore(TAG_STORE_NAME, { keyPath: 'tag' });
        }
        if (oldVersion < 4) {
          db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
        }
        if (oldVersion < 5) {
          db.createObjectStore(NEWS_ARTICLES_STORE_NAME, { keyPath: 'id' });
          db.createObjectStore(NEWS_FEED_PAGES_STORE_NAME, { keyPath: 'key' });
          db.createObjectStore(NEWS_CRAWL_DOMAINS_STORE_NAME, { keyPath: 'domain' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getAiCache(word: string) {
  const db = await getDb();
  return await db.get('aiCache', word.toLowerCase());
}

function cacheWord(word: EcdictWord): void {
  if (wordCache.has(word.word)) {
    wordCache.delete(word.word);
  }
  wordCache.set(word.word, word);

  if (wordCache.size > WORD_CACHE_LIMIT) {
    const oldestKey = wordCache.keys().next().value;
    if (oldestKey) wordCache.delete(oldestKey);
  }
}

export async function setAiCache(word: string, data: any) {
  const db = await getDb();
  await db.put('aiCache', data, word.toLowerCase());
}

export async function getCachedNewsArticle(articleId: string): Promise<EnrichedNewsArticle | undefined> {
  const db = await getDb();
  return db.get(NEWS_ARTICLES_STORE_NAME, articleId);
}

export async function setCachedNewsArticle(article: EnrichedNewsArticle): Promise<void> {
  const db = await getDb();
  await db.put(NEWS_ARTICLES_STORE_NAME, article);
}

export async function searchCachedNewsArticlesByTitle(title: string, limit = 5): Promise<EnrichedNewsArticle[]> {
  const normalizedQuery = title.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const db = await getDb();
  const results: EnrichedNewsArticle[] = [];
  let cursor = await db.transaction(NEWS_ARTICLES_STORE_NAME).store.openCursor();

  while (cursor && results.length < limit) {
    const article = cursor.value;
    if (article.title.toLowerCase().includes(normalizedQuery)) {
      results.push(article);
    }
    cursor = await cursor.continue();
  }

  return results;
}

export async function getCachedNewsFeedPage(key: string): Promise<CachedNewsFeedPage | undefined> {
  const db = await getDb();
  return db.get(NEWS_FEED_PAGES_STORE_NAME, key);
}

export async function setCachedNewsFeedPage(page: CachedNewsFeedPage): Promise<void> {
  const db = await getDb();
  await db.put(NEWS_FEED_PAGES_STORE_NAME, page);
}

export async function getNewsDomainHealth(domain: string): Promise<NewsDomainHealth | undefined> {
  const db = await getDb();
  return db.get(NEWS_CRAWL_DOMAINS_STORE_NAME, domain);
}

export async function setNewsDomainHealth(domainHealth: NewsDomainHealth): Promise<void> {
  const db = await getDb();
  await db.put(NEWS_CRAWL_DOMAINS_STORE_NAME, domainHealth);
}

export async function recordNewsDomainFailure(domain: string): Promise<NewsDomainHealth> {
  const current = await getNewsDomainHealth(domain);
  const nextFailures = (current?.consecutiveFailures || 0) + 1;
  const nextState: NewsDomainHealth = {
    domain,
    consecutiveFailures: nextFailures,
    blacklistedAt: nextFailures >= 5 ? Date.now() : current?.blacklistedAt || null,
    lastErrorAt: Date.now(),
    lastSuccessAt: current?.lastSuccessAt || null,
  };
  await setNewsDomainHealth(nextState);
  return nextState;
}

export async function recordNewsDomainSuccess(domain: string): Promise<NewsDomainHealth> {
  const current = await getNewsDomainHealth(domain);
  const nextState: NewsDomainHealth = {
    domain,
    consecutiveFailures: 0,
    blacklistedAt: null,
    lastErrorAt: current?.lastErrorAt || null,
    lastSuccessAt: Date.now(),
  };
  await setNewsDomainHealth(nextState);
  return nextState;
}

export async function isDictionaryLoaded(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count(STORE_NAME);
  return count > 0;
}

export async function getDictionaryWordCount(): Promise<number> {
  const db = await getDb();
  return await db.count(STORE_NAME);
}

function getNormalizedTags(tag: string): string[] {
  return tag
    .toLowerCase()
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toStoredWord(row: DictionaryCsvRow): EcdictWord | null {
  const rawWord = row.word?.trim();
  if (!rawWord) return null;

  return {
    word: rawWord.toLowerCase(),
    originalWord: rawWord,
    phonetic: row.phonetic || '',
    definition: row.definition || '',
    translation: row.translation || '',
    pos: row.pos || '',
    collins: row.collins || '',
    oxford: row.oxford || '',
    tag: row.tag || '',
    bnc: row.bnc || '',
    frq: row.frq || '',
    exchange: row.exchange || ''
  };
}

async function writeDictionaryBatch(
  db: IDBPDatabase<DictionarySchema>,
  words: EcdictWord[],
  tagMap: Map<string, string[]>
): Promise<void> {
  if (words.length === 0) return;

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const word of words) {
    store.put(word);

    for (const tag of getNormalizedTags(word.tag)) {
      const taggedWords = tagMap.get(tag);
      if (taggedWords) {
        taggedWords.push(word.word);
      } else {
        tagMap.set(tag, [word.word]);
      }
    }
  }

  await tx.done;
}

async function writeTagIndex(db: IDBPDatabase<DictionarySchema>, tagMap: Map<string, string[]>): Promise<void> {
  const tx = db.transaction([TAG_STORE_NAME, META_STORE_NAME], 'readwrite');
  const tagStore = tx.objectStore(TAG_STORE_NAME);
  const metaStore = tx.objectStore(META_STORE_NAME);
  tagStore.clear();
  metaStore.clear();

  for (const [tag, words] of tagMap) {
    tagStore.put({ tag, words });
  }

  metaStore.put({ key: 'tagIndexReady', value: 'true' });

  await tx.done;
}

async function isTagIndexReady(db: IDBPDatabase<DictionarySchema>): Promise<boolean> {
  const meta = await db.get(META_STORE_NAME, 'tagIndexReady');
  return meta?.value === 'true';
}

async function rebuildTagIndex(db: IDBPDatabase<DictionarySchema>): Promise<void> {
  if (tagIndexRebuildPromise) return tagIndexRebuildPromise;

  tagIndexRebuildPromise = (async () => {
    const tagMap = new Map<string, string[]>();
    let cursor = await db.transaction(STORE_NAME, 'readonly').store.openCursor();

    while (cursor) {
      const word = cursor.value;
      for (const tag of getNormalizedTags(word.tag)) {
        const taggedWords = tagMap.get(tag);
        if (taggedWords) {
          taggedWords.push(word.word);
        } else {
          tagMap.set(tag, [word.word]);
        }
      }
      cursor = await cursor.continue();
    }

    await writeTagIndex(db, tagMap);
  })().finally(() => {
    tagIndexRebuildPromise = null;
  });

  return tagIndexRebuildPromise;
}

export async function getWordsByTag(tag: string): Promise<string[]> {
  const db = await getDb();
  const tagLower = tag.trim().toLowerCase();
  if (!tagLower) return [];

  if (await isTagIndexReady(db)) {
    const tagEntry = await db.get(TAG_STORE_NAME, tagLower);
    return tagEntry?.words || [];
  }

  if (await db.count(TAG_STORE_NAME) > 0) return [];

  if (await db.count(STORE_NAME) === 0) return [];

  await rebuildTagIndex(db);
  const tagEntry = await db.get(TAG_STORE_NAME, tagLower);
  return tagEntry?.words || [];
}

export async function searchOfflineDictionary(query: string): Promise<EcdictWord | null> {
  if (!query || query.trim() === '') return null;
  const word = query.trim().toLowerCase();
  const cached = wordCache.get(word);
  if (cached) return cached;

  const db = await getDb();
  let result = await db.get(STORE_NAME, word);
  if (result) {
    cacheWord(result);
    return result;
  }

  const rawQuery = query.trim();
  if (rawQuery !== word) {
    result = await db.get(STORE_NAME, rawQuery);
    if (result) {
      cacheWord(result);
      cacheWord({ ...result, word });
      return result;
    }
  }

  const capitalized = rawQuery.charAt(0).toUpperCase() + rawQuery.slice(1).toLowerCase();
  if (capitalized !== rawQuery) {
    result = await db.get(STORE_NAME, capitalized);
    if (result) {
      cacheWord(result);
      cacheWord({ ...result, word });
      return result;
    }
  }

  return null;
}

export async function importDictionaryFromBlob(
  file: File,
  onProgress?: (progress: { status: string; loaded?: number; total?: number; rowsProcessed?: number }) => void
): Promise<void> {
  try {
    const total = file.size;
    let rowsProcessed = 0;
    
    if (onProgress) onProgress({ status: 'reading', total, loaded: 0 });
    
    const db = await getDb();
    
    // Clear old data
    const clearTx = db.transaction([STORE_NAME, TAG_STORE_NAME, META_STORE_NAME], 'readwrite');
    clearTx.objectStore(STORE_NAME).clear();
    clearTx.objectStore(TAG_STORE_NAME).clear();
    clearTx.objectStore(META_STORE_NAME).clear();
    await clearTx.done;
    wordCache.clear();
    
    let batch: EcdictWord[] = [];
    const tagMap = new Map<string, string[]>();
    
    const flushBatch = async () => {
      if (batch.length === 0) return;
      await writeDictionaryBatch(db, batch, tagMap);
      batch = [];
    };

    return new Promise((resolve, reject) => {
      Papa.parse<DictionaryCsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        chunk: function(results, parser) {
          const loaded = results.meta.cursor;
          if (onProgress) onProgress({ status: 'parsing', loaded, total, rowsProcessed });
          
          const rows = results.data;
          for (const row of rows) {
            const word = toStoredWord(row);
            if (word) {
              rowsProcessed++;
              batch.push(word);
            }
          }
          
          if (batch.length >= IMPORT_BATCH_SIZE) {
            parser.pause();
            flushBatch().then(() => {
              parser.resume();
            }).catch(reject);
          }
        },
        complete: function() {
          flushBatch().then(() => {
            return writeTagIndex(db, tagMap);
          }).then(() => {
            if (onProgress) onProgress({ status: 'complete', loaded: total, total, rowsProcessed });
            resolve();
          }).catch(reject);
        },
        error: function(err) {
          reject(err);
        }
      });
    });

  } catch (error) {
    console.error('Error importing dictionary from file:', error);
    throw error;
  }
}
