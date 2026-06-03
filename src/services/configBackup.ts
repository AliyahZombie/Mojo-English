const BACKUP_VERSION = 1;
const DICTIONARY_DB_NAME = 'MojoDictionaryDB';
const DICTIONARY_DB_VERSION = 5;

const LOCAL_STORAGE_KEYS = ['mojo-app-store', 'mojo-fsrs-store', 'mojo-chat-store'] as const;
const EXPORTABLE_INDEXED_DB_STORES = ['aiCache', 'newsArticles', 'newsFeedPages', 'newsCrawlDomains'] as const;
const OFFLINE_DICTIONARY_STORES = ['words', 'tagWords', 'dictionaryMeta'] as const;

type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[number];
type ExportableIndexedDbStore = typeof EXPORTABLE_INDEXED_DB_STORES[number];
type OfflineDictionaryStore = typeof OFFLINE_DICTIONARY_STORES[number];
type DictionaryStore = ExportableIndexedDbStore | OfflineDictionaryStore;

interface LocalStorageBackupEntry {
  key: LocalStorageKey;
  value: string;
}

interface IndexedDbRecordBackup {
  key: IDBValidKey;
  value: unknown;
}

interface IndexedDbStoreBackup {
  name: ExportableIndexedDbStore;
  records: IndexedDbRecordBackup[];
}

interface MojoConfigBackup {
  app: 'Mojo';
  version: number;
  exportedAt: string;
  localStorage: LocalStorageBackupEntry[];
  indexedDb: IndexedDbStoreBackup[];
  excludedStores: OfflineDictionaryStore[];
}

export type ConfigBackupLocalStorageOverrides = Partial<Record<LocalStorageKey, string>>;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function createDictionaryStores(db: IDBDatabase): void {
  const createStore = (name: DictionaryStore, options?: IDBObjectStoreParameters) => {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, options);
    }
  };

  createStore('words', { keyPath: 'word' });
  createStore('aiCache');
  createStore('tagWords', { keyPath: 'tag' });
  createStore('dictionaryMeta', { keyPath: 'key' });
  createStore('newsArticles', { keyPath: 'id' });
  createStore('newsFeedPages', { keyPath: 'key' });
  createStore('newsCrawlDomains', { keyPath: 'domain' });
}

async function openDictionaryDb(): Promise<IDBDatabase> {
  const openWithVersion = (useVersion: boolean) => new Promise<IDBDatabase>((resolve, reject) => {
    const request = useVersion
      ? indexedDB.open(DICTIONARY_DB_NAME, DICTIONARY_DB_VERSION)
      : indexedDB.open(DICTIONARY_DB_NAME);

    request.onupgradeneeded = () => createDictionaryStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });

  try {
    return await openWithVersion(true);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'VersionError') {
      return openWithVersion(false);
    }
    throw error;
  }
}

async function exportIndexedDbStores(): Promise<IndexedDbStoreBackup[]> {
  if (!('indexedDB' in window)) return [];

  const db = await openDictionaryDb();
  try {
    const existingStores = EXPORTABLE_INDEXED_DB_STORES.filter((storeName) => db.objectStoreNames.contains(storeName));
    if (existingStores.length === 0) return [];

    const transaction = db.transaction(existingStores, 'readonly');
    const stores = await Promise.all(existingStores.map(async (storeName) => {
      const store = transaction.objectStore(storeName);
      const [keys, values] = await Promise.all([
        requestToPromise<IDBValidKey[]>(store.getAllKeys()),
        requestToPromise<unknown[]>(store.getAll()),
      ]);

      return {
        name: storeName,
        records: keys.map((key, index) => ({ key, value: values[index] })),
      };
    }));
    await transactionDone(transaction);
    return stores;
  } finally {
    db.close();
  }
}

function collectLocalStorageEntries(): LocalStorageBackupEntry[] {
  return LOCAL_STORAGE_KEYS.flatMap((key) => {
    const value = localStorage.getItem(key);
    return value === null ? [] : [{ key, value }];
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

export function createZustandPersistValue(currentValue: string | null, state: Record<string, unknown>): string {
  const existing = currentValue ? parseJsonObject(currentValue, 'Existing persisted state') : {};
  const existingState = isObject(existing.state) ? existing.state : {};

  return JSON.stringify({
    ...existing,
    state: {
      ...existingState,
      ...state,
    },
  });
}

function isLocalStorageEntry(value: unknown): value is LocalStorageBackupEntry {
  if (!isObject(value)) return false;
  return LOCAL_STORAGE_KEYS.includes(value.key as LocalStorageKey) && typeof value.value === 'string';
}

function validateZustandStorageEntry(entry: LocalStorageBackupEntry): void {
  const parsed = parseJsonObject(entry.value, `${entry.key} backup data`);
  if (!isObject(parsed.state)) {
    throw new Error(`${entry.key} backup data is missing a valid state object`);
  }
}

function isIndexedDbRecord(value: unknown): value is IndexedDbRecordBackup {
  if (!isObject(value)) return false;
  return (typeof value.key === 'string' || typeof value.key === 'number') && 'value' in value;
}

function isIndexedDbStore(value: unknown): value is IndexedDbStoreBackup {
  if (!isObject(value)) return false;
  return EXPORTABLE_INDEXED_DB_STORES.includes(value.name as ExportableIndexedDbStore)
    && Array.isArray(value.records)
    && value.records.every(isIndexedDbRecord);
}

function parseBackupFile(raw: string): MojoConfigBackup {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) throw new Error('Backup file must be a JSON object');
  if (parsed.app !== 'Mojo') throw new Error('This is not a Mojo backup file');
  if (parsed.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(parsed.version)}`);
  if (!Array.isArray(parsed.localStorage) || !parsed.localStorage.every(isLocalStorageEntry)) {
    throw new Error('Backup localStorage data is invalid');
  }
  parsed.localStorage.forEach(validateZustandStorageEntry);
  if (!Array.isArray(parsed.indexedDb) || !parsed.indexedDb.every(isIndexedDbStore)) {
    throw new Error('Backup IndexedDB data is invalid');
  }

  return {
    app: 'Mojo',
    version: BACKUP_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    localStorage: parsed.localStorage,
    indexedDb: parsed.indexedDb,
    excludedStores: Array.isArray(parsed.excludedStores)
      ? parsed.excludedStores.filter((store): store is OfflineDictionaryStore => OFFLINE_DICTIONARY_STORES.includes(store as OfflineDictionaryStore))
      : [...OFFLINE_DICTIONARY_STORES],
  };
}

async function restoreIndexedDbStores(stores: IndexedDbStoreBackup[]): Promise<void> {
  if (!('indexedDB' in window)) return;

  const db = await openDictionaryDb();
  try {
    const storeNames = EXPORTABLE_INDEXED_DB_STORES.filter((storeName) => db.objectStoreNames.contains(storeName));
    if (storeNames.length === 0) return;
    const storeBackups = new Map(stores.map((store) => [store.name, store.records]));

    const transaction = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const record of storeBackups.get(storeName) || []) {
        if (storeName === 'aiCache') {
          store.put(record.value, record.key);
        } else {
          store.put(record.value);
        }
      }
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function createConfigBackup(localStorageOverrides: ConfigBackupLocalStorageOverrides = {}): Promise<Blob> {
  const localStorageEntries = collectLocalStorageEntries().map((entry) => ({
    ...entry,
    value: localStorageOverrides[entry.key] || entry.value,
  }));

  for (const key of LOCAL_STORAGE_KEYS) {
    if (localStorageOverrides[key] && !localStorageEntries.some((entry) => entry.key === key)) {
      localStorageEntries.push({ key, value: localStorageOverrides[key] });
    }
  }

  const backup: MojoConfigBackup = {
    app: 'Mojo',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    localStorage: localStorageEntries,
    indexedDb: await exportIndexedDbStores(),
    excludedStores: [...OFFLINE_DICTIONARY_STORES],
  };

  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

export async function restoreConfigBackup(file: File): Promise<void> {
  const backup = parseBackupFile(await file.text());

  await restoreIndexedDbStores(backup.indexedDb);

  for (const key of LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }

  for (const entry of backup.localStorage) {
    localStorage.setItem(entry.key, entry.value);
  }
}

export function getConfigBackupFileName(date = new Date()): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `mojo-config-backup-${timestamp}.json`;
}
