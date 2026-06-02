import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WordCard, WordDetail } from '../components/WordCard';
import { useAppStore } from '../store/useAppStore';
import { searchDictionary } from '../services/dictionaryApi';
import { Loader2, BookA } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Words() {
  const { decks, activeDeckId } = useAppStore();
  const activeDeck = decks.find(d => d.id === activeDeckId);
  const wordsList = activeDeck?.words || [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShowAnswer, setIsShowAnswer] = useState(false);
  const [currentWordDetail, setCurrentWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchWord() {
      if (wordsList.length > 0 && currentIndex < wordsList.length) {
        setIsLoading(true);
        setIsShowAnswer(false);
        const detail = await searchDictionary(wordsList[currentIndex]);
        setCurrentWordDetail(detail);
        setIsLoading(false);
      }
    }
    fetchWord();
  }, [currentIndex, wordsList]);

  const handleFSRS = (grade: string) => {
    console.log(`Graded: ${grade}`);
    setIsShowAnswer(false);
    if (currentIndex < wordsList.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  if (!activeDeck) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <BookA size={64} className="text-slate-300 dark:text-slate-700 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">No Active Deck</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center max-w-md">
          Please upload and select a vocabulary deck in the Setup page to start reviewing.
        </p>
        <Link to="/setup" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors">
          Go to Setup
        </Link>
      </div>
    );
  }

  if (wordsList.length === 0) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">Deck Empty</h2>
        <p className="text-slate-500 dark:text-slate-400">The selected deck has no words.</p>
      </div>
    );
  }

  if (currentIndex >= wordsList.length) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">Review Complete!</h2>
        <p className="text-slate-500 dark:text-slate-400">You have reviewed all words in the current deck.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col pt-4 pb-8 md:py-8 items-center">
      <header className="w-full mb-6 text-center shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-slate-800 dark:text-slate-200 transition-colors">Daily Review</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">{currentIndex + 1} of {wordsList.length} in <span className="font-bold">{activeDeck.name}</span></p>
      </header>
      
      <div className="relative w-full flex-1 md:flex-none flex items-center justify-center">
        {isLoading || !currentWordDetail ? (
          <div className="flex flex-col items-center text-slate-400">
            <Loader2 size={32} className="animate-spin mb-4" />
            <p>Loading word...</p>
          </div>
        ) : (
          <WordCard word={currentWordDetail} isShowAnswer={isShowAnswer} />
        )}
      </div>

      {!isShowAnswer && !isLoading && currentWordDetail ? (
        <div className="flex w-full justify-center mt-6 md:mt-10 shrink-0 px-4 md:px-0">
          <button 
            onClick={() => setIsShowAnswer(true)} 
            className="w-full max-w-sm py-4 rounded-xl md:rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-95"
          >
            Show Answer
          </button>
        </div>
      ) : isShowAnswer && !isLoading && currentWordDetail ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full justify-center gap-2 md:gap-4 mt-6 md:mt-10 shrink-0 px-2 md:px-0 max-w-2xl mx-auto"
        >
          <button onClick={() => handleFSRS('again')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-900/20 group transition-all active:scale-95 border-b-4 border-rose-200 dark:border-rose-900/50 hover:border-rose-500 dark:hover:border-rose-500 shadow-sm">
            <span className="font-bold text-sm md:text-lg text-rose-500 dark:text-rose-400">Again</span>
            <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-rose-400 transition-colors">&lt; 1m</span>
          </button>
          <button onClick={() => handleFSRS('hard')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-orange-50 dark:hover:bg-orange-900/20 group transition-all active:scale-95 border-b-4 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 dark:hover:border-orange-500 shadow-sm">
            <span className="font-bold text-sm md:text-lg text-orange-500 dark:text-orange-400">Hard</span>
            <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-orange-400 transition-colors">5m</span>
          </button>
          <button onClick={() => handleFSRS('good')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group transition-all active:scale-95 border-b-4 border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-sm">
            <span className="font-bold text-sm md:text-lg text-emerald-500 dark:text-emerald-400">Good</span>
            <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-emerald-400 transition-colors">10m</span>
          </button>
          <button onClick={() => handleFSRS('easy')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 group transition-all active:scale-95 border-b-4 border-blue-200 dark:border-blue-900/50 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm">
            <span className="font-bold text-sm md:text-lg text-blue-500 dark:text-blue-400">Easy</span>
            <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-blue-400 transition-colors">4d</span>
          </button>
        </motion.div>
      ) : null}
    </div>
  );
}

