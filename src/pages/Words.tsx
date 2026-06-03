import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WordCard, WordDetail } from '../components/WordCard';
import { useAppStore } from '../store/useAppStore';
import { getFsrsCardKey, useFsrsStore } from '../store/useFsrsStore';
import { searchDictionary } from '../services/dictionaryApi';
import { Loader2, BookA, Trophy, RefreshCw, X, CalendarClock, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';
import { Rating, State } from 'ts-fsrs';
import { translations } from '../lib/i18n';

export function Words() {
  const { decks, activeDeckId, dailyGoal, language, isAssistantOpen, toggleAssistant } = useAppStore();
  const t = translations[language];
  const activeDeck = decks.find(d => d.id === activeDeckId);
  const wordsList = activeDeck?.words || [];

  const { processReview, markWordMastered, activeQueueDeckId, initQueue, getNextCard, getNextDueTime, getDailyStudiedCount } = useFsrsStore();
  const dailyStudied = getDailyStudiedCount();
  const sessionLimit = Math.max(1, dailyGoal);

  const [extraGoal, setExtraGoal] = useState(0);

  // Derive state from fsrs store
  const isSessionComplete = dailyStudied >= (sessionLimit + extraGoal);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000); // 30s poll
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (wordsList.length > 0 && activeDeckId) {
      if (activeQueueDeckId !== activeDeckId) {
        initQueue(activeDeckId, wordsList);
      }
    }
  }, [activeDeckId, wordsList.length, initQueue, activeQueueDeckId]);

  const currentWord = activeDeckId && !isSessionComplete && activeQueueDeckId === activeDeckId ? getNextCard(activeDeckId, wordsList) : null;
  const isQueueEmpty = !currentWord;

  useEffect(() => {
    if (isQueueEmpty || isSessionComplete) {
      if (!activeDeckId) return;
      const nextDueTime = getNextDueTime(activeDeckId, wordsList);
      
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
  }, [activeDeckId, getNextDueTime, isQueueEmpty, isSessionComplete, wordsList]);

  const [isShowAnswer, setIsShowAnswer] = useState(false);
  const [currentWordDetail, setCurrentWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
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

    if (currentWord && activeDeckId) {
      processReview(activeDeckId, currentWord, rating);
    }

    setIsShowAnswer(false);
  };

  const handleMarkMastered = () => {
    if (currentWord && activeDeckId) {
      markWordMastered(activeDeckId, currentWord);
    }

    setIsShowAnswer(false);
  };

  const handleContinueSession = () => {
    setExtraGoal(e => Math.max(e + (dailyGoal || 20), dailyStudied - sessionLimit + (dailyGoal || 20)));
    if (activeDeckId && !getNextCard(activeDeckId, wordsList)) {
       useAppStore.getState().showAlert(t.noMoreWordsDue);
    }
  };

  const intervals = useMemo(() => {
    if (!currentWord || !activeDeckId) return { again: '< 1m', hard: '5m', good: '10m', easy: '4d' };
    return useFsrsStore.getState().getNextIntervals(activeDeckId, currentWord);
  }, [activeDeckId, currentWord]);

  // Only calculate active words for the study queue when list is shown
  const cards = useFsrsStore(state => state.cards);
  const activeWords = useMemo(() => {
     if (!isShowList || !activeDeckId) return [];
     const list = wordsList.filter(w => {
        const card = cards[getFsrsCardKey(activeDeckId, w)] || cards[w];
        return card && card.state !== State.New;
      });
      list.sort((a, b) => {
        const cardA = cards[getFsrsCardKey(activeDeckId, a)] || cards[a];
        const cardB = cards[getFsrsCardKey(activeDeckId, b)] || cards[b];
        const dueA = cardA.due ? new Date(cardA.due).getTime() : 0;
        const dueB = cardB.due ? new Date(cardB.due).getTime() : 0;
        return dueA - dueB;
     });
     return list;
  }, [activeDeckId, isShowList, wordsList, cards]);

  function getDueTimeStr(card?: { due?: Date }) {
     if (!card || !card.due) return "";
     const now = new Date().getTime();
     const due = new Date(card.due).getTime();
     const diffMs = due - now;
      if (diffMs <= 0) return t.dueNow;
      
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${t.dueIn} ${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${t.dueIn} ${diffHours}h ${diffMins % 60}m`;
      return `${t.dueIn} ${Math.floor(diffHours / 24)}d`;
   }

  if (!activeDeck) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <BookA size={64} className="text-slate-300 dark:text-slate-700 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">{t.noActiveDeck}</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center max-w-md">
          {t.noActiveDeckDesc}
        </p>
        <Link to="/setup" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors">
          {t.goToSetup}
        </Link>
      </div>
    );
  }

  if (isSessionComplete) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <Trophy size={64} className="text-yellow-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">{t.reviewComplete}</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center">
          {t.reviewedWordsToday} {dailyStudied} {t.words}.
          <br/>
          {t.goalProgress}: {dailyStudied} / {dailyGoal + extraGoal}
        </p>
        <button 
          onClick={handleContinueSession}
          className="flex lg:hidden bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors items-center gap-2 m-2"
        >
          <RefreshCw size={20} /> {t.continueReviewing}
        </button>
        <button 
          onClick={handleContinueSession}
          className="hidden lg:flex bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors items-center gap-2 m-2"
        >
          <RefreshCw size={20} /> {t.continueReviewing}
        </button>
      </div>
    );
  }

  if (isQueueEmpty) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <BookA size={64} className="text-blue-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">{t.allCaughtUp}</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center">
          {t.noWordsDue}
          <br/>
          {t.reviewedTodayGreat} {dailyStudied} {t.words}. {t.greatJob}
          <br/>
          {t.comeBackLater}
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
            <button onClick={() => setIsShowList(true)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors" title={t.studyQueue}>
              <CalendarClock size={22} />
            </button>
          </div>
          <div className="text-center px-12 sm:px-16 w-full max-w-full mx-auto flex flex-col items-center relative">
            <div className="flex items-center gap-2">
               <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-slate-800 dark:text-slate-200 transition-colors">{t.dailyReview}</h1>
              <button onClick={() => setIsShowList(true)} className="md:hidden p-1.5 text-slate-400 hover:text-blue-500 rounded-lg" title={t.studyQueue}>
                <CalendarClock size={18} />
              </button>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-sm transition-colors flex flex-col sm:flex-row items-center justify-center max-w-full gap-2">
              <span className="shrink-0 font-medium bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-600 dark:text-slate-300">
                {t.goal}: {dailyStudied} / {dailyGoal + extraGoal}
              </span>
              <div className="flex items-center">
                 <span className="shrink-0">{t.studying}&nbsp;</span>
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
              <p>{t.loadingWord}</p>
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
              {t.showAnswer}
            </button>
          </div>
        ) : isShowAnswer && !isLoading && currentWordDetail ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid w-full grid-cols-5 gap-2 md:gap-4 mt-6 md:mt-10 shrink-0 px-2 md:px-0 max-w-3xl mx-auto"
          >
            <button onClick={() => handleFSRS('again')} className="flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-900/20 group transition-all active:scale-95 border-b-4 border-rose-200 dark:border-rose-900/50 hover:border-rose-500 dark:hover:border-rose-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-rose-500 dark:text-rose-400">{t.again}</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-rose-400 transition-colors">&lt; {intervals.again}</span>
            </button>
            <button onClick={() => handleFSRS('hard')} className="flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-orange-50 dark:hover:bg-orange-900/20 group transition-all active:scale-95 border-b-4 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 dark:hover:border-orange-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-orange-500 dark:text-orange-400">{t.hard}</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-orange-400 transition-colors">{intervals.hard}</span>
            </button>
            <button onClick={() => handleFSRS('good')} className="flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group transition-all active:scale-95 border-b-4 border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-emerald-500 dark:text-emerald-400">{t.good}</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-emerald-400 transition-colors">{intervals.good}</span>
            </button>
            <button onClick={() => handleFSRS('easy')} className="flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 group transition-all active:scale-95 border-b-4 border-blue-200 dark:border-blue-900/50 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm">
              <span className="font-bold text-sm md:text-lg text-blue-500 dark:text-blue-400">{t.easy}</span>
              <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-blue-400 transition-colors">{intervals.easy}</span>
            </button>
            <button onClick={handleMarkMastered} className="flex flex-col items-center justify-center py-2 md:py-3 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 group transition-all active:scale-95 border-b-4 border-slate-200 dark:border-slate-700 hover:border-slate-500 dark:hover:border-slate-400 shadow-sm" title={t.markKnownTitle}>
              <Trash2 size={18} className="mb-0.5 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              <span className="font-bold text-xs md:text-base text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">{t.known}</span>
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
              title={t.wordAssistant}
              description={`${t.discussWord} "${currentWordDetail.word}"`}
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
                title={t.wordAssistant}
                description={`${t.discussWord} "${currentWordDetail.word}"`}
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
                  <CalendarClock className="text-blue-500" /> {t.studyQueue}
                </h2>
                <button onClick={() => setIsShowList(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
                {activeWords.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 dark:text-slate-400 font-medium">
                    {t.noActiveWords}
                  </div>
                ) : (
                  activeWords.map(w => {
                    const card = cards[getFsrsCardKey(activeDeckId, w)] || cards[w];
                    let statusStr = t.queueStatusNew;
                    let statusClass = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
                    let dueStr = getDueTimeStr(card);
                    
                    if (card) {
                      if (card.state === State.Learning || card.state === State.Relearning) {
                         statusStr = t.queueStatusLearning;
                        statusClass = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
                      } else if (card.state === State.Review) {
                         statusStr = t.queueStatusReview;
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
