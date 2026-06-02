import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ChevronLeft, Search, BookA, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { ChatAssistant } from '../components/ChatAssistant';
import { useAppStore } from '../store/useAppStore';

const MOCK_NEWS = [
  {
    id: '1',
    title: 'The Future of AI Assistants in Daily Life',
    source: 'Tech Daily',
    date: 'October 26, 2023',
    readTime: '5 min read',
    category: 'Tech',
    excerpt: 'Artificial intelligence is ubiquitous in modern technology, but its evolution is far from ephemeral...',
    paragraphs: [
      'Artificial intelligence is ubiquitous in modern technology, but its evolution is far from ephemeral. As models grow larger, their sycophantic tendencies decrease, leading to more robust daily assistants.',
      'Ten years ago, interacting with a computer using natural language felt like science fiction. Today, it\'s a mundane reality. The rapid proliferation of large language models (LLMs) has fundamentally altered how we work, learn, and communicate.',
      'However, challenges remain. Contextual understanding and reasoning are areas where AI still struggles compared to human cognition. Overcoming these hurdles will require not just bigger models, but fundamentally new architectures.'
    ],
    vocabQuestion: {
      word: 'ubiquitous',
      options: ['Rarely seen or found.', 'Present, appearing, or found everywhere.', 'Difficult to understand.', 'Extremely expensive.'],
      answer: 1
    },
    compQuestion: 'What is identified as a remaining challenge for AI?'
  },
  {
    id: '2',
    title: 'Deep Ocean Exploration Yields New Species',
    source: 'Science Weekly',
    date: 'November 2, 2023',
    readTime: '4 min read',
    category: 'Science',
    excerpt: 'Marine biologists have uncovered a plethora of new organisms previously unknown to science in the Mariana Trench...',
    paragraphs: [
      'Marine biologists have uncovered a plethora of new organisms previously unknown to science in the Mariana Trench. The sheer diversity of life at these depths is staggering, challenging our previous preconceptions about extreme environments.',
      'Organisms here rely on chemosynthesis rather than photosynthesis, drawing energy from hydrothermal vents. This adaptation highlights the resilience of life.',
      'Further research is required to understand the full ecological impact of these species, but the initial findings are promising.'
    ],
    vocabQuestion: {
      word: 'plethora',
      options: ['A large or excessive amount.', 'A severe shortage.', 'A type of marine plant.', 'A deep ocean trench.'],
      answer: 0
    },
    compQuestion: 'What is the energy source for the newly discovered organisms?'
  },
  {
    id: '3',
    title: 'Minimalist Design in Modern Architecture',
    source: 'Art Perspective',
    date: 'November 10, 2023',
    readTime: '6 min read',
    category: 'Art',
    excerpt: 'The recent trend towards minimalist architecture emphasizes functionality and simplicity, stripping away the superfluous...',
    paragraphs: [
      'The recent trend towards minimalist architecture emphasizes functionality and simplicity, stripping away the superfluous. Form follows function in these austere yet beautiful structures.',
      'Natural light and open spaces are prioritized, creating an illusion of vastness even in constrained urban environments. Materials like concrete, glass, and steel are often left exposed.',
      'Critics argue it lacks warmth, but proponents praise the calming psychological effect of uncluttered spaces.'
    ],
    vocabQuestion: {
      word: 'superfluous',
      options: ['Essential for structural integrity.', 'Unnecessary, especially through being more than enough.', 'Beautiful and decorative.', 'Simple and functional.'],
      answer: 1
    },
    compQuestion: 'What materials are commonly used in the architectural style discussed?'
  }
];

export function News() {
  const { isAssistantOpen, toggleAssistant } = useAppStore();
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [shortAnswer, setShortAnswer] = useState('');

  const [selectedWord, setSelectedWord] = useState('');
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim() !== '') {
        const text = selection.toString().trim();
        // Only show for 1-3 words
        if (text.split(/\s+/).length <= 3 && /^[a-zA-Z\s\-']+$/.test(text)) {
          setSelectedWord(text);
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top });
        } else {
          setSelectedWord('');
        }
      }
      // Give precedence to custom tap-to-select if native is collapsed
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    // Hide popover when mouse down occurs outside
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#dict-popover') && !target.closest('.article-content')) {
         if (window.getSelection()?.isCollapsed) {
           setSelectedWord('');
         }
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const handleArticleClick = (e: React.MouseEvent) => {
    // On desktop or if native selection exists
    if (window.getSelection()?.toString().trim()) return;
    
    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
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
    const offset = range.startOffset;
    const text = textNode.data;

    let start = offset;
    let end = offset;
    while (start > 0 && /[a-zA-Z0-9\-']/.test(text[start - 1])) start--;
    while (end < text.length && /[a-zA-Z0-9\-']/.test(text[end])) end++;

    const word = text.slice(start, end).trim();
    if (word && word.length >= 2 && /^[a-zA-Z\-']+$/.test(word)) {
      setSelectedWord(word);
      setPopoverPos({ x: e.clientX, y: e.clientY - 20 });
    } else {
      setSelectedWord('');
    }
  };

  const handleBack = () => {
    setSelectedArticleId(null);
    setSelectedOption(null);
    setAnswerSubmitted(false);
    setShortAnswer('');
  };

  const selectedArticle = MOCK_NEWS.find(n => n.id === selectedArticleId);

  return (
    <div className="w-full h-full relative overflow-x-hidden overflow-y-auto pb-6">
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
                <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-tight text-slate-800 dark:text-slate-200 transition-colors">News Feed</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">Articles tailored to your interests.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Search articles..." 
                  className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 w-full md:w-64 shadow-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                />
              </div>
            </header>

            <div className="flex-1 space-y-4">
              {MOCK_NEWS.map((article) => (
                <motion.div 
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  key={article.id}
                  onClick={() => setSelectedArticleId(article.id)}
                  className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[24px] md:rounded-[32px] shadow-sm border border-blue-50 dark:border-slate-800 cursor-pointer flex flex-col gap-4 relative overflow-hidden transition-all hover:shadow-md hover:border-blue-100 dark:hover:border-slate-700"
                >
                  <div className="flex-1">
                    <div className="flex gap-2 mb-3">
                      <span className="text-[10px] md:text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded uppercase tracking-widest transition-colors">{article.category}</span>
                      <span className="text-slate-400 dark:text-slate-500 text-[10px] md:text-xs font-bold ml-auto bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded transition-colors">{article.readTime}</span>
                    </div>
                    <h2 className="text-lg md:text-xl xl:text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2 leading-tight transition-colors">{article.title}</h2>
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 transition-colors">{article.excerpt}</p>
                    <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 font-medium transition-colors">{article.source} · {article.date}</p>
                  </div>
                </motion.div>
              ))}
            </div>
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
                Back
              </button>
              <header className="mb-6 md:mb-8 border-b border-blue-50 dark:border-slate-800 pb-6 md:pb-8 transition-colors">
                <div className="flex gap-2 mb-3 md:mb-4">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse mt-1" />
                  <span className="text-[10px] md:text-xs font-bold text-rose-500 uppercase tracking-widest">Daily News</span>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] md:text-xs font-bold ml-auto bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded transition-colors">{selectedArticle?.readTime}</span>
                </div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 md:mb-4 tracking-tight text-slate-800 dark:text-slate-200 italic transition-colors">{selectedArticle?.title}</h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm font-medium transition-colors">By {selectedArticle?.source}  ·  {selectedArticle?.date}</p>
              </header>
              
              <div 
                className="article-content prose prose-slate dark:prose-invert prose-lg max-w-none text-slate-700 dark:text-slate-300 transition-colors select-text cursor-text"
                onClick={handleArticleClick}
              >
                <p className="lead text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium mb-6">
                  {selectedArticle?.paragraphs[0]}
                </p>
                {selectedArticle?.paragraphs.slice(1).map((p, i) => (
                  <p key={i} className="mb-4 text-justify leading-relaxed text-sm md:text-base">
                    {p}
                  </p>
                ))}
              </div>
            </div>

            <div className="lg:flex-1 w-full flex flex-col gap-4 md:gap-6 h-fit shrink-0">
              <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-blue-100/50 dark:border-blue-900/30 transition-colors">
                <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400 mb-6 transition-colors">Reading Quiz</h3>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-4 text-sm leading-relaxed transition-colors">
                  What does <span className="italic font-bold text-blue-600 dark:text-blue-400">{selectedArticle?.vocabQuestion.word}</span> mean in the context of the article?
                </p>
                
                <div className="space-y-3 mb-6">
                  {selectedArticle?.vocabQuestion.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedOption(i)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all font-medium text-sm",
                        selectedOption === i 
                          ? "bg-blue-600 dark:bg-blue-500 text-white shadow-md border-transparent" 
                          : "bg-white dark:bg-slate-900 border-blue-100 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span>{String.fromCharCode(65 + i)}. {opt}</span>
                        {selectedOption === i && answerSubmitted && i === selectedArticle.vocabQuestion.answer && <CheckCircle2 className="text-white shrink-0 ml-2" size={18} />}
                      </div>
                    </button>
                  ))}
                </div>
                
                <button 
                  onClick={() => setAnswerSubmitted(true)}
                  className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-bold py-3 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors text-sm"
                >
                  Check Answer
                </button>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-blue-100/50 dark:border-blue-900/30 transition-colors">
                <h3 className="font-bold text-sm text-blue-600 dark:text-blue-400 mb-4 transition-colors">Comprehension</h3>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-4 text-sm leading-relaxed transition-colors">
                  {selectedArticle?.compQuestion}
                </p>
                
                <div className="relative mt-2">
                  <textarea 
                    value={shortAnswer}
                    onChange={(e) => setShortAnswer(e.target.value)}
                    placeholder="Explain in your own words..."
                    className="w-full bg-white/60 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl p-4 min-h-[120px] outline-none focus:border-blue-400 dark:focus:border-blue-500 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200 resize-none transition-colors"
                  />
                  <button className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-blue-500 dark:bg-blue-600 text-white flex items-center justify-center hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors shadow-sm">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Desktop Assistant */}
            <AnimatePresence>
              {isAssistantOpen && (
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                  className="hidden xl:flex w-80 lg:w-96 shrink-0 flex-col h-full sticky top-4 max-h-[calc(100vh-2rem)]"
                >
                  <ChatAssistant 
                    contextId={`news_${selectedArticleId}`}
                    title="Article Assistant"
                    description="Discuss this article"
                    systemContext={`The user is reading an article titled "${selectedArticle?.title}". Full text:\n\n${selectedArticle?.paragraphs.join('\n\n')}`}
                    className="h-[600px] shadow-sm"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Chat / Discussion Drawer */}
      <AnimatePresence>
        {selectedArticleId && isAssistantOpen && (
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
                  title="Article Assistant"
                  description="Discuss this article"
                  systemContext={`The user is reading an article titled "${selectedArticle?.title}". Full text:\n\n${selectedArticle?.paragraphs.join('\n\n')}`}
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
              to={`/dictionary?q=${encodeURIComponent(selectedWord.toLowerCase())}`}
              className="flex items-center gap-2 bg-slate-900 dark:bg-blue-600 text-white px-4 py-2.5 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all outline-none font-medium text-sm whitespace-nowrap"
            >
              <BookA size={16} />
              Look up "{selectedWord.length > 15 ? selectedWord.substring(0, 15) + '...' : selectedWord}"
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
