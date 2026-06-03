import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Search, Loader2, Sparkles, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { WordCard, WordDetail } from '../components/WordCard';
import { searchDictionary } from '../services/dictionaryApi';
import { ChatAssistant } from '../components/ChatAssistant';
import { useAppStore } from '../store/useAppStore';
import { translations } from '../lib/i18n';
import { getDecksForWord } from '../lib/decks';
import { DeckPickerModal } from '../components/DeckPickerModal';

export function Dictionary() {
  const { isAssistantOpen, toggleAssistant, language, decks, addWordToDeck, showAlert } = useAppStore();
  const t = translations[language];
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const navigationState = location.state as { from?: string; returnLabel?: string } | null;
  const returnTo = navigationState?.from || searchParams.get('from');
  
  const [query, setQuery] = useState(initialQuery);
  const [searchWord, setSearchWord] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WordDetail | null>(null);
  const [error, setError] = useState('');
  const [isDeckPickerOpen, setIsDeckPickerOpen] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, []);

  const performSearch = async (searchTerm: string, forceAi: boolean = false, preferLocal: boolean = false) => {
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setError('');
    
    try {
      const res = await searchDictionary(searchTerm, { forceAi, preferLocal });
      if (res) {
        setResult(res);
        setSearchWord(res.word);
      } else {
        setResult(null);
        setError(`${t.noResultsFor} "${searchTerm}"`);
      }
    } catch (err) {
      setResult(null);
      setError(t.searchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToDeck = (deckId: string) => {
    if (!result) return;
    addWordToDeck(deckId, result.word);
    showAlert(t.addedToDeck);
    setIsDeckPickerOpen(false);
  };

  const handlePreferLocal = async () => {
    const term = searchWord || result?.word || query;
    if (!term) return;
    await performSearch(term, false, true);
  };

  const membershipDecks = result ? getDecksForWord(decks, result.word) : [];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      const nextParams: Record<string, string> = { q: query.trim() };
      if (returnTo) {
        nextParams.from = returnTo;
      }
      setSearchParams(nextParams);
      await performSearch(query);
    }
  };

  const handleReturn = () => {
    if (returnTo?.startsWith('/')) {
      navigate(returnTo);
      return;
    }

    navigate(-1);
  };

  return (
    <div className="w-full h-full flex gap-6 relative transition-all duration-300">
      <div className={cn(
        "flex-1 flex flex-col pt-4 pb-8 md:py-8 items-center transition-all duration-300 mx-auto",
        isAssistantOpen ? "max-w-2xl" : "max-w-4xl"
      )}>
        <header className="w-full mb-6 shrink-0">
        {returnTo && (
          <button
            type="button"
            onClick={handleReturn}
            className="mb-4 inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-bold tracking-wide transition-colors uppercase"
          >
            <ChevronLeft size={18} className="-ml-1" />
            {navigationState?.returnLabel || t.backToNews}
          </button>
        )}
        <h1 className="text-2xl md:text-3xl font-bold mb-4 text-slate-800 dark:text-slate-200 transition-colors text-center">{t.dictionary}</h1>
        
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto w-full group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={20} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-2xl py-3 pl-12 pr-12 text-lg text-slate-800 dark:text-slate-200 outline-none transition-all shadow-sm"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
              <Loader2 size={20} className="text-blue-500 animate-spin" />
            </div>
          )}
        </form>
      </header>
      
      <div className="w-full flex-1 overflow-y-auto hide-scrollbar flex flex-col items-center">
        {error ? (
          <div className="flex flex-col items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/50 w-full rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            <p>{error}</p>
          </div>
        ) : result ? (
          <div className="w-full max-w-4xl pb-10 flex flex-col items-center">
            <WordCard word={result} isShowAnswer={true} membershipDecks={membershipDecks} onAddToDeck={() => setIsDeckPickerOpen(true)} />
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {result.id.startsWith('ai-') && (
                <button 
                  onClick={handlePreferLocal}
                  disabled={isLoading}
                  className="px-6 py-2.5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-medium text-sm transition-colors flex items-center gap-2"
                >
                  <BookOpen size={16} />
                  {t.viewLocalDictionaryResult}
                </button>
              )}
              <button 
                onClick={() => performSearch(searchWord, true)}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm transition-colors flex items-center gap-2"
              >
                <Sparkles size={16} className="text-blue-500" />
                {t.regenerate}
              </button>
            </div>
          </div>
        ) : !isLoading && searchWord === '' ? (
          <div className="flex flex-col items-center justify-center h-64 opacity-50 select-none text-center">
            <Search size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              {t.dictionaryEmptyHint}
            </p>
          </div>
        ) : null}
      </div></div>

      {/* Desktop Assistant */}
      <AnimatePresence>
        {isAssistantOpen && result && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
            className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col h-[calc(100%-2.5rem)] my-auto"
          >
            <ChatAssistant 
              contextId={`dict_${result.word}`}
              title={t.dictionaryAssistant}
              description={`${t.discussWord} "${result.word}"`}
              systemContext={`The user is looking at the dictionary entry for "${result.word}". Details: ${JSON.stringify(result)}`}
              onClose={toggleAssistant}
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Chat / Discussion Drawer */}
      <AnimatePresence>
        {isAssistantOpen && result && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 backdrop-blur-sm lg:hidden"
              onClick={toggleAssistant}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 right-0 bottom-0 h-[80vh] z-50 rounded-t-3xl border-t border-slate-100 dark:border-slate-800 flex flex-col lg:hidden bg-white dark:bg-slate-900 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
            >
               <ChatAssistant 
                  contextId={`dict_${result.word}`}
                  title={t.dictionaryAssistant}
                  description={`${t.discussWord} "${result.word}"`}
                  systemContext={`The user is looking at the dictionary entry for "${result.word}". Details: ${JSON.stringify(result)}`}
                  onClose={toggleAssistant}
                  className="rounded-none border-none shadow-none h-full"
                  isEmbedded={true}
                />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <DeckPickerModal
        isOpen={isDeckPickerOpen}
        word={result?.word || ''}
        decks={decks}
        onClose={() => setIsDeckPickerOpen(false)}
        onSelect={handleAddToDeck}
      />
    </div>
  );
}
