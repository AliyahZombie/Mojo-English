import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { WordDetail } from '../components/WordCard';
import { useAppStore } from '../store/useAppStore';
import { getFsrsCardKey, useFsrsStore } from '../store/useFsrsStore';
import { searchDictionary } from '../services/dictionaryApi';
import { Loader2, BookA, Trophy, RefreshCw, X, CalendarClock, Trash2, ChevronLeft, Star, Volume2, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';
import { Rating, State } from 'ts-fsrs';
import { translations } from '../lib/i18n';
import { getDecksForWord } from '../lib/decks';
import { DeckMembershipChips } from '../components/DeckMembershipChips';
import { DeckPickerModal } from '../components/DeckPickerModal';

export function Words() {
  const { decks, activeDeckId, dailyGoal, language, isAssistantOpen, toggleAssistant, addWordToDeck, showAlert } = useAppStore();
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
  const [isDeckPickerOpen, setIsDeckPickerOpen] = useState(false);
  const [audioError, setAudioError] = useState('');

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

  const handleAddToDeck = (deckId: string) => {
    if (!currentWord) return;
    addWordToDeck(deckId, currentWord);
    showAlert(t.addedToDeck);
    setIsDeckPickerOpen(false);
  };

  const handlePlayAudio = (type: 1 | 2 = 1) => {
    if (!currentWordDetail) return;
    setAudioError('');
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(currentWordDetail.word)}&type=${type}`);
    audio.play().catch(err => {
      setAudioError(err.name === 'NotSupportedError' ? t.audioNotAvailable : t.audioPlayFailed);
    });
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

  const membershipDecks = currentWord ? getDecksForWord(decks, currentWord) : [];

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
        <Link to="/decks" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors">
          {t.goToWordbookManagement}
        </Link>
      </div>
    );
  }

  if (isSessionComplete) {
    return (
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center p-8">
        <Trophy size={64} className="text-yellow-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">{t.learningComplete}</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center">
          {t.learnedWordsToday} {dailyStudied} {t.words}.
          <br/>
          {t.goalProgress}: {dailyStudied} / {dailyGoal + extraGoal}
        </p>
        <Link to="/stories?generate=today" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors items-center gap-2 m-2 inline-flex">
          {t.viewTodayStory}
        </Link>
        <button
          onClick={handleContinueSession}
          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors m-2"
        >
          <RefreshCw size={16} /> {t.continueLearning}
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
    <div className="flex h-full min-h-0 w-full gap-6 relative transition-all duration-300">
      <div className={cn(
        "flex-1 flex min-h-0 flex-col transition-all duration-300 mx-auto overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-sm max-[380px]:rounded-[24px]",
        isAssistantOpen ? "max-w-2xl" : "max-w-4xl"
      )}>
        <header className="flex shrink-0 items-center justify-between px-5 py-4 max-[380px]:px-3 max-[380px]:py-2">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/15 hover:text-white max-[380px]:h-8 max-[380px]:w-8">
            <ChevronLeft size={22} />
          </Link>
          <div className="min-w-0 px-4 text-center max-[380px]:px-2">
             <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/35 max-[380px]:text-[9px] max-[380px]:tracking-[0.16em]">{t.dailyLearning}</p>
            <p className="truncate text-sm font-semibold text-white/70 max-[380px]:text-xs">{activeDeck.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAssistant}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors max-[380px]:h-8 max-[380px]:w-8",
                isAssistantOpen
                  ? "bg-blue-400/20 text-blue-200 ring-1 ring-blue-300/30"
                  : "bg-white/10 text-white/75 hover:bg-white/15 hover:text-white"
              )}
              title={t.aiAssistantTitle}
            >
              <MessageCircle size={20} />
            </button>
            <button onClick={() => setIsDeckPickerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-yellow-300 transition-colors hover:bg-white/15 max-[380px]:h-8 max-[380px]:w-8" title={t.addToDeck}>
              <Star size={20} />
            </button>
            <button onClick={() => setIsShowList(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/15 hover:text-white max-[380px]:h-8 max-[380px]:w-8" title={t.studyQueue}>
              <CalendarClock size={20} />
            </button>
          </div>
        </header>

        <div className="shrink-0 px-5 pb-3 max-[380px]:px-3 max-[380px]:pb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(100, (dailyStudied / Math.max(1, dailyGoal + extraGoal)) * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-medium text-white/40 max-[380px]:mt-1 max-[380px]:text-[10px]">
            <span>{t.goal}: {dailyStudied} / {dailyGoal + extraGoal}</span>
            <span>{wordsList.length} {t.words}</span>
          </div>
        </div>
        
        <main className="flex min-h-0 flex-1 flex-col px-5 pb-5 max-[380px]:px-3 max-[380px]:pb-3">
          {isLoading || !currentWordDetail ? (
            <div className="flex flex-1 flex-col items-center justify-center text-white/45">
              <Loader2 size={32} className="mb-4 animate-spin" />
              <p>{t.loadingWord}</p>
            </div>
          ) : (
            <>
              <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain text-center">
                <motion.div key={currentWordDetail.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
                  <h1 className="break-all text-5xl font-black tracking-tight text-white md:text-7xl max-[380px]:text-3xl">{currentWordDetail.word}</h1>
                  {currentWordDetail.phonetic && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3 max-[380px]:mt-2 max-[380px]:gap-2">
                      <span className="text-lg font-medium text-white/45 max-[380px]:text-sm">/{currentWordDetail.phonetic}/</span>
                      <button onClick={() => handlePlayAudio(1)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 transition-colors hover:bg-white/15 hover:text-white max-[380px]:px-2 max-[380px]:py-1 max-[380px]:text-[10px]"><Volume2 size={14} className="mr-1 inline" />{t.uk}</button>
                      <button onClick={() => handlePlayAudio(2)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 transition-colors hover:bg-white/15 hover:text-white max-[380px]:px-2 max-[380px]:py-1 max-[380px]:text-[10px]"><Volume2 size={14} className="mr-1 inline" />{t.us}</button>
                    </div>
                  )}
                  {audioError && <p className="mt-2 text-xs font-medium text-rose-300">{audioError}</p>}
                  <DeckMembershipChips decks={membershipDecks} emptyLabel={t.notInAnyDeck} className="mt-4 justify-center max-[380px]:mt-2" />

                  <AnimatePresence mode="wait">
                    {isShowAnswer ? (
                      <motion.div key="answer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8 space-y-4 text-left max-[380px]:mt-4 max-[380px]:space-y-2">
                        {currentWordDetail.translation && (
                          <div className="rounded-3xl bg-white/[0.07] p-5 ring-1 ring-white/10 max-[380px]:rounded-2xl max-[380px]:p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300 max-[380px]:mb-1 max-[380px]:text-[9px]">{t.translation}</p>
                            <p className="whitespace-pre-line text-xl font-semibold leading-relaxed text-white max-[380px]:text-sm max-[380px]:leading-snug">{currentWordDetail.translation}</p>
                          </div>
                        )}
                        {currentWordDetail.definition && (
                          <div className="rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10 max-[380px]:rounded-2xl max-[380px]:p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 max-[380px]:mb-1 max-[380px]:text-[9px]">{t.definition}</p>
                            <p className="whitespace-pre-line font-serif text-base italic leading-relaxed text-white/75 max-[380px]:text-xs max-[380px]:leading-snug">{currentWordDetail.definition}</p>
                          </div>
                        )}
                        {currentWordDetail.detail && currentWordDetail.detail.length > 0 && (
                          <div className="space-y-3">
                            {currentWordDetail.detail.slice(0, 2).map((example, index) => (
                              <div key={`${example.en}-${index}`} className="border-l-2 border-blue-400/70 pl-4 text-white/75">
                                <p className="font-medium">{example.en}</p>
                                <p className="mt-1 text-sm text-white/45">{example.cn}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-14 rounded-full border border-dashed border-white/10 px-6 py-3 text-sm font-medium text-white/35 max-[380px]:mt-4 max-[380px]:px-4 max-[380px]:py-2 max-[380px]:text-xs">
                        {t.tapBottomToReveal}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </section>

              <footer className="shrink-0 pt-4 max-[380px]:pt-2">
                {!isShowAnswer ? (
                  <button onClick={() => setIsShowAnswer(true)} className="w-full rounded-[28px] bg-blue-500 py-4 text-lg font-black text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98] max-[380px]:rounded-2xl max-[380px]:py-3 max-[380px]:text-base">
                    {t.showAnswer}
                  </button>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-5 gap-2 max-[380px]:gap-1.5">
                    <button onClick={() => handleFSRS('again')} className="rounded-2xl bg-rose-500/15 px-2 py-3 text-center ring-1 ring-rose-400/20 transition-colors hover:bg-rose-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-rose-300 max-[380px]:text-[11px]">{t.again}</span><span className="text-[10px] text-white/35 max-[380px]:text-[9px]">&lt; {intervals.again}</span></button>
                    <button onClick={() => handleFSRS('hard')} className="rounded-2xl bg-orange-500/15 px-2 py-3 text-center ring-1 ring-orange-400/20 transition-colors hover:bg-orange-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-orange-300 max-[380px]:text-[11px]">{t.hard}</span><span className="text-[10px] text-white/35 max-[380px]:text-[9px]">{intervals.hard}</span></button>
                    <button onClick={() => handleFSRS('good')} className="rounded-2xl bg-emerald-500/15 px-2 py-3 text-center ring-1 ring-emerald-400/20 transition-colors hover:bg-emerald-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-emerald-300 max-[380px]:text-[11px]">{t.good}</span><span className="text-[10px] text-white/35 max-[380px]:text-[9px]">{intervals.good}</span></button>
                    <button onClick={() => handleFSRS('easy')} className="rounded-2xl bg-blue-500/15 px-2 py-3 text-center ring-1 ring-blue-400/20 transition-colors hover:bg-blue-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-blue-300 max-[380px]:text-[11px]">{t.easy}</span><span className="text-[10px] text-white/35 max-[380px]:text-[9px]">{intervals.easy}</span></button>
                    <button onClick={handleMarkMastered} className="rounded-2xl bg-white/10 px-2 py-3 text-center ring-1 ring-white/10 transition-colors hover:bg-white/15 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2" title={t.markKnownTitle}><Trash2 size={16} className="mx-auto mb-1 text-white/55 max-[380px]:h-3.5 max-[380px]:w-3.5" /><span className="block text-xs font-black text-white/55 max-[380px]:text-[10px]">{t.known}</span></button>
                  </motion.div>
                )}
              </footer>
            </>
          )}
        </main>
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
      <DeckPickerModal
        isOpen={isDeckPickerOpen}
        word={currentWord || ''}
        decks={decks}
        onClose={() => setIsDeckPickerOpen(false)}
        onSelect={handleAddToDeck}
      />
    </div>
  );
}
