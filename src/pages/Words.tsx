import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WordCard, WordDetail } from '../components/WordCard';
import { useAppStore } from '../store/useAppStore';
import { useFsrsStore } from '../store/useFsrsStore';
import { searchDictionary } from '../services/dictionaryApi';
import { Loader2, BookA, Trophy, RefreshCw, List, X, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';
import { Rating, State } from 'ts-fsrs';

export function Words() {
  const { decks, activeDeckId, dailyGoal } = useAppStore();
  const activeDeck = decks.find(d => d.id === activeDeckId);
  const wordsList = activeDeck?.words || [];

  const { processReview, activeQueueDeckId, initQueue, getNextCard, getDailyStudiedCount } = useFsrsStore();
  const dailyStudied = getDailyStudiedCount();
  const sessionLimit = Math.max(1, dailyGoal);

  const [extraGoal, setExtraGoal] = useState(0);

  // Derive state from fsrs store
  const isSessionComplete = dailyStudied >= (sessionLimit + extraGoal);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000); // 30s poll
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (wordsList.length > 0 && activeDeckId) {
      if (activeQueueDeckId !== activeDeckId) {
        initQueue(activeDeckId);
      }
    }
  }, [activeDeckId, wordsList.length, initQueue, activeQueueDeckId]);

  const currentWord = !isSessionComplete && activeQueueDeckId === activeDeckId ? getNextCard(activeDeckId, wordsList) : null;
  const isQueueEmpty = !currentWord;

  useEffect(() => {
    if (isQueueEmpty || isSessionComplete) {
      const getNextDueTime = useFsrsStore.getState().getNextDueTime;
      const nextDueTime = getNextDueTime(wordsList);
      
      import('../services/notificationService').then(({ NotificationService }) => {
        if (nextDueTime && nextDueTime > Date.now()) {
          NotificationService.scheduleNextBatchReminder(nextDueTime);
        }
        if (isSessionComplete) {
          // Schedule a generic "Daily review" for tomorrow at roughly the same time, or 24h from now.
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          NotificationService.scheduleDailyReview(tomorrow.getTime());
        }
      });
    }
  }, [isQueueEmpty, isSessionComplete, wordsList]);

  const [isShowAnswer, setIsShowAnswer] = useState(false);
  const [currentWordDetail, setCurrentWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { isAssistantOpen, toggleAssistant } = useAppStore();

  const [isShowList, setIsShowList] = useState(false);

  useEffect(() => {
    async function fetchWord() {
      if (currentWord && !isSessionComplete) {
        setIsLoading(true);
        setIsShowAnswer(false);
        const detail = await searchDictionary(currentWord);
        setCurrentWordDetail(detail);
        setIsLoading(false);
      }
    }
    fetchWord();
  }, [currentWord, isSessionComplete]);

  const handleFSRS = (ratingRaw: string) => {
    let rating = Rating.Good;
    if (ratingRaw === 'again') rating = Rating.Again;
    if (ratingRaw === 'hard') rating = Rating.Hard;
    if (ratingRaw === 'good') rating = Rating.Good;
    if (ratingRaw === 'easy') rating = Rating.Easy;

    if (currentWord) {
      processReview(currentWord, rating);
    }

    setIsShowAnswer(false);
  };

  const handleContinueSession = () => {
    setExtraGoal(e => Math.max(e + (dailyGoal || 20), dailyStudied - sessionLimit + (dailyGoal || 20)));
    if (!getNextCard(activeDeckId!, wordsList)) {
       useAppStore.getState().showAlert("No more words due right now!");
    }
  };

  const intervals = useMemo(() => {
    if (!currentWord) return { again: '< 1m', hard: '5m', good: '10m', easy: '4d' };
    return useFsrsStore.getState().getNextIntervals(currentWord);
  }, [currentWord]);

  // Only calculate active words for the study queue when list is shown
  const cards = useFsrsStore(state => state.cards);
  const activeWords = useMemo(() => {
     if (!isShowList) return [];
     const list = wordsList.filter(w => {
        const card = cards[w];
        return card && card.state !== State.New;
     });
     list.sort((a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        const dueA = cardA.due ? new Date(cardA.due).getTime() : 0;
        const dueB = cardB.due ? new Date(cardB.due).getTime() : 0;
        return dueA - dueB;
     });
     return list;
  }, [isShowList, wordsList, cards]);

  function getDueTimeStr(card?: { due?: Date }) {
     if (!card || !card.due) return "";
     const now = new Date().getTime();
     const due = new Date(card.due).getTime();
     const diffMs = due - now;
     if (diffMs <= 0) return "Due now";
     
     const diffMins = Math.floor(diffMs / 60000);
     if (diffMins < 60) return `Due in ${diffMins}m`;
     const diffHours = Math.floor(diffMins / 60);
     if (diffHours < 24) return `Due in ${diffHours}h ${diffMins % 60}m`;
     return `Due in ${Math.floor(diffHours / 24)}d`;
  }

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

  if (isSessionComplete) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <Trophy size={64} className="text-yellow-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">Review Complete!</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center">
          You have reviewed {dailyStudied} words today.
          <br/>
          Goal progress: {dailyStudied} / {dailyGoal + extraGoal}
        </p>
        <button 
          onClick={handleContinueSession}
          className="flex lg:hidden bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors items-center gap-2 m-2"
        >
          <RefreshCw size={20} /> Continue Reviewing
        </button>
        <button 
          onClick={handleContinueSession}
          className="hidden lg:flex bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors items-center gap-2 m-2"
        >
          <RefreshCw size={20} /> Continue Reviewing
        </button>
      </div>
    );
  }

  if (isQueueEmpty) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <BookA size={64} className="text-blue-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">You're All Caught Up!</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center">
          No more words are due for review right now. 
          <br/>
          You've reviewed {dailyStudied} words today. Great job!
          <br/>
          Please come back later when more words are due.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex gap-6 relative transition-all duration-300">
      <div className={cn(
        "flex-1 flex flex-col pt-4 pb-8 md:py-8 items-center transition-all duration-300 mx-auto",
        isAssistantOpen ? "max-w-2xl" : "max-w-4xl"
      )}>
        <header className="w-full mb-6 relative shrink-0">
          <div className="absolute right-0 top-0 hidden md:block">
            <button onClick={() => setIsShowList(true)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors" title="Study Queue">
              <CalendarClock size={22} />
            </button>
          </div>
          <div className="text-center px-12 sm:px-16 w-full max-w-full mx-auto flex flex-col items-center relative">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-slate-800 dark:text-slate-200 transition-colors">Daily Review</h1>
              <button onClick={() => setIsShowList(true)} className="md:hidden p-1.5 text-slate-400 hover:text-blue-500 rounded-lg" title="Study Queue">
                <CalendarClock size={18} />
              </button>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-sm transition-colors flex flex-col sm:flex-row items-center justify-center max-w-full gap-2">
              <span className="shrink-0 font-medium bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-600 dark:text-slate-300">
                Goal: {dailyStudied} / {dailyGoal + extraGoal}
              </span>
              <div className="flex items-center">
                <span className="shrink-0">Studying&nbsp;</span>
                <div className="relative overflow-hidden group mask-edge flex min-w-[50px] max-w-[120px] sm:max-w-[200px]">
                  <span className="font-bold truncate opacity-0 md:opacity-100 md:group-hover:opacity-0 transition-opacity w-full block text-left">
                    {activeDeck.name}
                  </span>
                  <div 
                    className="absolute inset-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex whitespace-nowrap animate-marquee font-bold" 
                    style={{ '--marquee-duration': '8s' } as React.CSSProperties}
                  >
                    <span className="pr-8">{activeDeck.name}</span>
                    <span className="pr-8">{activeDeck.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-rose-400 transition-colors">&lt; {intervals.again}</span>
            </button>
            <button onClick={() => handleFSRS('hard')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-orange-50 dark:hover:bg-orange-900/20 group transition-all active:scale-95 border-b-4 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 dark:hover:border-orange-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-orange-500 dark:text-orange-400">Hard</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-orange-400 transition-colors">{intervals.hard}</span>
            </button>
            <button onClick={() => handleFSRS('good')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group transition-all active:scale-95 border-b-4 border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-emerald-500 dark:text-emerald-400">Good</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-emerald-400 transition-colors">{intervals.good}</span>
            </button>
            <button onClick={() => handleFSRS('easy')} className="flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 group transition-all active:scale-95 border-b-4 border-blue-200 dark:border-blue-900/50 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-blue-500 dark:text-blue-400">Easy</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-blue-400 transition-colors">{intervals.easy}</span>
            </button>
          </motion.div>
        ) : null}
      </div>

      <AnimatePresence>
        {isAssistantOpen && currentWordDetail && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
            className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col h-[calc(100%-2.5rem)] my-auto"
          >
            <ChatAssistant 
              contextId={`word_${currentWordDetail.word}`}
              title="Word Assistant"
              description={`Discuss the word "${currentWordDetail.word}"`}
              systemContext={`The user is currently studying the word "${currentWordDetail.word}". Details: ${JSON.stringify(currentWordDetail)}`}
              onClose={toggleAssistant}
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isAssistantOpen && currentWordDetail && (
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
                contextId={`word_${currentWordDetail.word}`}
                title="Word Assistant"
                description={`Discuss the word "${currentWordDetail.word}"`}
                systemContext={`The user is currently studying the word "${currentWordDetail.word}". Details: ${JSON.stringify(currentWordDetail)}`}
                onClose={toggleAssistant}
                className="rounded-none border-none shadow-none h-full"
                isEmbedded={true}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* List Modal */}
      <AnimatePresence>
        {isShowList && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-[60] backdrop-blur-sm"
              onClick={() => setIsShowList(false)}
            />
            <motion.div
              initial={{ y: '100%', opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '100%', opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 right-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl w-full h-[85vh] md:h-[70vh] z-[70] rounded-t-3xl md:rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 rounded-t-3xl text-slate-800 dark:text-slate-200">
                <h2 className="font-bold text-xl md:text-2xl flex items-center gap-2">
                  <CalendarClock className="text-blue-500" /> Study Queue
                </h2>
                <button onClick={() => setIsShowList(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
                {activeWords.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 dark:text-slate-400 font-medium">
                    No active words in learning or review.
                  </div>
                ) : (
                  activeWords.map(w => {
                    const card = cards[w];
                    let statusStr = "New";
                    let statusClass = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
                    let dueStr = getDueTimeStr(card);
                    
                    if (card) {
                      if (card.state === State.Learning || card.state === State.Relearning) {
                        statusStr = "Learning";
                        statusClass = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
                      } else if (card.state === State.Review) {
                        statusStr = "Review";
                        statusClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
                      }
                    }

                    return (
                      <div key={w} className="p-3 md:p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 transition-colors hover:border-slate-200 dark:hover:border-slate-700">
                        <div className="font-bold text-lg text-slate-800 dark:text-slate-200">{w}</div>
                        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                          {dueStr && (
                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                              <CalendarClock size={14} />
                              {dueStr}
                            </div>
                          )}
                          <span className={cn("px-2 py-0.5 rounded text-[10px] md:text-xs font-bold uppercase tracking-wider", statusClass)}>
                            {statusStr}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

