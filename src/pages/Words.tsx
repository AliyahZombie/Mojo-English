import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { WordDetail } from '../components/WordCard';
import { useAppStore } from '../store/useAppStore';
import { getFsrsCardKey, useFsrsStore } from '../store/useFsrsStore';
import { searchDictionary } from '../services/dictionaryApi';
import { Loader2, BookA, Trophy, RefreshCw, X, CalendarClock, Trash2, ChevronLeft, Star, Volume2, MessageCircle, BellRing, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';
import { Rating, State } from 'ts-fsrs';
import { translations } from '../lib/i18n';
import { getDecksForWord } from '../lib/decks';
import { DeckMembershipChips } from '../components/DeckMembershipChips';
import { DeckPickerModal } from '../components/DeckPickerModal';
import { getOfflineDictionaryEntries, type EcdictWord } from '../services/dictionaryDb';

const EMPTY_WORDS: string[] = [];

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getFrequencyRank(entry?: EcdictWord): number {
  if (!entry) return Number.POSITIVE_INFINITY;
  const ranks = [parsePositiveInt(entry.bnc), parsePositiveInt(entry.frq)].filter(rank => rank > 0);
  return ranks.length > 0 ? Math.min(...ranks) : Number.POSITIVE_INFINITY;
}

function sortWordsByFrequency(words: string[], entries: Record<string, EcdictWord>): string[] {
  return words
    .map((word, index) => ({ word, index, entry: entries[word.trim().toLowerCase()] }))
    .sort((a, b) => {
      const rankA = getFrequencyRank(a.entry);
      const rankB = getFrequencyRank(b.entry);
      if (rankA !== rankB) return rankA - rankB;

      const oxfordA = parsePositiveInt(a.entry?.oxford || '');
      const oxfordB = parsePositiveInt(b.entry?.oxford || '');
      if (oxfordA !== oxfordB) return oxfordB - oxfordA;

      const collinsA = parsePositiveInt(a.entry?.collins || '');
      const collinsB = parsePositiveInt(b.entry?.collins || '');
      if (collinsA !== collinsB) return collinsB - collinsA;

      return a.index - b.index;
    })
    .map(item => item.word);
}

export function Words() {
  const {
    decks,
    activeDeckId,
    dailyGoal,
    language,
    isAssistantOpen,
    toggleAssistant,
    addWordToDeck,
    showAlert,
    upstashQstashToken,
    webhookUrl,
    hasDismissedNotificationSetupReminder,
    setHasDismissedNotificationSetupReminder,
  } = useAppStore();
  const t = translations[language];
  const navigate = useNavigate();
  const activeDeck = decks.find(d => d.id === activeDeckId);
  const wordsList = activeDeck?.words || EMPTY_WORDS;
  const [frequencyOrderedWordsState, setFrequencyOrderedWordsState] = useState<{ deckId: string | null; words: string[] }>({
    deckId: activeDeckId,
    words: wordsList,
  });
  const frequencyOrderedWordsList = frequencyOrderedWordsState.deckId === activeDeckId ? frequencyOrderedWordsState.words : wordsList;

  const { processReview, markWordMastered, activeQueueDeckId, initQueue, getNextCard, getNextDueTime, getDailyStudiedCount } = useFsrsStore();
  const dailyStudied = getDailyStudiedCount();
  const sessionLimit = Math.max(1, dailyGoal);

  const [extraGoal, setExtraGoal] = useState(0);
  const [isNotificationPromptOpen, setIsNotificationPromptOpen] = useState(false);
  const [dontRemindAgain, setDontRemindAgain] = useState(false);
  const [skippedStudyKeys, setSkippedStudyKeys] = useState<Set<string>>(() => new Set());

  // Derive state from fsrs store
  const isSessionComplete = dailyStudied >= (sessionLimit + extraGoal);
  const normalizedWebhookUrl = webhookUrl.trim();
  const hasNotificationChannelConfigured = Boolean(
    upstashQstashToken.trim() &&
    normalizedWebhookUrl &&
    !normalizedWebhookUrl.includes('$telegram_bot_token')
  );
  const wasSessionCompleteRef = useRef(isSessionComplete);
  const scheduledReminderKeysRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    let isActive = true;

    if (!activeDeck?.useFrequencyOrder || wordsList.length === 0) {
      setFrequencyOrderedWordsState({ deckId: activeDeckId, words: wordsList });
      return;
    }

    setFrequencyOrderedWordsState({ deckId: activeDeckId, words: wordsList });
    getOfflineDictionaryEntries(wordsList)
      .then(entries => {
        if (!isActive) return;
        setFrequencyOrderedWordsState({ deckId: activeDeckId, words: sortWordsByFrequency(wordsList, entries) });
      })
      .catch(error => {
        console.error('Failed to load dictionary frequency metadata', error);
        if (!isActive) return;
        setFrequencyOrderedWordsState({ deckId: activeDeckId, words: wordsList });
      });

    return () => {
      isActive = false;
    };
  }, [activeDeck?.id, activeDeck?.useFrequencyOrder, activeDeckId, wordsList]);

  useEffect(() => {
    const justCompletedSession = isSessionComplete && !wasSessionCompleteRef.current;
    wasSessionCompleteRef.current = isSessionComplete;

    if (justCompletedSession && !hasNotificationChannelConfigured && !hasDismissedNotificationSetupReminder) {
      setDontRemindAgain(false);
      setIsNotificationPromptOpen(true);
    }
  }, [hasDismissedNotificationSetupReminder, hasNotificationChannelConfigured, isSessionComplete]);

  const availableWordsList = useMemo(() => {
    const studyWordsList = activeDeck?.useFrequencyOrder ? frequencyOrderedWordsList : wordsList;
    if (!activeDeckId || skippedStudyKeys.size === 0) return studyWordsList;
    return studyWordsList.filter(word => !skippedStudyKeys.has(getFsrsCardKey(activeDeckId, word)));
  }, [activeDeck?.useFrequencyOrder, activeDeckId, frequencyOrderedWordsList, skippedStudyKeys, wordsList]);

  const currentWord = activeDeckId && !isSessionComplete && activeQueueDeckId === activeDeckId ? getNextCard(activeDeckId, availableWordsList) : null;
  const isQueueEmpty = !currentWord;

  useEffect(() => {
    if (isQueueEmpty || isSessionComplete) {
      if (!activeDeckId) return;
      const nextDueTime = getNextDueTime(activeDeckId, availableWordsList);
      
      import('../services/notificationService').then(({ NotificationService }) => {
        if (nextDueTime && nextDueTime > Date.now()) {
          const batchReminderKey = `batch-${nextDueTime}`;
          if (!scheduledReminderKeysRef.current.has(batchReminderKey)) {
            scheduledReminderKeysRef.current.add(batchReminderKey);
            NotificationService.scheduleNextBatchReminder(nextDueTime);
          }
        }
        if (isSessionComplete) {
          const dailyReminderTime = NotificationService.getNextDefaultDailyReviewTime();
          const dailyReminderKey = `daily-${dailyReminderTime}`;
          if (!scheduledReminderKeysRef.current.has(dailyReminderKey)) {
            scheduledReminderKeysRef.current.add(dailyReminderKey);
            NotificationService.scheduleDailyReview(dailyReminderTime);
          }
        }
      });
    }
  }, [activeDeckId, availableWordsList, getNextDueTime, isQueueEmpty, isSessionComplete]);

  const [isShowAnswer, setIsShowAnswer] = useState(false);
  const [currentWordDetail, setCurrentWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wordLookupError, setWordLookupError] = useState('');
  const [lookupRetryCount, setLookupRetryCount] = useState(0);
  
  const [isShowList, setIsShowList] = useState(false);
  const [isDeckPickerOpen, setIsDeckPickerOpen] = useState(false);
  const [audioError, setAudioError] = useState('');

  useEffect(() => {
    setSkippedStudyKeys(new Set());
    setWordLookupError('');
    setLookupRetryCount(0);
  }, [activeDeckId]);

  useEffect(() => {
    let isActive = true;

    async function fetchWord() {
      if (!currentWord || isSessionComplete) {
        setCurrentWordDetail(null);
        setWordLookupError('');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIsShowAnswer(false);
      setCurrentWordDetail(null);
      setWordLookupError('');

      try {
        const detail = await searchDictionary(currentWord);
        if (!isActive) return;
        setCurrentWordDetail(detail);
        setWordLookupError(detail ? '' : t.wordLookupFailedMessage);
      } catch (error) {
        console.error('Word lookup failed', error);
        if (!isActive) return;
        setCurrentWordDetail(null);
        setWordLookupError(t.wordLookupFailedMessage);
      } finally {
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    fetchWord();
    return () => {
      isActive = false;
    };
  }, [currentWord, isSessionComplete, lookupRetryCount, t.wordLookupFailedMessage]);

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

  const handleRetryLookup = () => {
    setLookupRetryCount(count => count + 1);
  };

  const handleSkipCurrentWord = () => {
    if (!currentWord || !activeDeckId) return;

    const scopedKey = getFsrsCardKey(activeDeckId, currentWord);
    setSkippedStudyKeys((keys) => {
      const nextKeys = new Set(keys);
      nextKeys.add(scopedKey);
      return nextKeys;
    });
    setCurrentWordDetail(null);
    setWordLookupError('');
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
    if (activeDeckId && !getNextCard(activeDeckId, availableWordsList)) {
       useAppStore.getState().showAlert(t.noMoreWordsDue);
    }
  };

  const handleOpenNotificationConfig = () => {
    setIsNotificationPromptOpen(false);
    navigate('/setupNotification');
  };

  const handleSkipNotificationConfig = () => {
    if (dontRemindAgain) {
      setHasDismissedNotificationSetupReminder(true);
    }
    setIsNotificationPromptOpen(false);
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
      <>
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

        <AnimatePresence>
          {isNotificationPromptOpen && (
            <motion.div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="presentation"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label={t.skipForNow}
                onClick={handleSkipNotificationConfig}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="notification-setup-reminder-title"
                className="relative w-full max-w-md overflow-hidden rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={event => event.stopPropagation()}
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20">
                  <BellRing size={28} />
                </div>
                <h3 id="notification-setup-reminder-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t.notificationSetupReminderTitle}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t.notificationSetupReminderMessage}
                </p>

                <button
                  type="button"
                  onClick={handleOpenNotificationConfig}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                >
                  <BellRing size={18} />
                  {t.configureNotificationNow}
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleSkipNotificationConfig}
                  className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {t.skipForNow}
                </button>
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={dontRemindAgain}
                    onChange={event => setDontRemindAgain(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t.dontRemindAgain}
                </label>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
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
        "flex-1 flex min-h-0 flex-col transition-all duration-300 mx-auto overflow-hidden rounded-[32px] border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-transparent dark:bg-slate-950 dark:text-white max-[380px]:rounded-[24px]",
        isAssistantOpen ? "max-w-2xl" : "max-w-4xl"
      )}>
        <header className="flex shrink-0 items-center justify-between px-5 py-4 max-[380px]:px-3 max-[380px]:py-2">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15 dark:hover:text-white max-[380px]:h-8 max-[380px]:w-8">
            <ChevronLeft size={22} />
          </Link>
          <div className="min-w-0 px-4 text-center max-[380px]:px-2">
             <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400 dark:text-white/35 max-[380px]:text-[9px] max-[380px]:tracking-[0.16em]">{t.dailyLearning}</p>
            <p className="truncate text-sm font-semibold text-slate-600 dark:text-white/70 max-[380px]:text-xs">{activeDeck.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAssistant}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors max-[380px]:h-8 max-[380px]:w-8",
                isAssistantOpen
                  ? "bg-blue-100 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-400/20 dark:text-blue-200 dark:ring-blue-300/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/75 dark:hover:bg-white/15 dark:hover:text-white"
              )}
              title={t.aiAssistantTitle}
            >
              <MessageCircle size={20} />
            </button>
            <button onClick={() => setIsDeckPickerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-yellow-500 transition-colors hover:bg-slate-200 dark:bg-white/10 dark:text-yellow-300 dark:hover:bg-white/15 max-[380px]:h-8 max-[380px]:w-8" title={t.addToDeck}>
              <Star size={20} />
            </button>
            <button onClick={() => setIsShowList(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/75 dark:hover:bg-white/15 dark:hover:text-white max-[380px]:h-8 max-[380px]:w-8" title={t.studyQueue}>
              <CalendarClock size={20} />
            </button>
          </div>
        </header>

        <div className="shrink-0 px-5 pb-3 max-[380px]:px-3 max-[380px]:pb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all" style={{ width: `${Math.min(100, (dailyStudied / Math.max(1, dailyGoal + extraGoal)) * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-white/40 max-[380px]:mt-1 max-[380px]:text-[10px]">
            <span>{t.goal}: {dailyStudied} / {dailyGoal + extraGoal}</span>
            <span>{wordsList.length} {t.words}</span>
          </div>
        </div>

        <main className="flex min-h-0 flex-1 flex-col px-5 pb-5 max-[380px]:px-3 max-[380px]:pb-3">
          {isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-500 dark:text-white/45">
              <Loader2 size={32} className="mb-4 animate-spin" />
              <p>{t.loadingWord}</p>
            </div>
          ) : wordLookupError || !currentWordDetail ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-600 dark:text-white/55">
              <BookA size={36} className="mb-4 text-slate-400 dark:text-white/35" />
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.wordLookupFailedTitle}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-white/45">
                {wordLookupError || t.wordLookupFailedMessage}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleRetryLookup}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-400"
                >
                  <RefreshCw size={16} />
                  {t.retryLookup}
                </button>
                <button
                  onClick={handleSkipCurrentWord}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/75 dark:ring-white/10 dark:hover:bg-white/15 dark:hover:text-white"
                >
                  {t.skipWord}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain text-center">
                <motion.div key={currentWordDetail.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
                  <h1 className="break-all text-5xl font-black tracking-tight text-slate-900 dark:text-white md:text-7xl max-[380px]:text-3xl">{currentWordDetail.word}</h1>
                  {currentWordDetail.phonetic && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3 max-[380px]:mt-2 max-[380px]:gap-2">
                      <span className="text-lg font-medium text-slate-500 dark:text-white/45 max-[380px]:text-sm">/{currentWordDetail.phonetic}/</span>
                      <button onClick={() => handlePlayAudio(1)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white max-[380px]:px-2 max-[380px]:py-1 max-[380px]:text-[10px]"><Volume2 size={14} className="mr-1 inline" />{t.uk}</button>
                      <button onClick={() => handlePlayAudio(2)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white max-[380px]:px-2 max-[380px]:py-1 max-[380px]:text-[10px]"><Volume2 size={14} className="mr-1 inline" />{t.us}</button>
                    </div>
                  )}
                  {audioError && <p className="mt-2 text-xs font-medium text-rose-500 dark:text-rose-300">{audioError}</p>}
                  <DeckMembershipChips decks={membershipDecks} emptyLabel={t.notInAnyDeck} className="mt-4 justify-center max-[380px]:mt-2" />

                  <AnimatePresence mode="wait">
                    {isShowAnswer ? (
                      <motion.div key="answer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8 space-y-4 text-left max-[380px]:mt-4 max-[380px]:space-y-2">
                        {currentWordDetail.translation && (
                          <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 dark:bg-white/[0.07] dark:ring-white/10 max-[380px]:rounded-2xl max-[380px]:p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300 max-[380px]:mb-1 max-[380px]:text-[9px]">{t.translation}</p>
                            <p className="whitespace-pre-line text-xl font-semibold leading-relaxed text-slate-900 dark:text-white max-[380px]:text-sm max-[380px]:leading-snug">{currentWordDetail.translation}</p>
                          </div>
                        )}
                        {currentWordDetail.definition && (
                          <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10 max-[380px]:rounded-2xl max-[380px]:p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35 max-[380px]:mb-1 max-[380px]:text-[9px]">{t.definition}</p>
                            <p className="whitespace-pre-line font-serif text-base italic leading-relaxed text-slate-600 dark:text-white/75 max-[380px]:text-xs max-[380px]:leading-snug">{currentWordDetail.definition}</p>
                          </div>
                        )}
                        {currentWordDetail.detail && currentWordDetail.detail.length > 0 && (
                          <div className="space-y-3">
                            {currentWordDetail.detail.slice(0, 2).map((example, index) => (
                              <div key={`${example.en}-${index}`} className="border-l-2 border-blue-400/70 pl-4 text-slate-600 dark:text-white/75">
                                <p className="font-medium">{example.en}</p>
                                <p className="mt-1 text-sm text-slate-400 dark:text-white/45">{example.cn}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-14 rounded-full border border-dashed border-slate-300 px-6 py-3 text-sm font-medium text-slate-400 dark:border-white/10 dark:text-white/35 max-[380px]:mt-4 max-[380px]:px-4 max-[380px]:py-2 max-[380px]:text-xs">
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
                    <button onClick={() => handleFSRS('again')} className="rounded-2xl bg-rose-50 px-2 py-3 text-center ring-1 ring-rose-200 transition-colors hover:bg-rose-100 dark:bg-rose-500/15 dark:ring-rose-400/20 dark:hover:bg-rose-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-rose-600 dark:text-rose-300 max-[380px]:text-[11px]">{t.again}</span><span className="text-[10px] text-slate-400 dark:text-white/35 max-[380px]:text-[9px]">&lt; {intervals.again}</span></button>
                    <button onClick={() => handleFSRS('hard')} className="rounded-2xl bg-orange-50 px-2 py-3 text-center ring-1 ring-orange-200 transition-colors hover:bg-orange-100 dark:bg-orange-500/15 dark:ring-orange-400/20 dark:hover:bg-orange-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-orange-600 dark:text-orange-300 max-[380px]:text-[11px]">{t.hard}</span><span className="text-[10px] text-slate-400 dark:text-white/35 max-[380px]:text-[9px]">{intervals.hard}</span></button>
                    <button onClick={() => handleFSRS('good')} className="rounded-2xl bg-emerald-50 px-2 py-3 text-center ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/15 dark:ring-emerald-400/20 dark:hover:bg-emerald-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-emerald-600 dark:text-emerald-300 max-[380px]:text-[11px]">{t.good}</span><span className="text-[10px] text-slate-400 dark:text-white/35 max-[380px]:text-[9px]">{intervals.good}</span></button>
                    <button onClick={() => handleFSRS('easy')} className="rounded-2xl bg-blue-50 px-2 py-3 text-center ring-1 ring-blue-200 transition-colors hover:bg-blue-100 dark:bg-blue-500/15 dark:ring-blue-400/20 dark:hover:bg-blue-500/25 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2"><span className="block text-sm font-black text-blue-600 dark:text-blue-300 max-[380px]:text-[11px]">{t.easy}</span><span className="text-[10px] text-slate-400 dark:text-white/35 max-[380px]:text-[9px]">{intervals.easy}</span></button>
                    <button onClick={handleMarkMastered} className="rounded-2xl bg-slate-100 px-2 py-3 text-center ring-1 ring-slate-200 transition-colors hover:bg-slate-200 dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15 max-[380px]:rounded-xl max-[380px]:px-1 max-[380px]:py-2" title={t.markKnownTitle}><Trash2 size={16} className="mx-auto mb-1 text-slate-500 dark:text-white/55 max-[380px]:h-3.5 max-[380px]:w-3.5" /><span className="block text-xs font-black text-slate-500 dark:text-white/55 max-[380px]:text-[10px]">{t.known}</span></button>
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
