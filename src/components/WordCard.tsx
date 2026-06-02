import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, BookmarkPlus, Sparkles, ArrowRightLeft, Quote } from 'lucide-react';

export interface WordDetail {
  id: string;
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  tag: string;
  bnc: number;
  frq: number;
  exchange: string;
  collins: number;
  oxford: number;
  detail?: Array<{ en: string; cn: string }>;
}

const EXCHANGE_MAP: Record<string, string> = {
  p: 'Plural',
  d: 'Past',
  i: 'V-ing',
  '3': '3rd Pers',
  s: 'Comp.',
  t: 'Super.',
  f: 'Verb',
  '1': 'Noun',
  '0': 'Lemma',
  c: 'Noun'
};

export function parseExchange(exchangeStr: string | undefined) {
  if (!exchangeStr) return [];
  const parts = exchangeStr.split('/');
  return parts.map(p => {
    const [key, val] = p.split(':');
    return {
      type: EXCHANGE_MAP[key] || key,
      word: val
    };
  }).filter(e => e.word);
}

interface WordCardProps {
  word: WordDetail;
  isShowAnswer: boolean;
}

export function WordCard({ word, isShowAnswer }: WordCardProps) {
  const [audioError, setAudioError] = React.useState<string>('');

  const handlePlayAudio = (type: 1 | 2 = 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAudioError('');
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word)}&type=${type}`);
    audio.play().catch(err => {
      // Browsers often throw NotSupportedError for 404/500 media responses
      if (err.name === 'NotSupportedError') {
        setAudioError('Audio not available');
        console.warn(`Pronunciation not available for "${word.word}"`);
      } else {
        setAudioError('Audio play failed');
        console.warn("Audio play failed:", err.message);
      }
    });
  };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={word.id}
        initial={{ opacity: 0, x: 20, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, duration: 0.2 }}
        className="w-full bg-white dark:bg-slate-900 rounded-[32px] md:rounded-[40px] p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 flex flex-col transition-colors min-h-[400px]"
      >
        <div className="absolute top-0 right-0 p-6 md:p-8 flex items-center gap-2">
           {word.oxford === 1 && (
             <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded text-[10px] md:text-xs font-bold uppercase transition-colors shrink-0">Oxford</span>
           )}
           {word.collins > 0 && (
             <span className="text-amber-400 text-sm md:text-base tracking-widest mr-2 select-none">{"★".repeat(word.collins)}</span>
           )}
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start relative z-10 gap-4 pr-16 md:pr-24">
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-800 dark:text-slate-100 tracking-tight break-all transition-colors">{word.word}</h2>
            </div>
            {word.phonetic && (
              <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-2">
                <span className="text-slate-400 dark:text-slate-500 font-medium md:text-lg transition-colors">/{word.phonetic}/</span>
                
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-1 border border-slate-100 dark:border-slate-800 transition-colors">
                  <button 
                    onClick={(e) => handlePlayAudio(1, e)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all text-xs font-bold"
                  >
                    <Volume2 size={14} /> UK
                  </button>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700"></div>
                  <button 
                    onClick={(e) => handlePlayAudio(2, e)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all text-xs font-bold"
                  >
                    <Volume2 size={14} /> US
                  </button>
                </div>
                {audioError && <span className="text-rose-500 dark:text-rose-400 text-xs font-medium bg-rose-50 dark:bg-rose-900/40 px-2 py-1 rounded-md">{audioError}</span>}
              </div>
            )}
          </div>
        </div>
        
        {isShowAnswer && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 relative z-10 flex flex-col pt-6 md:pt-8 mt-6 border-t border-slate-100 dark:border-slate-800/60 transition-colors"
          >
            <div className="grid md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_280px] gap-6 md:gap-8 lg:gap-12 flex-1">
              
              {/* Left side: Definition & Translation */}
              <div className="flex flex-col gap-6 md:gap-8">
                {word.translation && (
                  <div className="flex gap-3">
                    <div className="w-1 h-5 bg-blue-400 dark:bg-blue-500 rounded-full shrink-0 mt-1"></div>
                    <div className="flex flex-col">
                      <h4 className="font-bold text-slate-400 dark:text-slate-500 text-[10px] md:text-xs uppercase tracking-widest mb-1">Translation</h4>
                      <p className="text-lg md:text-xl text-slate-700 dark:text-slate-200 font-medium whitespace-pre-line leading-relaxed flex-1">
                        {word.translation}
                      </p>
                    </div>
                  </div>
                )}

                {word.definition && (
                  <div className="p-4 md:p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
                    <h4 className="font-bold text-slate-400 dark:text-slate-500 text-[10px] md:text-xs uppercase tracking-widest mb-2">Definition</h4>
                    <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed whitespace-pre-line font-serif italic">
                      {word.definition}
                    </p>
                  </div>
                )}

                {word.detail && word.detail.length > 0 && (
                  <div className="flex flex-col gap-4 mt-2">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                      <Quote size={16} className="text-blue-500" />
                      Examples
                    </h4>
                    <div className="space-y-4">
                      {word.detail.map((ex, i) => (
                        <div key={i} className="flex flex-col gap-1.5 pl-4 border-l-2 border-blue-100 dark:border-blue-900/50">
                          <p className="text-slate-700 dark:text-slate-300 font-medium text-sm md:text-base">
                            {ex.en.split(new RegExp(`(${word.word.toLowerCase()})`, 'i')).map((part, j) => 
                              part.toLowerCase() === word.word.toLowerCase() ? <strong key={j} className="text-blue-600 dark:text-blue-400">{part}</strong> : part
                            )}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm">{ex.cn}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right side sidebars: Tags, Exchange */}
              <div className="flex flex-col gap-6 text-sm mt-6 md:mt-0 pt-6 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800/80 md:pl-6 lg:pl-8">
                {/* Corpus Frequencies */}
                {(word.bnc > 0 || word.frq > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors">
                      <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">BNC Freq</div>
                      <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{word.bnc > 0 ? word.bnc : '-'}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors">
                      <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">COCA Freq</div>
                      <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{word.frq > 0 ? word.frq : '-'}</div>
                    </div>
                  </div>
                )}
                {word.tag && (
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-xs uppercase tracking-widest flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500" />
                      Tags
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {word.tag.split(' ').map(t => (
                        <span key={t} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded uppercase text-[10px] font-bold tracking-wider transition-colors">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {word.exchange && (
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-xs uppercase tracking-widest flex items-center gap-2">
                      <ArrowRightLeft size={14} className="text-blue-500" />
                      Word Forms
                    </h4>
                    <div className="flex flex-col gap-2">
                      {parseExchange(word.exchange).map(e => (
                         <div key={e.type} className="flex items-baseline justify-between py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0 transition-colors">
                           <span className="text-slate-400 dark:text-slate-500 text-xs">{e.type}</span>
                           <span className="text-slate-700 dark:text-slate-300 font-medium text-xs md:text-sm">{e.word}</span>
                         </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <button className="hidden md:flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-yellow-500 dark:hover:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 mt-auto font-medium shadow-sm">
                  <BookmarkPlus size={18} />
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
