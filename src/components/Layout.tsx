import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Layers, Newspaper, PenTool, Settings, BookA, ChevronLeft, Languages, MessageCircle, BookOpenText } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Logo } from './Logo';
import { translations } from '../lib/i18n';

export function Navigation() {
  const location = useLocation();
  const { hasConfigured, language } = useAppStore();
  const t = translations[language];

  const links = [
    { name: t.dashboard, path: '/', icon: Home },
    { name: t.words, path: '/words', icon: Layers },
    { name: t.story, path: '/stories', icon: BookOpenText },
    { name: t.news, path: '/news', icon: Newspaper },
    { name: t.writing, path: '/writing', icon: PenTool },
  ];

  if (!hasConfigured) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-r border-blue-100 dark:border-slate-800 flex-col p-6 z-10 relative">
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="font-bold text-2xl tracking-tight text-blue-900 dark:text-blue-100 italic">Mojo</span>
          </div>
          <Link to="/setup" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <Settings size={20} />
          </Link>
        </div>

        <nav className="flex-1 space-y-2">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            
            return (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                  isActive 
                    ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold" 
                    : "text-slate-500 dark:text-slate-400 hover:bg-blue-50/50 dark:hover:bg-slate-800/50"
                )}
              >
                <Icon size={20} className={cn(isActive ? "stroke-2" : "")} />
                {link.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { hasConfigured, language, setLanguage, isAssistantOpen, toggleAssistant } = useAppStore();
  const location = useLocation();
  const t = translations[language];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t.goodMorning;
    if (hour >= 12 && hour < 18) return t.goodAfternoon;
    if (hour >= 18 && hour < 24) return t.goodEvening;
    return t.lateNight;
  };

  const isHome = location.pathname === '/';
  const showHeader = hasConfigured;
  const hideMobileHeader = location.pathname === '/words';
  const locationState = location.state as { from?: string } | null;
  const searchParams = new URLSearchParams(location.search);
  const dictionaryReturnPath = location.pathname === '/dictionary'
    ? locationState?.from || searchParams.get('from')
    : null;
  const mobileBackPath = dictionaryReturnPath?.startsWith('/') ? dictionaryReturnPath : '/';

  return (
    <div className="flex w-full h-[100dvh] bg-gradient-to-br from-[#F0F7FF] via-[#FFFFFF] to-[#E6F0FF] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 font-sans text-slate-800 dark:text-slate-200 overflow-hidden relative">
      <Navigation />
      <main className="flex-1 flex flex-col h-[100dvh] overflow-x-hidden overflow-y-auto min-w-0 w-full p-4 md:p-8 gap-4 md:gap-6 relative z-0">
        {showHeader && (
          <header className={cn(
            "justify-between items-center mb-0 md:mb-2 bg-white/40 dark:bg-slate-900/40 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none p-3 md:p-0 rounded-2xl md:rounded-none",
            hideMobileHeader ? "hidden md:flex" : "flex"
          )}>
            <div className="flex items-center gap-2">
              {!isHome && (
                <Link 
                  to={mobileBackPath}
                  className="md:hidden p-2 -ml-2 mr-1 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft size={24} />
                </Link>
              )}
              {isHome ? (
                <>
                  <span className="text-xs md:text-sm text-slate-500 dark:text-slate-400">{getGreeting()},</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{t.learner}</span>
                </>
              ) : (
                <span className="font-bold text-xl md:text-2xl text-slate-800 dark:text-slate-200 tracking-tight capitalize">
                  {location.pathname === '/words' ? t.words : 
                   location.pathname === '/stories' ? t.story :
                   location.pathname === '/news' ? t.news : 
                   location.pathname === '/writing' ? t.writing : 
                   location.pathname === '/dictionary' ? t.dictionary : 
                   location.pathname === '/setup' ? t.setup : t.dashboard}
                </span>
              )}
            </div>
            <div className="flex gap-2 md:gap-3 items-center">
              <Link to="/dictionary" className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors" title={t.dictionary}>
                <BookA size={20} />
              </Link>
              <button onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors" title={t.toggleLanguage}>
                <Languages size={20} />
              </button>
              <button 
                onClick={toggleAssistant} 
                className={cn(
                  "p-2 rounded-xl transition-colors", 
                  isAssistantOpen ? "bg-blue-100/50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50"
                )} 
                title={t.aiAssistantTitle}
              >
                <MessageCircle size={20} />
              </button>
              <Link to="/setup" className="md:hidden p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors" title={t.setup}>
                <Settings size={20} />
              </Link>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold border-2 border-white dark:border-slate-800 shadow-sm text-sm md:text-base">
                AC
              </div>
            </div>
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
