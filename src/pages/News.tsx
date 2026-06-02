import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ChevronLeft, Search, BookA, Send, Loader2, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { ChatAssistant } from '../components/ChatAssistant';
import { useAppStore } from '../store/useAppStore';
import { translations } from '../lib/i18n';
import { loadNewsFeedPageWithCache, enrichNewsArticle, evaluateNewsShortAnswer } from '../services/newsPipeline';
import { getCachedNewsArticle } from '../services/dictionaryDb';
import type { EnrichedNewsArticle, NewsFeedItem } from '../services/newsTypes';
import type { NewsQuizArticleState } from '../store/useAppStore';

type NewsTranslation = typeof translations.en;

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

export function News() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isAssistantOpen,
    toggleAssistant,
    preferences,
    newsdataApiKey,
    tavilyApiKey,
    language,
    newsQuizStates,
    setNewsQuizArticleState,
  } = useAppStore();
  const t = translations[language];
  const [feedItems, setFeedItems] = useState<NewsFeedItem[]>([]);
  const [articleDetailsById, setArticleDetailsById] = useState<Record<string, EnrichedNewsArticle | undefined>>({});
  const selectedArticleId = searchParams.get('article');
  const [cachedSelectedArticle, setCachedSelectedArticle] = useState<EnrichedNewsArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isEvaluatingShortAnswer, setIsEvaluatingShortAnswer] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [visibleCount, setVisibleCount] = useState(10);
  const [refreshRequestId, setRefreshRequestId] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingEnrichmentIdsRef = useRef<Set<string>>(new Set());
  const lastHandledRefreshRequestIdRef = useRef(0);
  const hasNewsdataApiKey = newsdataApiKey.trim().length > 0;
  const hasTavilyApiKey = tavilyApiKey.trim().length > 0;
  const activeQuizState = useMemo<NewsQuizArticleState>(() => {
    if (!selectedArticleId) {
      return createDefaultNewsQuizArticleState();
    }

    return newsQuizStates[selectedArticleId] ?? createDefaultNewsQuizArticleState();
  }, [newsQuizStates, selectedArticleId]);

  const orderedItems = useMemo(() => {
    return [...feedItems].filter((item) => articleDetailsById[item.id]?.enrichmentStatus !== 'non-english').sort((left, right) => {
      const leftScore = articleDetailsById[left.id]?.recommendationScore || 0;
      const rightScore = articleDetailsById[right.id]?.recommendationScore || 0;
      return rightScore - leftScore;
    });
  }, [articleDetailsById, feedItems]);

  const selectedArticle = useMemo(() => {
    const item = feedItems.find((entry) => entry.id === selectedArticleId);
    if (!item) {
      return cachedSelectedArticle?.id === selectedArticleId ? cachedSelectedArticle : null;
    }
    return articleDetailsById[item.id] || buildPlaceholderArticle(item, t);
  }, [articleDetailsById, cachedSelectedArticle, feedItems, selectedArticleId, t]);

  useEffect(() => {
    let cancelled = false;

    const loadFirstPage = async () => {
      const shouldForceRefresh = refreshRequestId > lastHandledRefreshRequestIdRef.current;
      setVisibleCount(10);
      if (!hasNewsdataApiKey) {
        setFeedItems([]);
        setArticleDetailsById({});
        setNextPageCursor(null);
        setHasMore(false);
        setErrorMessage('');
        return;
      }

      setIsLoadingInitial(true);
      setErrorMessage('');
      if (!shouldForceRefresh) {
        setFeedItems([]);
        setArticleDetailsById({});
        setNextPageCursor(null);
        setHasMore(false);
      }
      try {
        const page = await loadNewsFeedPageWithCache({
          newsdataApiKey,
          preferences,
          search: appliedSearchQuery,
          forceRefresh: shouldForceRefresh,
        });
        if (cancelled) {
          return;
        }
        if (shouldForceRefresh) {
          lastHandledRefreshRequestIdRef.current = refreshRequestId;
        }
        setFeedItems((current) => shouldForceRefresh ? dedupeFeedItems([...page.items, ...current]) : page.items);
        setNextPageCursor(page.nextPage);
        setHasMore(Boolean(page.nextPage));
      } catch (error) {
        if (!cancelled) {
          if (!shouldForceRefresh) {
            setFeedItems([]);
            setNextPageCursor(null);
            setHasMore(false);
          }
          setErrorMessage(error instanceof Error ? error.message : t.newsLoadFailed);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInitial(false);
          setIsRefreshing(false);
        }
      }
    };

    loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [appliedSearchQuery, hasNewsdataApiKey, newsdataApiKey, preferences, refreshRequestId, t.newsLoadFailed]);

  useEffect(() => {
    setSelectedWord('');
  }, [selectedArticleId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedArticleId || feedItems.some((item) => item.id === selectedArticleId)) {
      setCachedSelectedArticle(null);
      return;
    }

    void getCachedNewsArticle(selectedArticleId).then((cached) => {
      if (!cancelled) {
        setCachedSelectedArticle(cached);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [feedItems, selectedArticleId]);

  useEffect(() => {
    if (!hasNewsdataApiKey || !hasMore || !nextPageCursor || isLoadingMore || !sentinelRef.current) {
      return;
    }

    const scrollRoot = scrollContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          void loadMoreFeedItems();
        }
      },
      { root: scrollRoot, rootMargin: '400px' },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, nextPageCursor, feedItems.length, hasNewsdataApiKey, preferences, appliedSearchQuery, isLoadingMore]);

  useEffect(() => {
    if (!hasTavilyApiKey || feedItems.length === 0) {
      return;
    }

    const toEnrich = orderedItems.slice(0, visibleCount);
    void Promise.allSettled(
      toEnrich.map(async (item) => {
        const existingStatus = articleDetailsById[item.id]?.enrichmentStatus;
        if (
          existingStatus === 'ready' ||
          existingStatus === 'blacklisted-source' ||
          existingStatus === 'failed' ||
          existingStatus === 'non-english' ||
          pendingEnrichmentIdsRef.current.has(item.id)
        ) {
          return;
        }

        pendingEnrichmentIdsRef.current.add(item.id);
        setArticleDetailsById((current) => current[item.id]
          ? current
          : { ...current, [item.id]: { ...buildPlaceholderArticle(item, t), enrichmentStatus: 'extracting' } });

        try {
          const enriched = await enrichNewsArticle({
            feedItem: item,
            tavilyApiKey,
            preferences,
          });
          setArticleDetailsById((current) => ({ ...current, [item.id]: enriched }));
        } finally {
          pendingEnrichmentIdsRef.current.delete(item.id);
        }
      }),
    );
  }, [articleDetailsById, feedItems, hasTavilyApiKey, orderedItems, preferences, tavilyApiKey, visibleCount, t]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim() !== '') {
        const text = selection.toString().trim();
        if (text.split(/\s+/).length <= 3 && /^[a-zA-Z\s\-']+$/.test(text)) {
          setSelectedWord(text);
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top });
        } else {
          setSelectedWord('');
        }
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#dict-popover') && !target.closest('.article-content') && window.getSelection()?.isCollapsed) {
        setSelectedWord('');
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const handleArticleClick = (event: MouseEvent) => {
    if (window.getSelection()?.toString().trim()) {
      return;
    }

    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    } else if ((document as CaretPositionDocument).caretPositionFromPoint) {
      const pos = (document as CaretPositionDocument).caretPositionFromPoint?.(event.clientX, event.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setSelectedWord('');
      return;
    }

    const textNode = range.startContainer as Text;
    const text = textNode.data;
    let start = range.startOffset;
    let end = range.startOffset;
    while (start > 0 && /[a-zA-Z0-9\-']/.test(text[start - 1])) start--;
    while (end < text.length && /[a-zA-Z0-9\-']/.test(text[end])) end++;

    const word = text.slice(start, end).trim();
    if (word && word.length >= 2 && /^[a-zA-Z\-']+$/.test(word)) {
      setSelectedWord(word);
      setPopoverPos({ x: event.clientX, y: event.clientY - 20 });
    } else {
      setSelectedWord('');
    }
  };

  const handleBack = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('article');
    setSearchParams(nextParams, { replace: false });
  };

  const openArticle = (articleId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('article', articleId);
    setSearchParams(nextParams, { replace: false });
  };

  const handleSearchSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setAppliedSearchQuery(searchQuery.trim());
  };

  const handleRefreshNews = () => {
    if (!hasNewsdataApiKey || isLoadingInitial || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setRefreshRequestId((current) => current + 1);
  };

  async function loadMoreFeedItems() {
    if (!hasNewsdataApiKey || !hasMore || !nextPageCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await loadNewsFeedPageWithCache({
        newsdataApiKey,
        preferences,
        search: appliedSearchQuery,
        nextPage: nextPageCursor,
      });
      setFeedItems((current) => dedupeFeedItems([...current, ...page.items]));
      setNextPageCursor(page.nextPage);
      setHasMore(Boolean(page.nextPage));
      setVisibleCount((current) => current + 10);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.newsLoadMoreFailed);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const handleSubmitShortAnswer = async () => {
    if (!selectedArticle || isEvaluatingShortAnswer) {
      return;
    }
    setIsEvaluatingShortAnswer(true);
    try {
      const evaluation = await evaluateNewsShortAnswer({ article: selectedArticle, answer: activeQuizState.shortAnswerDraft });
      if (selectedArticleId) {
        setNewsQuizArticleState(selectedArticleId, { shortAnswerEvaluation: evaluation });
      }
    } finally {
      setIsEvaluatingShortAnswer(false);
    }
  };

  const activePreferenceLabel = preferences.length > 0 ? preferences.join(', ') : t.topEnglishHeadlines;
  const dictionaryReturnPath = selectedArticleId ? `/news?article=${selectedArticleId}` : '/news';

  return (
    <div ref={scrollContainerRef} className="w-full h-full relative overflow-x-hidden overflow-y-auto pb-6">
      <AnimatePresence mode="wait">
        {!selectedArticleId ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full flex flex-col"
          >
            <header className="mb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-tight text-slate-800 dark:text-slate-200 transition-colors">{t.newsFeed}</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">{t.recommendedUsing}: {activePreferenceLabel}.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleRefreshNews}
                  disabled={!hasNewsdataApiKey || isLoadingInitial || isRefreshing}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-full px-4 py-2 text-sm shadow-sm hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors disabled:cursor-not-allowed"
                >
                  <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
                  {t.refreshNews}
                </button>
                <form className="relative" onSubmit={handleSearchSubmit}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors" size={18} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t.searchArticles}
                    className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 w-full md:w-64 shadow-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                  />
                </form>
              </div>
            </header>

            <div className="flex-1 space-y-4">
              {!hasNewsdataApiKey && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-3xl p-6 text-amber-700 dark:text-amber-300 text-sm font-medium">
                  {t.addNewsdataKeyNotice}
                </div>
              )}

              {hasNewsdataApiKey && !hasTavilyApiKey && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/40 rounded-3xl p-6 text-cyan-700 dark:text-cyan-300 text-sm font-medium">
                  {t.addTavilyKeyNotice}
                </div>
              )}

              {errorMessage && hasNewsdataApiKey && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-3xl p-6 text-rose-700 dark:text-rose-300 text-sm font-medium">
                  {errorMessage}
                </div>
              )}

              {isLoadingInitial && (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[32px] shadow-sm border border-blue-50 dark:border-slate-800 text-sm font-medium text-slate-500 dark:text-slate-400 transition-colors flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin" /> {t.loadingHeadlineFeed}
                </div>
              )}

              {!isLoadingInitial && hasNewsdataApiKey && orderedItems.length === 0 && !errorMessage && (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[32px] shadow-sm border border-blue-50 dark:border-slate-800 text-sm font-medium text-slate-500 dark:text-slate-400 transition-colors">
                  {t.noArticlesFound}
                </div>
              )}

              {orderedItems.map((article) => {
                const details = articleDetailsById[article.id];
                return (
                  <motion.div
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    key={article.id}
                    onClick={() => openArticle(article.id)}
                    className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[24px] md:rounded-[32px] shadow-sm border border-blue-50 dark:border-slate-800 cursor-pointer flex flex-col gap-4 relative overflow-hidden transition-all hover:shadow-md hover:border-blue-100 dark:hover:border-slate-700"
                  >
                    <div className="flex-1">
                      <div className="flex gap-2 mb-3 items-center">
                        <span className="text-[10px] md:text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded uppercase tracking-widest transition-colors">{article.category}</span>
                        {details?.recommendationScore ? (
                          <span className="text-[10px] md:text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded uppercase tracking-widest">
                            {t.match} {details.recommendationScore}
                          </span>
                        ) : null}
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] md:text-xs font-bold ml-auto bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded transition-colors">
                          {details?.readTime || t.preview}
                        </span>
                      </div>
                      <h2 className="text-lg md:text-xl xl:text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2 leading-tight transition-colors">{article.title}</h2>
                      <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 transition-colors">{details?.paragraphs[0] || article.excerpt}</p>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 font-medium transition-colors">{article.source} · {article.date}</p>
                        <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500">
                          {describeStatus(details?.enrichmentStatus, hasTavilyApiKey, t)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {hasMore && <div ref={sentinelRef} className="h-10" />}

              {isLoadingMore && (
                <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-4 flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> {t.loadingOlderStories}
                </div>
              )}

              {!isLoadingMore && hasMore && (
                <button
                  type="button"
                  onClick={() => void loadMoreFeedItems()}
                  className="mx-auto flex items-center justify-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-full px-5 py-2.5 shadow-sm hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                >
                  {t.loadOlderStories}
                </button>
              )}
            </div>
          </motion.div>
        ) : !selectedArticle ? (
          <motion.div
            key="missing-detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800"
          >
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 mb-6 text-sm font-bold tracking-wide transition-colors uppercase"
            >
              <ChevronLeft size={18} className="-ml-1" />
              {t.back}
            </button>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {t.articleMissing}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full flex flex-col lg:flex-row gap-4 md:gap-6 relative"
          >
            <div className="lg:flex-[2] w-full bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 h-fit transition-colors">
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 mb-6 text-sm font-bold tracking-wide transition-colors uppercase"
              >
                <ChevronLeft size={18} className="-ml-1" />
                {t.back}
              </button>
              <header className="mb-6 md:mb-8 border-b border-blue-50 dark:border-slate-800 pb-6 md:pb-8 transition-colors">
                <div className="flex gap-2 mb-3 md:mb-4">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse mt-1" />
                  <span className="text-[10px] md:text-xs font-bold text-rose-500 uppercase tracking-widest">{t.dailyNews}</span>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] md:text-xs font-bold ml-auto bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded transition-colors">{selectedArticle.readTime}</span>
                </div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 md:mb-4 tracking-tight text-slate-800 dark:text-slate-200 italic transition-colors">{selectedArticle.title}</h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm font-medium transition-colors">{t.by} {selectedArticle.source} · {selectedArticle.date}</p>
              </header>

              {selectedArticle?.imageUrl && (
                <img
                  src={selectedArticle.imageUrl}
                  alt=""
                  className="w-full max-h-80 object-cover rounded-3xl mb-6 border border-blue-50 dark:border-slate-800"
                />
              )}

              <div
                className="article-content prose prose-slate dark:prose-invert prose-lg max-w-none text-slate-700 dark:text-slate-300 transition-colors select-text cursor-text"
                onClick={handleArticleClick}
              >
                <p className="lead text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium mb-6">
                  {selectedArticle.paragraphs[0]}
                </p>
                {selectedArticle.paragraphs.slice(1).map((paragraph, index) => (
                  <p key={index} className="mb-4 text-justify leading-relaxed text-sm md:text-base">
                    {paragraph}
                  </p>
                ))}
                {selectedArticle.link && (
                  <a
                    href={selectedArticle.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-4 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {t.readOriginalArticle}
                  </a>
                )}
              </div>
            </div>

            <div className="lg:flex-1 w-full flex flex-col gap-4 md:gap-6 h-fit shrink-0">
              <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-blue-100/50 dark:border-blue-900/30 transition-colors">
                <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400 mb-6 transition-colors">{t.readingQuiz}</h3>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-4 text-sm leading-relaxed transition-colors">
                  {selectedArticle.quiz.contentQuestion?.question || `${t.vocabQuestionFallbackBefore} ${selectedArticle.quiz.vocabQuestion.word} ${t.vocabQuestionFallbackAfter}`}
                </p>

                <div className="space-y-3 mb-6">
                  {(selectedArticle.quiz.contentQuestion?.options || selectedArticle.quiz.vocabQuestion.options).map((option, index) => {
                     const correctAnswer = selectedArticle.quiz.contentQuestion?.answer ?? selectedArticle.quiz.vocabQuestion.answer;
                     const isSelected = activeQuizState.selectedOption === index;
                     const isCorrect = activeQuizState.answerSubmitted && index === correctAnswer;
                     const isWrongSelection = activeQuizState.answerSubmitted && isSelected && index !== correctAnswer;
                     return (
                     <button
                       key={index}
                       onClick={() => {
                         if (selectedArticleId) {
                           setNewsQuizArticleState(selectedArticleId, { selectedOption: index });
                         }
                       }}
                       disabled={activeQuizState.answerSubmitted}
                       className={cn(
                        'w-full text-left p-4 rounded-xl border transition-all font-medium text-sm',
                        isCorrect && 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-md border-transparent',
                        isWrongSelection && 'bg-rose-600 dark:bg-rose-500 text-white shadow-md border-transparent',
                        !isCorrect && !isWrongSelection && isSelected && 'bg-blue-600 dark:bg-blue-500 text-white shadow-md border-transparent',
                        !isCorrect && !isWrongSelection && !isSelected && 'bg-white dark:bg-slate-900 border-blue-100 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-300',
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span>{String.fromCharCode(65 + index)}. {option}</span>
                        {isCorrect ? <CheckCircle2 className="text-white shrink-0 ml-2" size={18} /> : null}
                      </div>
                    </button>
                  );})}
                </div>

                 {activeQuizState.answerSubmitted && (
                   <div className="mb-4 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                     <span className="font-bold text-slate-800 dark:text-slate-100">
                       {activeQuizState.selectedOption === (selectedArticle.quiz.contentQuestion?.answer ?? selectedArticle.quiz.vocabQuestion.answer) ? `${t.correctFeedback} ` : `${t.notQuiteFeedback} `}
                     </span>
                     {selectedArticle.quiz.contentQuestion?.explanation || selectedArticle.quiz.vocabQuestion.explanation}
                   </div>
                 )}

                 <button
                   onClick={() => {
                     if (selectedArticleId) {
                       setNewsQuizArticleState(selectedArticleId, { answerSubmitted: true });
                     }
                   }}
                   disabled={activeQuizState.selectedOption === null}
                   className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-bold py-3 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors text-sm"
                 >
                   {t.checkAnswer}
                </button>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-blue-100/50 dark:border-blue-900/30 transition-colors">
                <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400 mb-4 transition-colors">{t.comprehension}</h3>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-4 text-sm leading-relaxed transition-colors">
                  {selectedArticle.quiz.shortAnswer?.question || selectedArticle.quiz.compQuestion}
                </p>

                 <div className="relative mt-2">
                   <textarea
                     value={activeQuizState.shortAnswerDraft}
                     onChange={(event) => {
                       if (selectedArticleId) {
                         setNewsQuizArticleState(selectedArticleId, { shortAnswerDraft: event.target.value });
                       }
                     }}
                     placeholder={t.shortAnswerPlaceholder}
                     className="w-full bg-white/60 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl p-4 min-h-[120px] outline-none focus:border-blue-400 dark:focus:border-blue-500 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200 resize-none transition-colors"
                   />
                  <button
                     type="button"
                     onClick={() => void handleSubmitShortAnswer()}
                     disabled={isEvaluatingShortAnswer || !activeQuizState.shortAnswerDraft.trim()}
                     className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-blue-500 dark:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white flex items-center justify-center hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors shadow-sm disabled:cursor-not-allowed"
                   >
                     {isEvaluatingShortAnswer ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                   </button>
                 </div>

                 {activeQuizState.shortAnswerEvaluation && (
                   <div className={cn(
                     'mt-4 rounded-xl border p-4 text-sm leading-relaxed',
                     activeQuizState.shortAnswerEvaluation.isCorrect
                       ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                       : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40 text-amber-800 dark:text-amber-200',
                   )}>
                     <div className="font-bold mb-1">{t.score}: {activeQuizState.shortAnswerEvaluation.score}/100</div>
                     <p>{activeQuizState.shortAnswerEvaluation.feedback}</p>
                     <p className="mt-2 text-xs opacity-80"><span className="font-bold">{t.sample}:</span> {activeQuizState.shortAnswerEvaluation.sampleAnswer}</p>
                   </div>
                 )}
              </div>
            </div>

            <AnimatePresence>
              {isAssistantOpen && selectedArticle && (
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                  className="hidden xl:flex w-80 lg:w-96 shrink-0 flex-col h-full sticky top-4 max-h-[calc(100vh-2rem)]"
                >
                  <ChatAssistant
                    contextId={`news_${selectedArticleId}`}
                    title={t.articleAssistant}
                    description={t.discussArticle}
                    systemContext={`The user is reading an article titled "${selectedArticle.title}". Full text:\n\n${selectedArticle.paragraphs.join('\n\n')}`}
                    className="h-[600px] shadow-sm"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedArticleId && isAssistantOpen && selectedArticle && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 backdrop-blur-sm xl:hidden"
              onClick={toggleAssistant}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 right-0 bottom-0 h-[80vh] z-50 rounded-t-3xl border-t border-slate-100 dark:border-slate-800 flex flex-col xl:hidden bg-white dark:bg-slate-900 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
            >
              <ChatAssistant
                contextId={`news_${selectedArticleId}`}
                title={t.articleAssistant}
                description={t.discussArticle}
                systemContext={`The user is reading an article titled "${selectedArticle.title}". Full text:\n\n${selectedArticle.paragraphs.join('\n\n')}`}
                onClose={toggleAssistant}
                className="rounded-none border-none shadow-none h-full"
                isEmbedded={true}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedWord && (
          <motion.div
            id="dict-popover"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed z-[100] bottom-24 left-1/2 transform -translate-x-1/2 shadow-2xl md:bottom-auto md:left-[var(--popover-x)] md:top-[var(--popover-y)] md:-translate-y-full md:pb-3"
            style={{ '--popover-x': `${popoverPos.x}px`, '--popover-y': `${popoverPos.y}px` } as React.CSSProperties}
          >
            <Link
              to={`/dictionary?q=${encodeURIComponent(selectedWord.toLowerCase())}&from=${encodeURIComponent(dictionaryReturnPath)}`}
              state={{ from: dictionaryReturnPath, returnLabel: selectedArticleId ? t.backToArticle : t.backToNews }}
              className="flex items-center gap-2 bg-slate-900 dark:bg-blue-600 text-white px-4 py-2.5 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all outline-none font-medium text-sm whitespace-nowrap"
            >
              <BookA size={16} />
              {t.lookUp} "{selectedWord.length > 15 ? `${selectedWord.substring(0, 15)}...` : selectedWord}"
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function dedupeFeedItems(items: NewsFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function createDefaultNewsQuizArticleState(): NewsQuizArticleState {
  return {
    selectedOption: null,
    answerSubmitted: false,
    shortAnswerDraft: '',
    shortAnswerEvaluation: null,
  };
}

function buildPlaceholderArticle(item: NewsFeedItem, t: NewsTranslation): EnrichedNewsArticle {
  return {
    ...item,
    paragraphs: [item.excerpt],
    readTime: t.preview,
    quiz: {
      vocabQuestion: {
        word: item.keywords[0]?.toLowerCase() || 'context',
        options: [
          'A key clue from the article context.',
          'A person mentioned by the source.',
          'A date from the report.',
          'A location cited in the article.',
        ],
        answer: 0,
        explanation: 'Use the article preview to infer the word from context.',
      },
      compQuestion: `What is the key update in "${item.title}"?`,
      contentQuestion: {
        question: `Which statement best captures the key update in "${item.title}"?`,
        options: [
          'The article reports the central development described in the headline.',
          'The article is mainly a weather forecast.',
          'The article is only an advertisement.',
          'The article focuses on unrelated entertainment gossip.',
        ],
        answer: 0,
        explanation: 'Use the headline and preview to identify the main development.',
      },
      shortAnswer: {
        question: `Summarize the key update in "${item.title}" in one sentence.`,
        expectedAnswer: `A good answer identifies the main update in "${item.title}" and mentions one supporting detail from the preview or article.`,
        rubric: ['Mentions the main update.', 'Includes a supporting detail.', 'Avoids adding outside facts.'],
      },
    },
    recommendationScore: 0,
    enrichmentStatus: 'idle',
    sourceDomain: item.link ? tryGetDomain(item.link) : null,
    sourceUrl: item.link,
    fetchedAt: Date.now(),
    cleanedAt: null,
    quizGeneratedAt: null,
    pipelineVersion: 'news-pipeline-v1',
  };
}

function tryGetDomain(link: string): string | null {
  try {
    return new URL(link).hostname;
  } catch {
    return null;
  }
}

function describeStatus(status: EnrichedNewsArticle['enrichmentStatus'] | undefined, hasTavilyApiKey: boolean, t: NewsTranslation) {
  if (!hasTavilyApiKey) {
    return t.statusHeadlineOnly;
  }
  if (!status || status === 'idle') {
    return t.statusQueued;
  }
  if (status === 'ready') {
    return t.statusReady;
  }
  if (status === 'blacklisted-source') {
    return t.statusBlocked;
  }
  if (status === 'failed') {
    return t.statusCachedPreview;
  }
  if (status === 'non-english') {
    return t.statusNonEnglish;
  }
  return t.statusProcessing;
}
