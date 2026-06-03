import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Clock, Glasses, Target, Newspaper, PenTool, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { translations } from '../lib/i18n';
import { ChatAssistant } from '../components/ChatAssistant';

const hasSupabaseAnalyticsConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

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

import { getLocalDateString, useFsrsStore } from '../store/useFsrsStore';

export function Home() {
  const { dailyGoal, language, isAssistantOpen, toggleAssistant, analyticsConsent, analyticsOnlineUsers, setAnalyticsConsent, showAlert } = useAppStore();
  const { getDailyStudiedCount, dailyStats } = useFsrsStore();
  const t = translations[language];
  const studiedToday = getDailyStudiedCount();
  
  const randomQuote = useMemo(() => {
    const quotes = t.quotes;
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, [t.quotes]);

  useEffect(() => {
    if (analyticsConsent !== null) return;

    showAlert({
      title: t.analyticsConsentTitle,
      message: t.analyticsConsentDesc,
      isConfirm: true,
      variant: 'analytics-consent',
      confirmText: t.analyticsConsentAccept,
      cancelText: t.analyticsConsentDecline,
      onConfirm: () => setAnalyticsConsent(true),
      onCancel: () => setAnalyticsConsent(false),
    });
  }, [analyticsConsent, setAnalyticsConsent, showAlert, t.analyticsConsentAccept, t.analyticsConsentDecline, t.analyticsConsentDesc, t.analyticsConsentTitle]);

  const streakCount = useMemo(() => {
    let streak = 0;
    const statsDateKeys = Object.keys(dailyStats);
    if (statsDateKeys.length === 0) return 0;
    
    // go backwards
    for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        if (dailyStats[dateStr]?.studiedCount > 0) {
            streak++;
        } else if (i > 0) {
            // gap found, unless it's today and today is 0 (we haven't studied yet but streak from yesterday is active)
            break;
        }
    }
    return streak;
  }, [dailyStats]);
  
  const MOCK_CHART_DATA = useMemo(() => {
    const daysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const daysZh = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const days = language === 'en' ? daysEn : daysZh;
    
    // Get last 7 days stats
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0=Sun->6, 1=Mon->0
      const dateStr = getLocalDateString(d);
      const count = dailyStats[dateStr]?.studiedCount || 0;
      
      chartData.push({
        name: days[dayIndex],
        words: count,
        fullDate: dateStr
      });
    }
    return chartData;
  }, [language, dailyStats]);

  return (
    <div className="w-full h-full flex gap-6 relative">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex-1 flex flex-col pb-8 transition-all duration-300 mx-auto",
          isAssistantOpen ? "max-w-3xl" : "w-full"
        )}
      >
        <header className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold mb-1 tracking-tight text-slate-800 dark:text-slate-200 transition-colors">{t.yourProgress}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">{randomQuote}</p>
        {analyticsConsent === true && hasSupabaseAnalyticsConfig && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-100/80 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 shadow-sm shadow-blue-500/5 transition-colors">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-slate-900">
              <Users size={13} className="text-blue-500 dark:text-blue-400" />
            </span>
            {t.onlineLearners.replace('{count}', analyticsOnlineUsers.toLocaleString())}
          </div>
        )}
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
              <div className="text-2xl md:text-3xl font-bold text-slate-700 dark:text-slate-200 tracking-tight transition-colors">{studiedToday}</div>
              <div className="text-sm font-medium text-slate-400 dark:text-slate-500 mb-0.5 md:mb-1">/ {dailyGoal}</div>
            </div>
            <div className="mt-1 md:mt-2 text-xs md:text-sm font-bold text-blue-600 dark:text-blue-500 flex items-center gap-1 group-hover:gap-2 transition-all">
              {t.goLearning} <span className="text-lg leading-none">&rarr;</span>
            </div>
          </div>
        </Link>
        <StatCard 
          title={t.streak} 
          value={`${streakCount} ${t.days}`} 
          subtitle={`${t.best}: ${streakCount} ${t.days}`}
          icon={Flame}
          colorClass="bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
        />
        <StatCard 
          title={t.studyTime} 
          value={`${Math.ceil(studiedToday * 1.5)}m`} 
          subtitle={t.today}
          icon={Clock}
          colorClass="bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400"
        />
        <StatCard 
          title={t.wordsRead} 
          value={(studiedToday).toString()} 
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

    {/* Desktop Assistant */}
    <AnimatePresence>
      {isAssistantOpen && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
          className="hidden xl:flex w-80 lg:w-96 shrink-0 flex-col h-[calc(100vh-6rem)] sticky top-4 max-h-[800px]"
        >
          <ChatAssistant 
            contextId="home_dashboard"
            title={t.dashboardAssistant}
            description={t.dashboardAssistantDesc}
            className="h-full shadow-sm"
            onClose={toggleAssistant}
          />
        </motion.div>
      )}
    </AnimatePresence>

    {/* Mobile Chat / Discussion Drawer */}
    <AnimatePresence>
      {isAssistantOpen && (
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
                contextId="home_dashboard"
                title={t.dashboardAssistant}
                description={t.dashboardAssistantDesc}
                onClose={toggleAssistant}
                className="rounded-none border-none shadow-none h-full"
                isEmbedded={true}
              />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </div>
  );
}
