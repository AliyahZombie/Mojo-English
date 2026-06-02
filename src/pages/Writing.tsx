import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Save, Check } from 'lucide-react';

export function Writing() {
  const [text, setText] = useState('Start writing your essay or journal here...\n\nThe AI will evaluate your vocabulary and grammar.');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save simulation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text) {
        setIsSaving(true);
        setTimeout(() => {
          setIsSaving(false);
          setLastSaved(new Date());
        }, 800);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [text]);

  const lines = text.split('\n');

  const handleScroll = () => {
    // Keep line numbers synced if scrolling happens (in a real app with scrollbar)
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full flex flex-col flex-1 pb-10"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 md:mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-slate-800 dark:text-slate-200 transition-colors">Writing Practice</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base transition-colors">Express your thoughts freely.</p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-sm border border-blue-50 dark:border-slate-800 self-end md:self-auto min-w-[fit-content] transition-colors">
          {isSaving ? (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm transition-colors">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Saving...
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 font-medium text-xs md:text-sm transition-colors">
              <Check size={14} />
              Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 bg-[#1E293B] dark:bg-black/40 rounded-[24px] md:rounded-[32px] shadow-xl overflow-hidden flex flex-col transform transition-all focus-within:ring-2 focus-within:ring-blue-400 dark:focus-within:ring-blue-600 min-h-[300px] border dark:border-slate-800">
        <div className="flex justify-between items-center p-3 md:p-4 border-b border-slate-700/50 dark:border-slate-800">
          <div className="flex gap-1.5 pl-1 md:pl-2">
            <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-rose-500"></div>
            <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-amber-500"></div>
            <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-emerald-500"></div>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-600 font-mono pr-2 transition-colors">autosave: active</span>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-8 md:w-12 pt-4 md:pt-6 pb-6 text-right pr-2 md:pr-4 select-none flex flex-col border-r border-slate-700/50 dark:border-slate-800 overflow-hidden">
            {lines.map((_, i) => (
              <div key={i} className="text-slate-600 dark:text-slate-700 font-mono text-[10px] md:text-sm leading-8 transition-colors">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={handleScroll}
            className="flex-1 bg-transparent border-none outline-none resize-none p-4 md:p-6 font-mono text-xs md:text-sm leading-8 text-slate-300 dark:text-slate-400 hide-scrollbar transition-colors"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="mt-4 md:mt-6 flex justify-end gap-3 md:gap-4 pb-2">
        <button className="px-4 py-2.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 shadow-sm border border-blue-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm md:text-base">
          Feedback
        </button>
        <button className="px-4 py-2.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-bold text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg shadow-blue-500/20 dark:shadow-none transition-colors flex items-center gap-2 text-sm md:text-base">
          <Save size={16} />
          <span className="hidden sm:inline">Force Save</span>
          <span className="sm:hidden">Save</span>
        </button>
      </div>
    </motion.div>
  );
}
