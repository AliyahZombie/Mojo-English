import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Flame, Clock, Glasses, Target, Layers, Newspaper, PenTool } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { translations } from '../lib/i18n';

function StatCard({ 
  title, value, subtitle, icon: Icon, colorClass 
}: { 
  title: string, value: string | number, subtitle: string, icon: any, colorClass: string 
}) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-slate-100 dark:border-slate-800/60 flex flex-col gap-2 transition-colors"
    >
      <div className="flex justify-between items-center mb-1 md:mb-2">
        <div className={cn("p-2 md:p-3 rounded-xl md:rounded-2xl transition-colors", colorClass)}>
          <Icon size={18} className="md:w-5 md:h-5" />
        </div>
        <h3 className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">{title}</h3>
      </div>
      <div>
        <div className="text-2xl md:text-3xl font-bold text-slate-700 dark:text-slate-200 tracking-tight transition-colors">{value}</div>
        <p className="text-xs md:text-sm font-medium text-slate-400 dark:text-slate-500 mt-0.5 md:mt-1 transition-colors">{subtitle}</p>
      </div>
    </motion.div>
  );
}

export function Home() {
  const dailyGoal = useAppStore(state => state.dailyGoal);
  const language = useAppStore(state => state.language);
  const t = translations[language];
  
  const randomQuote = useMemo(() => {
    const quotes = t.quotes;
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, [t.quotes]);

  const MOCK_CHART_DATA = useMemo(() => {
    const daysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const daysZh = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const days = language === 'en' ? daysEn : daysZh;
    const values = [12, 15, 10, 8, 18, 20, 25];
    
    return days.map((day, i) => ({
      name: day,
      words: values[i]
    }));
  }, [language]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex flex-col pb-8"
    >
      <header className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold mb-1 tracking-tight text-slate-800 dark:text-slate-200 transition-colors">{t.yourProgress}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">{randomQuote}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
        <Link 
          to="/words" 
          className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-slate-100 dark:border-slate-800/60 flex flex-col gap-2 transition-transform active:scale-[0.98] hover:-translate-y-1 group"
        >
          <div className="flex justify-between items-center mb-1 md:mb-2">
            <div className="p-2 md:p-3 rounded-xl md:rounded-2xl transition-colors bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Target size={18} className="md:w-5 md:h-5" />
            </div>
            <h3 className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">{t.dailyWords}</h3>
          </div>
          <div className="mt-auto">
            <div className="flex items-end gap-2">
              <div className="text-2xl md:text-3xl font-bold text-slate-700 dark:text-slate-200 tracking-tight transition-colors">18</div>
              <div className="text-sm font-medium text-slate-400 dark:text-slate-500 mb-0.5 md:mb-1">/ {dailyGoal}</div>
            </div>
            <div className="mt-1 md:mt-2 text-xs md:text-sm font-bold text-blue-600 dark:text-blue-500 flex items-center gap-1 group-hover:gap-2 transition-all">
              {t.goLearning} <span className="text-lg leading-none">&rarr;</span>
            </div>
          </div>
        </Link>
        <StatCard 
          title={t.streak} 
          value={`14 ${t.days}`} 
          subtitle={`${t.best}: 21 ${t.days}`}
          icon={Flame}
          colorClass="bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
        />
        <StatCard 
          title={t.studyTime} 
          value="45m" 
          subtitle={t.today}
          icon={Clock}
          colorClass="bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400"
        />
        <StatCard 
          title={t.wordsRead} 
          value="1,200" 
          subtitle={t.today}
          icon={Glasses}
          colorClass="bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6">
        <Link to="/news" className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-slate-100 dark:border-slate-800/60 flex items-center gap-3 md:gap-4 transition-all hover:-translate-y-1 hover:shadow-md group">
          <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            <Newspaper size={24} className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm md:text-lg font-bold text-slate-800 dark:text-slate-200">{t.readNews}</h3>
            <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{t.extractAndLearn}</p>
          </div>
        </Link>
        
        <Link to="/writing" className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-slate-100 dark:border-slate-800/60 flex items-center gap-3 md:gap-4 transition-all hover:-translate-y-1 hover:shadow-md group">
          <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform">
            <PenTool size={24} className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm md:text-lg font-bold text-slate-800 dark:text-slate-200">{t.writing}</h3>
            <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{t.practiceOutput}</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 flex-1">
        <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800/60 transition-colors">
          <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6 transition-colors">{t.weeklyWordsStudied}</h3>
          <div className="h-64 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MOCK_CHART_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="words" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#334155' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
