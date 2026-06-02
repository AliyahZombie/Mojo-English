import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { WordCard, WordDetail } from '../components/WordCard';
import { searchDictionary } from '../services/dictionaryApi';

export function Dictionary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [searchWord, setSearchWord] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WordDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, []);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setError('');
    
    try {
      const res = await searchDictionary(searchTerm);
      if (res) {
        setResult(res);
        setSearchWord(res.word);
      } else {
        setResult(null);
        setError(`No results found for "${searchTerm}"`);
      }
    } catch (err) {
      setResult(null);
      setError('An error occurred while searching.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
      await performSearch(query);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col pt-4 pb-8 md:py-8 items-center h-full">
      <header className="w-full mb-6 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 text-slate-800 dark:text-slate-200 transition-colors text-center">Dictionary</h1>
        
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto w-full group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={20} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-2xl py-3 pl-12 pr-12 text-lg text-slate-800 dark:text-slate-200 outline-none transition-all shadow-sm"
            placeholder="Search for a word..."
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
          <div className="w-full max-w-4xl pb-10">
            <WordCard word={result} isShowAnswer={true} />
          </div>
        ) : !isLoading && searchWord === '' ? (
          <div className="flex flex-col items-center justify-center h-64 opacity-50 select-none">
            <Search size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-slate-500 dark:text-slate-400">Enter a word to see its translation and frequency.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
