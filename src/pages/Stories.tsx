import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpenText, ChevronLeft, Loader2, PenLine, Sparkles, Trash2 } from 'lucide-react';
import { useAppStore, type Story } from '../store/useAppStore';
import { getLocalDateString, useFsrsStore } from '../store/useFsrsStore';
import { translations } from '../lib/i18n';
import { streamStoryFromWords } from '../services/storyService';
import { generateWritingTopic } from '../services/writingTopicService';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';

const wordFromStudyKey = (studyKey: string) => studyKey.includes('::') ? studyKey.split('::').slice(1).join('::') : studyKey;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlightText(text: string, words: string[]): ReactNode[] {
  const uniqueWords = Array.from(new Set(words.map(word => word.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
  if (uniqueWords.length === 0) return [text];

  const pattern = new RegExp(`\\b(${uniqueWords.map(escapeRegExp).join('|')})\\b`, 'gi');
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <strong key={`${match[0]}-${index}`} className="text-blue-600 dark:text-blue-400">
        {match[0]}
      </strong>
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function HighlightedMarkdown({ content, words }: { content: string; words: string[] }) {
  const renderChildren = (children: ReactNode): ReactNode => {
    if (typeof children === 'string') return highlightText(children, words);
    if (Array.isArray(children)) return children.map((child, index) => <span key={index}>{renderChildren(child)}</span>);
    return children;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{renderChildren(children)}</p>,
        li: ({ children }) => <li>{renderChildren(children)}</li>,
        h1: ({ children }) => <h1>{renderChildren(children)}</h1>,
        h2: ({ children }) => <h2>{renderChildren(children)}</h2>,
        h3: ({ children }) => <h3>{renderChildren(children)}</h3>,
        strong: ({ children }) => <strong>{renderChildren(children)}</strong>,
        em: ({ children }) => <em>{renderChildren(children)}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function Stories() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { stories, addStory, deleteStory, language, activeDeckId, storyPrompt, showAlert, isAssistantOpen, toggleAssistant } = useAppStore();
  const dailyStats = useFsrsStore(state => state.dailyStats);
  const t = translations[language];
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [streamedContent, setStreamedContent] = useState('');
  const hasHandledGenerateParamRef = useRef(false);
  const selectedStoryId = searchParams.get('story');
  const shouldGenerateToday = searchParams.get('generate') === 'today';

  const todayWords = useMemo(() => {
    const today = getLocalDateString();
    const studiedKeys = dailyStats[today]?.studiedKeys || [];
    return Array.from(new Set(studiedKeys.map(wordFromStudyKey).filter(Boolean)));
  }, [dailyStats]);

  const selectedStory = stories.find(story => story.id === selectedStoryId) || null;
  const todayStory = stories.find(story => getLocalDateString(new Date(story.createdAt)) === getLocalDateString()) || null;
  const assistantContextId = selectedStory ? `story_${selectedStory.id}` : 'story_index';
  const assistantSystemContext = selectedStory
    ? `${t.storyAssistantSystemPrompt}\n\nTitle: ${selectedStory.title}\nWords: ${selectedStory.words.join(', ')}\n\nStory:\n${selectedStory.content}`
    : `${t.storyAssistantSystemPrompt}\n\nToday words: ${todayWords.join(', ') || 'None'}\nStory history: ${stories.map(story => `${story.title} (${story.words.length} words)`).join('; ') || 'None'}`;

  const handleGenerateStory = async () => {
    if (todayWords.length === 0) {
      showAlert(t.noWordsForStory);
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');
    setStreamedContent('');
    try {
      const generated = await streamStoryFromWords(todayWords, language, storyPrompt, setStreamedContent);
      const story: Story = {
        id: `story-${Date.now()}`,
        title: generated.title,
        content: generated.content,
        words: todayWords,
        createdAt: Date.now(),
        deckId: activeDeckId,
      };
      addStory(story);
      setStreamedContent('');
      setSearchParams({ story: story.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartTopicWriting = async () => {
    if (!selectedStory || isGeneratingTopic) return;

    setIsGeneratingTopic(true);
    try {
      const generatedTopic = await generateWritingTopic({
        source: 'story',
        title: selectedStory.title,
        content: selectedStory.content,
        language,
      });
      navigate('/writing', {
        state: {
          topic: generatedTopic,
          sourceTitle: selectedStory.title,
          sourceType: 'story',
          sourceContent: selectedStory.content,
        },
      });
    } catch (error) {
      showAlert({
        title: t.writingTopicFailed,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  useEffect(() => {
    if (!shouldGenerateToday || hasHandledGenerateParamRef.current) return;
    hasHandledGenerateParamRef.current = true;
    if (todayStory) {
      setSearchParams({ story: todayStory.id }, { replace: true });
      return;
    }
    setSearchParams({}, { replace: true });
    void handleGenerateStory();
  }, [shouldGenerateToday, setSearchParams, todayStory]);

  const renderAssistantPanels = () => (
    <>
      <AnimatePresence>
        {isAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
            className="hidden xl:flex w-80 lg:w-96 shrink-0 flex-col h-[calc(100vh-6rem)] sticky top-4 max-h-[800px]"
          >
            <ChatAssistant
              contextId={assistantContextId}
              title={t.storyAssistant}
              description={t.storyAssistantDesc}
              className="h-full shadow-sm"
              onClose={toggleAssistant}
              systemContext={assistantSystemContext}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAssistantOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleAssistant}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 backdrop-blur-sm xl:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 h-[80vh] z-50 rounded-t-3xl border-t border-slate-100 dark:border-slate-800 flex flex-col xl:hidden bg-white dark:bg-slate-900 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
            >
              <ChatAssistant
                contextId={assistantContextId}
                title={t.storyAssistant}
                description={t.storyAssistantDesc}
                className="rounded-none border-none shadow-none h-full"
                onClose={toggleAssistant}
                systemContext={assistantSystemContext}
                isEmbedded={true}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );

  if (selectedStory) {
    return (
      <div className="w-full h-full flex gap-6 relative">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex-1 mx-auto pb-10 transition-all duration-300", isAssistantOpen ? "max-w-3xl" : "max-w-4xl")}>
          <button onClick={() => setSearchParams({})} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
            <ChevronLeft size={18} /> {t.backToStories}
          </button>

          <article className="bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800/60">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-500 dark:text-amber-400 mb-2">{t.story}</p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">{selectedStory.title}</h1>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">{new Date(selectedStory.createdAt).toLocaleString()}</p>
            </div>
            <button onClick={() => { deleteStory(selectedStory.id); setSearchParams({}); }} className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t.delete}>
              <Trash2 size={18} />
            </button>
          </div>

          <section className="mb-8">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-3">{t.storyWordsUsed}</h2>
            <div className="flex flex-wrap gap-2">
              {selectedStory.words.map(word => (
                <span key={word} className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/60">
                  {word}
                </span>
              ))}
            </div>
          </section>

          <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:tracking-tight prose-p:leading-8 prose-li:leading-8">
            <HighlightedMarkdown content={selectedStory.content} words={selectedStory.words} />
          </div>

          <div className="mt-8 rounded-3xl border border-amber-100 bg-amber-50/70 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="mb-4 text-base font-bold text-slate-800 dark:text-slate-100">{t.interestedWriteSomething}</p>
            <button
              onClick={handleStartTopicWriting}
              disabled={isGeneratingTopic}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGeneratingTopic ? <Loader2 size={18} className="animate-spin" /> : <PenLine size={18} />}
              {isGeneratingTopic ? t.generatingWritingTopic : t.startTopicWriting}
            </button>
          </div>
        </article>
        </motion.div>

        {renderAssistantPanels()}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex gap-6 relative">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex-1 mx-auto pb-10 transition-all duration-300", isAssistantOpen ? "max-w-3xl" : "max-w-4xl")}>
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-[32px] p-6 md:p-8 text-white shadow-lg shadow-orange-500/20 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <BookOpenText size={28} />
          <h1 className="text-2xl md:text-3xl font-bold">{t.story}</h1>
        </div>
        <p className="text-white/85 mb-6">{t.storyPageDesc}</p>
        {todayStory ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button onClick={() => setSearchParams({ story: todayStory.id })} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50">
              <BookOpenText size={18} /> {t.viewTodayStory}
            </button>
            <button onClick={handleGenerateStory} disabled={isGenerating || todayWords.length === 0} className="inline-flex items-center gap-2 text-sm font-bold text-white/90 transition-colors hover:text-white disabled:opacity-60 disabled:cursor-not-allowed">
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isGenerating ? t.generatingStory : t.regenerateTodayStory}
            </button>
          </div>
        ) : (
          <button onClick={handleGenerateStory} disabled={isGenerating || todayWords.length === 0} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50 disabled:opacity-60 disabled:cursor-not-allowed">
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isGenerating ? t.generatingStory : t.generateTodayStory}
          </button>
        )}
        <p className="mt-3 text-sm text-white/75">{t.todayStoryWordsCount.replace('{count}', String(todayWords.length))}</p>
      </div>

      {(isGenerating || streamedContent) && (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-amber-100 dark:border-amber-900/40 mb-6">
          <div className="mb-5 flex items-center gap-2 text-amber-600 dark:text-amber-400">
            {isGenerating && <Loader2 size={18} className="animate-spin" />}
            <h2 className="text-lg font-bold">{t.streamingStoryTitle}</h2>
          </div>
          <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:tracking-tight prose-p:leading-8 prose-li:leading-8">
            <HighlightedMarkdown content={streamedContent || t.storyStreamWaiting} words={todayWords} />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800/60">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5">{t.storyHistory}</h2>
        {stories.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <BookOpenText size={44} className="mx-auto mb-4 opacity-50" />
            <p>{t.noStoriesYet}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stories.map(story => (
              <Link key={story.id} to={`/stories?story=${encodeURIComponent(story.id)}`} className="block rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-amber-200 hover:bg-amber-50/40 dark:hover:border-amber-800/60 dark:hover:bg-amber-900/10 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{story.title}</h3>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{new Date(story.createdAt).toLocaleString()} · {story.words.length} {t.words}</p>
                  </div>
                  <span className="text-amber-500 text-sm font-bold">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      </motion.div>
      {renderAssistantPanels()}
    </div>
  );
}
