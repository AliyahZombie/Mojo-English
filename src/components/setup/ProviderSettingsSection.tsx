import { Loader2, PlugZap, Sparkles, Trash2 } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { LLM_TASK_LABELS, type LlmTask, type Provider } from '../../store/useAppStore';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../lib/i18n';

type ProviderSettingsSectionProps = {
  title: string;
  providers: Provider[];
  activeProviderId: string;
  onAddProvider: () => void;
  onSelectActiveProvider: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onProviderFieldChange: <K extends keyof Provider>(index: number, field: K, value: Provider[K]) => void;
  onFetchModels: (provider: Provider, index: number) => void;
  onTestProvider: (provider: Provider) => void;
  testingProviderId: string | null;
};

const providerTypeOptions = [
  { value: 'OPENAI', label: 'OpenAI Compatible' },
  { value: 'GEMINI', label: 'Google Gemini' },
  { value: 'CLAUDE', label: 'Anthropic Claude' }
] as const;

const llmTasks = Object.keys(LLM_TASK_LABELS) as LlmTask[];

const taskLabelKeys: Record<LlmTask, keyof typeof translations.en> = {
  'assistant-chat': 'taskAssistantChat',
  'article-parsing': 'taskArticleParsing',
  'dictionary-lookup': 'taskDictionaryLookup',
  'writing-evaluation': 'taskWritingEvaluation',
  'news-optimization': 'taskNewsOptimization',
  'quiz-evaluation': 'taskQuizEvaluation',
  'story-generation': 'taskStoryGeneration'
};

export function ProviderSettingsSection({
  title,
  providers,
  activeProviderId,
  onAddProvider,
  onSelectActiveProvider,
  onRemoveProvider,
  onProviderFieldChange,
  onFetchModels,
  onTestProvider,
  testingProviderId,
}: ProviderSettingsSectionProps) {
  const { language } = useAppStore();
  const t = translations[language];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="text-blue-500 dark:text-blue-400 transition-colors" size={24} />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{title}</h2>
        </div>
        <button
          onClick={onAddProvider}
          className="px-3 py-1.5 text-sm font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
        >
          {t.addProvider}
        </button>
      </div>

      <div className="space-y-6">
        {providers.map((provider, idx) => (
          <div key={provider.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="activeProviderId"
                  checked={activeProviderId === provider.id}
                  onChange={() => onSelectActiveProvider(provider.id)}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t.setAsActive}</span>
              </div>
              {providers.length > 1 && (
                <button
                  onClick={() => onRemoveProvider(provider.id)}
                  className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.providerType}</label>
                <CustomSelect
                  options={[...providerTypeOptions]}
                  value={provider.type}
                  onChange={(value) => onProviderFieldChange(idx, 'type', value as Provider['type'])}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.providerDisplayName}</label>
                <input
                  type="text"
                  value={provider.name}
                  onChange={(e) => onProviderFieldChange(idx, 'name', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                  placeholder={t.providerNamePlaceholder}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.providerBaseUrl}</label>
                <input
                  type="text"
                  value={provider.baseUrl}
                  onChange={(e) => onProviderFieldChange(idx, 'baseUrl', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                  placeholder="e.g. https://api.openai.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.providerApiKey}</label>
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => onProviderFieldChange(idx, 'apiKey', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                  placeholder="sk-..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.providerModel}</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {provider.models.length > 0 ? (
                    <CustomSelect
                      className="flex-1"
                      options={provider.models.map((model) => ({ value: model, label: model }))}
                      value={provider.activeModel}
                      onChange={(value) => onProviderFieldChange(idx, 'activeModel', value)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={provider.activeModel}
                      onChange={(e) => onProviderFieldChange(idx, 'activeModel', e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                      placeholder={t.providerModelPlaceholder}
                    />
                  )}

                  <button
                    onClick={() => onFetchModels(provider, idx)}
                    className="min-h-[48px] bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 px-4 rounded-xl font-medium hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
                  >
                    {t.fetchModels}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTestProvider(provider)}
                    disabled={testingProviderId === provider.id}
                    className="min-h-[48px] inline-flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800 px-4 rounded-xl font-medium hover:bg-emerald-100 dark:hover:bg-emerald-800/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {testingProviderId === provider.id ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
                    {testingProviderId === provider.id ? t.testingProvider : t.testProviderConnection}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.taskSpecificModels}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.taskSpecificModelsDesc}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {llmTasks.map((task) => (
                    <label key={task} className="block">
                      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t[taskLabelKeys[task]]}</span>
                      <input
                        type="text"
                        value={provider.taskModels?.[task] || ''}
                        onChange={(event) => onProviderFieldChange(idx, 'taskModels', {
                          ...(provider.taskModels || {}),
                          [task]: event.target.value,
                        })}
                        className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200 text-sm"
                        placeholder={provider.activeModel || t.defaultModel}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
