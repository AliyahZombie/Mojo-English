import { openDB, DBSchema, IDBPDatabase } from 'idb';
import Papa from 'papaparse';

interface DictionarySchema extends DBSchema {
  words: {
    key: string;
    value: EcdictWord;
    indexes: { 'by-word': string };
  };
  aiCache: {
    key: string;
    value: any;
  };
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

const DB_NAME = 'MojoDictionaryDB';
const STORE_NAME = 'words';

let dbPromise: Promise<IDBPDatabase<DictionarySchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DictionarySchema>(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORE_NAME, { keyPath: 'word' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('aiCache');
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

export async function setAiCache(word: string, data: any) {
  const db = await getDb();
  await db.put('aiCache', data, word.toLowerCase());
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

export async function getWordsByTag(tag: string): Promise<string[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    // Using IDB API directly to avoid async/await overhead on millions of records
    const store = tx.objectStore(STORE_NAME) as unknown as IDBObjectStore;
    const words: string[] = [];
    const tagLower = tag.toLowerCase();

    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        const value = cursor.value;
        if (value && value.tag) {
          const tags = value.tag.toLowerCase().split(/[\s,]+/);
          if (tags.includes(tagLower)) {
            words.push(value.word);
          }
        }
        cursor.continue();
      } else {
        resolve(words);
      }
    };
    
    request.onerror = (err) => {
      reject(err);
    };
  });
}

export async function searchOfflineDictionary(query: string): Promise<EcdictWord | null> {
  const db = await getDb();
  if (!query || query.trim() === '') return null;
  const word = query.trim().toLowerCase();
  
  // Try exact match first
  let result = await db.get(STORE_NAME, word);
  if (result) return result;
  
  // Try case-insensitive matching if exact match not found
  // This is expensive if we do cursor, so we just assume words are stored lowercase in the CSV mostly,
  // or exactly as they were. ECDICT mostly uses exact words, so exact match is usually fine.
  
  // Also we can try the capitalized version
  result = await db.get(STORE_NAME, query.trim());
  if (result) return result;
  
  result = await db.get(STORE_NAME, query.trim().charAt(0).toUpperCase() + query.trim().slice(1).toLowerCase());
  return result || null;
}

export async function importDictionaryFromBlob(
  file: File,
  onProgress?: (progress: { status: string; loaded?: number; total?: number; rowsProcessed?: number }) => void
): Promise<void> {
  try {
    const total = file.size;
    let loaded = 0;
    let rowsProcessed = 0;
    
    if (onProgress) onProgress({ status: 'reading', total, loaded: 0 });
    
    const db = await getDb();
    
    // Clear old data
    const clearTx = db.transaction(STORE_NAME, 'readwrite');
    await clearTx.objectStore(STORE_NAME).clear();
    await clearTx.done;
    
    let batch: EcdictWord[] = [];
    const BATCH_SIZE = 10000;
    
    const flushBatch = async () => {
      if (batch.length === 0) return;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of batch) {
        store.put({ ...item, word: item.word.toLowerCase(), originalWord: item.word });
      }
      await tx.done;
      batch = [];
    };

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        chunk: function(results, parser) {
          loaded += results.meta.cursor; // proxy for progress
          if (onProgress) onProgress({ status: 'parsing', loaded, total, rowsProcessed });
          
          const rows = results.data as any[];
          for (const row of rows) {
            if (row.word) {
              rowsProcessed++;
              batch.push({
                word: row.word,
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
              });
            }
          }
          
          if (batch.length >= 10000) {
            parser.pause();
            flushBatch().then(() => {
              parser.resume();
            }).catch(reject);
          }
        },
        complete: function() {
          flushBatch().then(() => {
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

