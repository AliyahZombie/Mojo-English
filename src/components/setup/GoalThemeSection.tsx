import { Moon, Sun, Target } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../lib/i18n';

type GoalThemeSectionProps = {
  dailyGoalTitle: string;
  themeTitle: string;
  dailyGoal: number;
  theme: 'light' | 'dark';
  onDailyGoalChange: (goal: number) => void;
  onToggleTheme: () => void;
};

export function GoalThemeSection({
  dailyGoalTitle,
  themeTitle,
  dailyGoal,
  theme,
  onDailyGoalChange,
  onToggleTheme,
}: GoalThemeSectionProps) {
  const { language } = useAppStore();
  const t = translations[language];

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <Target className="text-orange-500 dark:text-orange-400 transition-colors" size={24} />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{dailyGoalTitle}</h2>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">{t.targetWordsPerDay}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={dailyGoal}
                onChange={(e) => onDailyGoalChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 px-3 py-2 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-orange-600 dark:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              />
              <span className="text-slate-500 dark:text-slate-400 font-medium">{t.words}</span>
            </div>
          </div>

          <input
            type="range"
            min="1"
            max="100"
            value={dailyGoal}
            onChange={(e) => onDailyGoalChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 dark:accent-orange-400"
          />

          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 font-medium px-1">
            <span>1</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <Sun className="text-amber-500 dark:hidden transition-colors" size={24} />
          <Moon className="hidden dark:block text-blue-400 transition-colors" size={24} />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{themeTitle}</h2>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">{t.theme}</span>
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-medium text-slate-700 dark:text-slate-300"
            >
              {theme === 'dark' ? (
                <>
                  <Moon size={18} className="text-blue-400" />
                  <span>{t.darkMode}</span>
                </>
              ) : (
                <>
                  <Sun size={18} className="text-amber-500" />
                  <span>{t.lightMode}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
