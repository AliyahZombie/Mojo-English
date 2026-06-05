import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { BookA, ChevronLeft, Database, Download, Edit3, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';

import { cn } from '../lib/utils';
import { parseDeckWords } from '../lib/decks';
import { translations } from '../lib/i18n';
import { isDictionaryLoaded, getDictionaryWordCount, getWordsByTag } from '../services/dictionaryDb';
import { uploadAndParseApkg } from '../services/deckApi';
import { useAppStore, type Deck } from '../store/useAppStore';

const ECDICT_DOWNLOAD_URL = 'https://ghproxy.aliyahzombie.top/https://raw.githubusercontent.com/skywind3000/ECDICT/refs/heads/master/ecdict.csv';
const ECDICT_TAGS = [
  { id: 'zk', name: '中考 / Zhongkao' },
  { id: 'gk', name: '高考 / Gaokao' },
  { id: 'ky', name: '考研 / Kaoyan' },
  { id: 'cet4', name: '四级 / CET-4' },
  { id: 'cet6', name: '六级 / CET-6' },
  { id: 'gre', name: 'GRE' },
  { id: 'toefl', name: 'TOEFL' },
  { id: 'ielts', name: 'IELTS' }
];

type DictionaryProgress = {
  status: string;
  loaded?: number;
  total?: number;
  rowsProcessed?: number;
};

interface DeckEditorState {
  mode: 'create' | 'edit';
  deckId?: string;
  name: string;
  wordsText: string;
}

function toWordsText(words: string[]): string {
  return words.join('\n');
}

function shuffleWords(words: string[]): string[] {
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function Decks() {
  const {
    decks,
    activeDeckId,
    language,
    addDeck,
    updateDeck,
    deleteDeck,
    setActiveDeckId,
    showAlert,
  } = useAppStore();
  const t = translations[language];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFromTag, setIsCreatingFromTag] = useState(false);
  const [customDeckTag, setCustomDeckTag] = useState('');
  const [dictStatus, setDictStatus] = useState<{ isLoaded: boolean; count: number }>({ isLoaded: false, count: 0 });
  const [dictProgress, setDictProgress] = useState<DictionaryProgress | null>(null);
  const [editor, setEditor] = useState<DeckEditorState | null>(null);

  useEffect(() => {
    isDictionaryLoaded().then(async (loaded) => {
      if (!loaded) return;
      const count = await getDictionaryWordCount();
      setDictStatus({ isLoaded: true, count });
    });
  }, []);

  const openCreateEditor = () => setEditor({ mode: 'create', name: '', wordsText: '' });
  const openEditEditor = (deck: Deck) => setEditor({ mode: 'edit', deckId: deck.id, name: deck.name, wordsText: toWordsText(deck.words) });

  const handleSaveDeck = () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      showAlert(t.enterDeckName);
      return;
    }

    const words = parseDeckWords(editor.wordsText);
    if (editor.mode === 'create') {
      const newDeck: Deck = {
        id: `deck-${Date.now()}`,
        name,
        words,
        createdAt: Date.now(),
      };
      addDeck(newDeck);
      if (!activeDeckId) setActiveDeckId(newDeck.id);
      showAlert(t.deckCreated);
    } else if (editor.deckId) {
      updateDeck(editor.deckId, { name, words });
      showAlert(t.deckUpdated);
    }
    setEditor(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const parsedDeck = await uploadAndParseApkg(file);
      addDeck(parsedDeck);
      if (!activeDeckId) setActiveDeckId(parsedDeck.id);
      showAlert(t.deckImportSuccess);
    } catch (err) {
      console.error('Failed to upload apkg', err);
      showAlert(t.deckImportFailed);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const refreshDictionaryStatus = async () => {
    const count = await getDictionaryWordCount();
    setDictStatus({ isLoaded: count > 0, count });
  };

  const importDictionaryFile = async (file: File) => {
    setDictProgress({ status: 'starting' });
    const { importDictionaryFromBlob } = await import('../services/dictionaryDb');
    await importDictionaryFromBlob(file, setDictProgress);
    await refreshDictionaryStatus();
  };

  const downloadDictionaryFile = async (): Promise<File> => {
    setDictProgress({ status: 'fetching', loaded: 0 });
    const response = await fetch(ECDICT_DOWNLOAD_URL);
    if (!response.ok) throw new Error(`Dictionary download failed with HTTP ${response.status}`);

    const totalHeader = response.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : undefined;
    const reader = response.body?.getReader();
    if (!reader) {
      const blob = await response.blob();
      setDictProgress({ status: 'downloaded', loaded: blob.size, total: blob.size });
      return new File([blob], 'ecdict.csv', { type: 'text/csv' });
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    setDictProgress({ status: 'downloading', loaded, total });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      setDictProgress({ status: 'downloading', loaded, total });
    }

    const blob = new Blob(chunks, { type: 'text/csv' });
    setDictProgress({ status: 'downloaded', loaded: blob.size, total: total || blob.size });
    return new File([blob], 'ecdict.csv', { type: 'text/csv' });
  };

  const handleDownloadDictionary = async () => {
    try {
      const file = await downloadDictionaryFile();
      await importDictionaryFile(file);
      showAlert(t.dictionaryDownloadSuccess);
    } catch (err) {
      console.error('Failed to download dictionary', err);
      const message = err instanceof Error ? err.message : String(err);
      showAlert(`${t.dictionaryDownloadFailed}: ${message}`);
    } finally {
      setDictProgress(null);
    }
  };

  const handleUploadDictionary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importDictionaryFile(file);
      showAlert(t.dictionaryImportSuccess);
    } catch (err) {
      console.error('Failed to import dictionary', err);
      const message = err instanceof Error ? err.message : String(err);
      showAlert(`${t.dictionaryImportFailed}: ${message}`);
    } finally {
      setDictProgress(null);
      e.target.value = '';
    }
  };

  const createDeckFromTag = async (tag: string, name: string, shouldShuffle: boolean) => {
    setIsCreatingFromTag(true);
    try {
      const words = await getWordsByTag(tag);
      if (words.length === 0) {
        showAlert(t.noWordsForTag);
        return;
      }
      const deckWords = shouldShuffle ? shuffleWords(words) : words;
      const newDeck: Deck = {
        id: `deck-${Date.now()}`,
        name: `${name} (${tag})${shouldShuffle ? t.shuffledDeckNameSuffix : ''}`,
        words: deckWords,
        createdAt: Date.now(),
      };
      addDeck(newDeck);
      if (!activeDeckId) setActiveDeckId(newDeck.id);
      showAlert(`${t.deckCreatedWith} ${words.length} ${t.words}!`);
    } catch (err) {
      console.error(err);
      showAlert(t.deckCreateFailed);
    } finally {
      setIsCreatingFromTag(false);
    }
  };

  const handleCreateDeckFromTag = (tag: string, name: string) => {
    showAlert({
      title: t.tagDeckShuffleTitle,
      message: t.tagDeckShuffleMessage,
      isConfirm: true,
      confirmText: t.tagDeckShuffleConfirm,
      cancelText: t.tagDeckShuffleCancel,
      onConfirm: () => {
        void createDeckFromTag(tag, name, true);
      },
      onCancel: () => {
        void createDeckFromTag(tag, name, false);
      },
    });
  };

  const getDictionaryProgressLabel = () => {
    if (!dictProgress) return '';
    const downloadedMb = dictProgress.loaded ? (dictProgress.loaded / 1024 / 1024).toFixed(1) : '0.0';
    const totalMb = dictProgress.total ? (dictProgress.total / 1024 / 1024).toFixed(1) : null;
    if (dictProgress.status === 'fetching') return t.dictProgressFetching;
    if (dictProgress.status === 'downloading') return totalMb ? `${t.dictProgressDownloading}: ${downloadedMb} / ${totalMb} MB` : `${t.dictProgressDownloading}: ${downloadedMb} MB`;
    if (dictProgress.status === 'downloaded') return t.dictProgressDownloaded;
    if (dictProgress.status === 'reading') return t.dictProgressReading;
    if (dictProgress.status === 'parsing') return `${t.dictProgressParsing}: ${dictProgress.rowsProcessed?.toLocaleString() || 0} ${t.words}...`;
    if (dictProgress.status === 'complete') return t.dictProgressComplete;
    if (dictProgress.status === 'error') return t.dictProgressError;
    return t.dictProgressWaiting;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-5xl pb-12">
      <header className="mb-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wide text-slate-400 transition-colors hover:text-blue-500 dark:text-slate-500">
          <ChevronLeft size={18} /> {t.homePage}
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{t.wordbookManagement}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.wordbookManagementDesc}</p>
          </div>
          <button onClick={openCreateEditor} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-500/25 transition-colors hover:bg-blue-700">
            <Plus size={18} /> {t.createEmptyWordbook}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {decks.length === 0 ? (
            <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <BookA size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-700" />
              <p className="font-medium text-slate-500 dark:text-slate-400">{t.emptyDecksPrompt}</p>
            </div>
          ) : decks.map(deck => (
            <div key={deck.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-bold text-slate-800 dark:text-slate-100">{deck.name}</h2>
                    {activeDeckId === deck.id && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">{t.activeDeck}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{deck.words.length} {t.wordsCount}</p>
                  <p className="mt-2 line-clamp-1 text-xs text-slate-400 dark:text-slate-500">{deck.words.slice(0, 16).join(' · ') || t.deckEmpty}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeDeckId !== deck.id && <button onClick={() => setActiveDeckId(deck.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">{t.select}</button>}
                  <button onClick={() => openEditEditor(deck)} className="rounded-xl bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"><Edit3 size={18} /></button>
                  <button onClick={() => deleteDeck(deck.id)} className="rounded-xl bg-red-50 p-2 text-red-500 transition-colors hover:bg-red-100 dark:bg-red-900/30"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100"><Upload size={18} className="text-purple-500" /> {t.importWordbook}</h2>
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm font-bold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-blue-950/30">
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              {isUploading ? t.uploading : t.uploadApkg}
            </button>
            <input ref={fileInputRef} type="file" accept=".apkg" className="hidden" onChange={handleFileUpload} />
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100"><Database size={18} className="text-indigo-500" /> {t.offlineDictionary}</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{dictStatus.isLoaded ? `${dictStatus.count.toLocaleString()} ${t.wordsLoaded}` : t.notLoaded}</p>
            {!dictProgress ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={handleDownloadDictionary} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Download size={16} /> {t.downloadOnline}</button>
                <label className="cursor-pointer rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {t.uploadCsv}
                  <input type="file" accept=".csv" className="hidden" onChange={handleUploadDictionary} />
                </label>
              </div>
            ) : <div className="flex items-center gap-2 text-sm font-semibold text-indigo-500"><Loader2 size={16} className="animate-spin" /> {getDictionaryProgressLabel()}</div>}

            {dictStatus.isLoaded && (
              <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-300">{t.createDeckFromTag}</h3>
                <div className="flex flex-wrap gap-2">
                  {ECDICT_TAGS.map(tagObj => (
                    <button key={tagObj.id} disabled={isCreatingFromTag} onClick={() => handleCreateDeckFromTag(tagObj.id, tagObj.name)} className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">{tagObj.name}</button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input value={customDeckTag} onChange={(e) => setCustomDeckTag(e.target.value)} placeholder={t.customTagPlaceholder} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                  <button disabled={isCreatingFromTag || !customDeckTag.trim()} onClick={() => handleCreateDeckFromTag(customDeckTag.trim(), customDeckTag.trim())} className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-300">{t.create}</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {editor && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-slate-900/20 backdrop-blur-sm dark:bg-black/40" onClick={() => setEditor(null)} />
            <motion.div initial={{ y: '100%', opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: '100%', opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 25, stiffness: 220 }} className="fixed bottom-0 left-0 right-0 z-[80] flex h-[85vh] flex-col rounded-t-3xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:bottom-auto md:left-1/2 md:top-1/2 md:h-[75vh] md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
              <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{editor.mode === 'create' ? t.newWordbook : t.editWordbook}</h2>
                <button onClick={() => setEditor(null)} className="rounded-full bg-slate-100 p-2 text-slate-400 hover:text-slate-700 dark:bg-slate-800 dark:hover:text-slate-200"><X size={18} /></button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">{t.wordbookName}</span>
                  <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder={t.wordbookNamePlaceholder} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">{t.wordList}</span>
                  <textarea value={editor.wordsText} onChange={(e) => setEditor({ ...editor, wordsText: e.target.value })} className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder={t.wordListPlaceholder} />
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.wordListSaveHintBefore} {parseDeckWords(editor.wordsText).length} {t.wordListSaveHintAfter}</p>
              </div>
              <div className="border-t border-slate-100 p-5 dark:border-slate-800">
                <button onClick={handleSaveDeck} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700"><Save size={18} /> {t.saveWordbook}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
