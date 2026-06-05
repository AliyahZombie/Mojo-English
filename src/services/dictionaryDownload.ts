import { importDictionaryFromBlob, isDictionaryLoaded } from './dictionaryDb';

export const ECDICT_DOWNLOAD_URL = 'https://ghproxy.aliyahzombie.top/https://raw.githubusercontent.com/skywind3000/ECDICT/refs/heads/master/ecdict.csv';

export type DictionaryProgress = {
  status: string;
  loaded?: number;
  total?: number;
  rowsProcessed?: number;
};

export type DictionaryDownloadStatus = 'idle' | 'checking' | 'running' | 'done' | 'failed';

export type DictionaryDownloadSnapshot = {
  status: DictionaryDownloadStatus;
  progress: DictionaryProgress | null;
  error: string | null;
};

type DictionaryDownloadListener = (snapshot: DictionaryDownloadSnapshot) => void;

const listeners = new Set<DictionaryDownloadListener>();

let snapshot: DictionaryDownloadSnapshot = {
  status: 'idle',
  progress: null,
  error: null,
};
let downloadPromise: Promise<void> | null = null;

function emit(next: Partial<DictionaryDownloadSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function setProgress(progress: DictionaryProgress) {
  emit({ status: 'running', progress, error: null });
}

async function downloadDictionaryFile(): Promise<File> {
  setProgress({ status: 'fetching', loaded: 0 });

  const response = await fetch(ECDICT_DOWNLOAD_URL);
  if (!response.ok) throw new Error(`Dictionary download failed with HTTP ${response.status}`);

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : undefined;
  const reader = response.body?.getReader();

  if (!reader) {
    const blob = await response.blob();
    setProgress({ status: 'downloaded', loaded: blob.size, total: blob.size });
    return new File([blob], 'ecdict.csv', { type: 'text/csv' });
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  setProgress({ status: 'downloading', loaded, total });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    setProgress({ status: 'downloading', loaded, total });
  }

  const blob = new Blob(chunks, { type: 'text/csv' });
  setProgress({ status: 'downloaded', loaded: blob.size, total: total || blob.size });
  return new File([blob], 'ecdict.csv', { type: 'text/csv' });
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  emit({ status: 'failed', progress: null, error: message });
}

export function getDictionaryDownloadSnapshot(): DictionaryDownloadSnapshot {
  return snapshot;
}

export function subscribeDictionaryDownload(listener: DictionaryDownloadListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export async function startDictionaryDownload(options: { force?: boolean } = {}): Promise<void> {
  if (downloadPromise) return downloadPromise;
  if (!options.force && snapshot.status === 'done') return;

  downloadPromise = (async () => {
    try {
      if (!options.force) {
        emit({ status: 'checking', progress: null, error: null });
        if (await isDictionaryLoaded()) {
          emit({ status: 'done', progress: { status: 'complete' }, error: null });
          return;
        }
      }

      const file = await downloadDictionaryFile();
      await importDictionaryFromBlob(file, setProgress);
      emit({ status: 'done', progress: { status: 'complete' }, error: null });
    } catch (err) {
      fail(err);
      throw err;
    } finally {
      downloadPromise = null;
    }
  })();

  return downloadPromise;
}

export async function importDictionaryFile(file: File): Promise<void> {
  if (downloadPromise) return downloadPromise;

  downloadPromise = (async () => {
    try {
      setProgress({ status: 'reading', loaded: 0, total: file.size });
      await importDictionaryFromBlob(file, setProgress);
      emit({ status: 'done', progress: { status: 'complete' }, error: null });
    } catch (err) {
      fail(err);
      throw err;
    } finally {
      downloadPromise = null;
    }
  })();

  return downloadPromise;
}
