import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, BookmarkPlus, Sparkles, ArrowRightLeft, Quote, Bot, BookOpen } from 'lucide-react';

import { useAppStore } from '../store/useAppStore';
import type { Deck } from '../store/useAppStore';
import { translations, type Language } from '../lib/i18n';
import { DeckMembershipChips } from './DeckMembershipChips';
import { cn } from '../lib/utils';

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

const getExchangeMap = (language: Language): Record<string, string> => {
  const t = translations[language];
  return {
    p: t.exchangePlural,
    d: t.exchangePast,
    i: t.exchangeVing,
    '3': t.exchangeThirdPerson,
    s: t.exchangeComparative,
    t: t.exchangeSuperlative,
    f: t.exchangeVerb,
    '1': t.exchangeNoun,
    '0': t.exchangeLemma,
    c: t.exchangeNoun
  };
};

export function parseExchange(exchangeStr: string | undefined, language: Language = 'en') {
  if (!exchangeStr) return [];
  const exchangeMap = getExchangeMap(language);
  const parts = exchangeStr.split('/');
  return parts.map(p => {
    const [key, val] = p.split(':');
    return {
      type: exchangeMap[key] || key,
      word: val
    };
  }).filter(e => e.word);
}

interface WordCardProps {
  word: WordDetail;
  isShowAnswer: boolean;
  membershipDecks?: Deck[];
  onAddToDeck?: () => void;
}

export function WordCard({ word, isShowAnswer, membershipDecks, onAddToDeck }: WordCardProps) {
  const { language } = useAppStore();
  const t = translations[language];
  const [audioError, setAudioError] = React.useState<string>('');

  const handlePlayAudio = (type: 1 | 2 = 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAudioError('');
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word)}&type=${type}`);
    audio.play().catch(err => {
      // Browsers often throw NotSupportedError for 404/500 media responses
      if (err.name === 'NotSupportedError') {
        setAudioError(t.audioNotAvailable);
        console.warn(`Pronunciation not available for "${word.word}"`);
      } else {
        setAudioError(t.audioPlayFailed);
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
        className="relative flex w-full max-h-[calc(100dvh-6rem)] min-h-[400px] flex-col overflow-hidden rounded-[32px] border border-blue-50 bg-white p-6 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 md:rounded-[40px] md:p-8"
      >
        <div className="absolute top-0 right-0 p-6 md:p-8 flex items-center gap-2">
           {word.id.startsWith('ai-') ? (
             <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded text-[10px] md:text-xs font-bold uppercase transition-colors shrink-0">
               <Bot size={12} />
                <span>{t.aiGenerated}</span>
             </div>
           ) : word.id.startsWith('dict-') ? (
             <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded text-[10px] md:text-xs font-bold uppercase transition-colors shrink-0">
               <BookOpen size={12} />
                <span>{t.ecdictLocal}</span>
             </div>
           ) : null}
           {word.oxford === 1 && (
              <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded text-[10px] md:text-xs font-bold uppercase transition-colors shrink-0">{t.oxford}</span>
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
                    <Volume2 size={14} /> {t.uk}
                  </button>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700"></div>
                  <button 
                    onClick={(e) => handlePlayAudio(2, e)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all text-xs font-bold"
                  >
                    <Volume2 size={14} /> {t.us}
                  </button>
                </div>
                {audioError && <span className="text-rose-500 dark:text-rose-400 text-xs font-medium bg-rose-50 dark:bg-rose-900/40 px-2 py-1 rounded-md">{audioError}</span>}
              </div>
            )}
            {membershipDecks && (
              <DeckMembershipChips decks={membershipDecks} emptyLabel={t.notInAnyDeck} className="mt-3" />
            )}
          </div>
        </div>
        
        {isShowAnswer && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mt-6 flex min-h-0 flex-1 flex-col border-t border-slate-100 pt-6 transition-colors dark:border-slate-800/60 md:pt-8"
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-6 md:grid-cols-[1fr_240px] md:gap-8 lg:grid-cols-[1fr_280px] lg:gap-12">
              
                {/* Left side: Definition & Translation */}
                <div className="flex flex-col gap-6 md:gap-8">
                  {word.translation && (
                    <div className="flex gap-3">
                      <div className="mt-1 h-5 w-1 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500"></div>
                      <div className="flex flex-col">
                        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 md:text-xs">{t.translation}</h4>
                        <p className="flex-1 whitespace-pre-line text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-200 md:text-xl">
                          {word.translation}
                        </p>
                      </div>
                    </div>
                  )}

                  {word.definition && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors dark:border-slate-800 dark:bg-slate-800/50 md:p-5">
                      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 md:text-xs">{t.definition}</h4>
                      <p className="whitespace-pre-line font-serif text-sm leading-relaxed italic text-slate-600 dark:text-slate-300 md:text-base">
                        {word.definition}
                      </p>
                    </div>
                  )}

                  {word.detail && word.detail.length > 0 && (
                    <div className="mt-2 flex flex-col gap-4">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <Quote size={16} className="text-blue-500" />
                        {t.examples}
                      </h4>
                      <div className="space-y-4">
                        {word.detail.map((ex, i) => (
                          <div key={i} className="flex flex-col gap-1.5 border-l-2 border-blue-100 pl-4 dark:border-blue-900/50">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 md:text-base">
                              {ex.en.split(new RegExp(`(${word.word.toLowerCase()})`, 'i')).map((part, j) => 
                                part.toLowerCase() === word.word.toLowerCase() ? <strong key={j} className="text-blue-600 dark:text-blue-400">{part}</strong> : part
                              )}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">{ex.cn}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side sidebars: Tags, Exchange */}
                <div className="flex flex-col gap-6 border-t border-slate-100 pt-6 text-sm dark:border-slate-800/80 md:border-l md:border-t-0 md:pl-6 md:pt-0 lg:pl-8">
                  {/* Corpus Frequencies */}
                  {(word.bnc > 0 || word.frq > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition-colors dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="mb-1 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">{t.bncFreq}</div>
                        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{word.bnc > 0 ? word.bnc : '-'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition-colors dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="mb-1 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">{t.cocaFreq}</div>
                        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{word.frq > 0 ? word.frq : '-'}</div>
                      </div>
                    </div>
                  )}
                  {word.tag && (
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">
                        <Sparkles size={14} className="text-amber-500" />
                        {t.tags}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {word.tag.split(' ').map(t => (
                          <span key={t} className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {word.exchange && (
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">
                        <ArrowRightLeft size={14} className="text-blue-500" />
                        {t.wordForms}
                      </h4>
                      <div className="flex flex-col gap-2">
                        {parseExchange(word.exchange, language).map(e => (
                           <div key={e.type} className="flex items-baseline justify-between border-b border-slate-100 py-1 transition-colors last:border-0 dark:border-slate-800/60">
                             <span className="text-xs text-slate-400 dark:text-slate-500">{e.type}</span>
                             <span className="text-xs font-medium text-slate-700 dark:text-slate-300 md:text-sm">{e.word}</span>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={onAddToDeck} className={cn(
              "mt-6 flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 font-medium shadow-sm transition-colors hover:bg-yellow-50 hover:text-yellow-500 dark:border-slate-700/50 dark:text-slate-400 dark:hover:bg-yellow-900/20 dark:hover:text-yellow-400 text-slate-500",
              onAddToDeck ? "flex" : "hidden md:flex"
            )}>
              <BookmarkPlus size={18} />
              {t.save}
            </button>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
