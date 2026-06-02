import { Newspaper } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../lib/i18n';

type NewsApiSettingsSectionProps = {
  newsdataApiKey: string;
  tavilyApiKey: string;
  onNewsdataApiKeyChange: (value: string) => void;
  onTavilyApiKeyChange: (value: string) => void;
};

export function NewsApiSettingsSection({
  newsdataApiKey,
  tavilyApiKey,
  onNewsdataApiKeyChange,
  onTavilyApiKeyChange,
}: NewsApiSettingsSectionProps) {
  const { language } = useAppStore();
  const t = translations[language];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <Newspaper className="text-cyan-500 dark:text-cyan-400 transition-colors" size={24} />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">NewsData.io</h2>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {t.newsApiDesc}
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            NewsData.io API Key
          </label>
          <input
            type="password"
            value={newsdataApiKey}
            onChange={(event) => onNewsdataApiKeyChange(event.target.value)}
            placeholder="pub_xxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Tavily API Key
          </label>
          <input
            type="password"
            value={tavilyApiKey}
            onChange={(event) => onTavilyApiKeyChange(event.target.value)}
            placeholder="tvly-xxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
