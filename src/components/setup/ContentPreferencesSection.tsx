import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../lib/i18n';

type PreferenceOption = {
  id: string;
  name: string;
};

type ContentPreferencesSectionProps = {
  title: string;
  presetPreferences: PreferenceOption[];
  preferences: string[];
  customPreference: string;
  onTogglePreference: (preference: string) => void;
  onCustomPreferenceChange: (value: string) => void;
  onAddCustomPreference: () => void;
};

export function ContentPreferencesSection({
  title,
  presetPreferences,
  preferences,
  customPreference,
  onTogglePreference,
  onCustomPreferenceChange,
  onAddCustomPreference,
}: ContentPreferencesSectionProps) {
  const { language } = useAppStore();
  const t = translations[language];
  const customSelectedPreferences = preferences.filter(
    (preference) => !presetPreferences.find((preset) => preset.id === preference)
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{title}</h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {presetPreferences.map((preference) => {
          const active = preferences.includes(preference.id);
          return (
            <button
              key={preference.id}
              onClick={() => onTogglePreference(preference.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border',
                active
                  ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-500 dark:border-blue-400 shadow-md shadow-blue-500/20 dark:shadow-none'
                  : 'bg-transparent text-slate-600 dark:text-slate-400 border-blue-100 dark:border-slate-700 hover:border-blue-400 dark:hover:border-slate-500'
              )}
            >
              {preference.name}
            </button>
          );
        })}
        {customSelectedPreferences.map((preference) => (
          <button
            key={preference}
            onClick={() => onTogglePreference(preference)}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border bg-blue-600 dark:bg-blue-500 text-white border-blue-500 dark:border-blue-400 shadow-md shadow-blue-500/20 dark:shadow-none"
          >
            {preference}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={customPreference}
          onChange={(e) => onCustomPreferenceChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customPreference) {
              onAddCustomPreference();
            }
          }}
          className="flex-1 bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-sm text-slate-800 dark:text-slate-200"
          placeholder={t.addCustomInterestPlaceholder}
        />
        <button
          onClick={onAddCustomPreference}
          className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 px-6 rounded-xl font-medium hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
        >
          {t.add}
        </button>
      </div>
    </div>
  );
}
