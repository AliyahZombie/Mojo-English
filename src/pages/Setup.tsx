import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Save, Loader2, FileJson, BarChart3, Download, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { translations } from '../lib/i18n';
import { Client } from '@upstash/qstash';
import { NotificationService } from '../services/notificationService';
import { ProviderSettingsSection } from '../components/setup/ProviderSettingsSection';
import { NotificationSettingsSection } from '../components/setup/NotificationSettingsSection';
import { ContentPreferencesSection } from '../components/setup/ContentPreferencesSection';
import { GoalThemeSection } from '../components/setup/GoalThemeSection';
import { NewsApiSettingsSection } from '../components/setup/NewsApiSettingsSection';
import { createConfigBackup, createZustandPersistValue, getConfigBackupFileName, restoreConfigBackup } from '../services/configBackup';
import { testProviderConnection } from '../services/llm';
import type { Provider } from '../store/useAppStore';
import type { ManagedQStashSchedule, NotificationConfigOverride, ReviewScheduleConfig } from '../services/notificationService';

const PRESET_PREFS = [
  { id: "business", name: "商业/财经" },
  { id: "crime", name: "犯罪" },
  { id: "domestic", name: "国内" },
  { id: "education", name: "教育" },
  { id: "entertainment", name: "娱乐" },
  { id: "environment", name: "环境" },
  { id: "food", name: "食品" },
  { id: "health", name: "健康" },
  { id: "lifestyle", name: "生活方式" },
  { id: "other", name: "其他" },
  { id: "politics", name: "政治" },
  { id: "science", name: "科学" },
  { id: "sports", name: "体育" },
  { id: "technology", name: "科技" },
  { id: "top", name: "头条" },
  { id: "tourism", name: "旅游" },
  { id: "world", name: "国际/世界" }
];

const CONFIG_IMPORT_SUCCESS_KEY = 'mojo-config-import-success';

export function Setup() {
  const navigate = useNavigate();
  const { 
    hasConfigured, setHasConfigured, activeProviderId,
    providers, replaceProviders, storyPrompt, setStoryPrompt,
    preferences, setPreferences, dailyGoal, setDailyGoal, 
    language, theme, toggleTheme, upstashQstashToken, webhookUrl, 
    webhookTemplate, setNotificationConfig, webhookHeaders,
    newsdataApiKey, setNewsdataApiKey, tavilyApiKey, setTavilyApiKey,
    analyticsConsent, setAnalyticsConsent
  } = useAppStore();
  
  const t = translations[language];
  const parseWebhookTemplate = (body: string): unknown => {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(t.templateJsonError);
    }
  };

  const [localProviders, setLocalProviders] = useState<Provider[]>(() => {
    // Migration for legacy object providers from localStorage
    if (Array.isArray(providers)) {
      return JSON.parse(JSON.stringify(providers));
    }
    if (typeof providers === 'object' && providers !== null) {
      return Object.entries(providers).map(([key, p]: [string, any]) => ({
        id: p.id || key,
        type: p.type || (key === 'openai' ? 'OPENAI' : key === 'anthropic' ? 'CLAUDE' : 'GEMINI'),
        name: p.name || key,
        baseUrl: p.baseUrl || '',
        apiKey: p.apiKey || '',
        models: p.models || [],
        activeModel: p.activeModel || '',
        taskModels: p.taskModels || {},
      }));
    }
    return [];
  });
  const [localActiveProviderId, setLocalActiveProviderId] = useState(activeProviderId);
  const [localStoryPrompt, setLocalStoryPrompt] = useState(storyPrompt);
  
  const [prefs, setPrefs] = useState<string[]>(preferences);
  const [localDailyGoal, setLocalDailyGoal] = useState<number>(dailyGoal || 5);
  const [customPref, setCustomPref] = useState('');
  const [isConfigBackupBusy, setIsConfigBackupBusy] = useState(false);
  const configImportInputRef = useRef<HTMLInputElement | null>(null);
  
  const [localQstashToken, setLocalQstashToken] = useState(upstashQstashToken);
  const [localNewsdataApiKey, setLocalNewsdataApiKey] = useState(newsdataApiKey);
  const [localTavilyApiKey, setLocalTavilyApiKey] = useState(tavilyApiKey);
  const [localAnalyticsConsent, setLocalAnalyticsConsent] = useState<boolean | null>(analyticsConsent);
  const [localWebhookUrl, setLocalWebhookUrl] = useState(webhookUrl);
  const [localWebhookHeaders, setLocalWebhookHeaders] = useState(webhookHeaders || '');
  const [localWebhookTemplate, setLocalWebhookTemplate] = useState(webhookTemplate);
  const [isTestSending, setIsTestSending] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  const [scheduleConfig, setScheduleConfig] = useState<ReviewScheduleConfig>({
    daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    time: '10:00',
  });
  const [scheduleIsLoading, setScheduleIsLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [isSchedulePaused, setIsSchedulePaused] = useState(false);
  const [qstashSchedules, setQstashSchedules] = useState<ManagedQStashSchedule[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem(CONFIG_IMPORT_SUCCESS_KEY) !== 'true') return;
    sessionStorage.removeItem(CONFIG_IMPORT_SUCCESS_KEY);
    window.setTimeout(() => {
      useAppStore.getState().showAlert(t.configImportSuccess);
    }, 0);
  }, [t.configImportSuccess]);

  useEffect(() => {
    if (upstashQstashToken && webhookUrl) {
      loadSchedule();
    }
  }, [upstashQstashToken, webhookUrl]);

  const getLocalNotificationConfig = (): NotificationConfigOverride => ({
    token: localQstashToken,
    webhookUrl: localWebhookUrl,
    webhookHeaders: localWebhookHeaders,
    webhookTemplate: localWebhookTemplate,
  });

  const deriveScheduleConfigFromCron = (cron: string): ReviewScheduleConfig | null => {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minutePart, hourPart, , , dayPart] = parts;
    const minute = Number(minutePart);
    const hour = Number(hourPart);
    if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
      return null;
    }

    let daysOfWeek: number[];
    if (dayPart === '*') {
      daysOfWeek = [1, 2, 3, 4, 5, 6, 0];
    } else {
      daysOfWeek = dayPart.split(',').map(value => Number(value));
      if (daysOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return null;
    }

    return {
      daysOfWeek,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  };

  const loadSchedule = async () => {
    setScheduleIsLoading(true);
    try {
      const config = getLocalNotificationConfig();
      const [sch, schedules] = await Promise.all([
        NotificationService.getDailySchedule(config),
        NotificationService.listSchedules(config),
      ]);
      if (sch) {
        setHasSchedule(true);
        const parsedConfig = deriveScheduleConfigFromCron(sch.cron);
        if (parsedConfig) setScheduleConfig(parsedConfig);
        setIsSchedulePaused(sch.isPaused);
      } else {
        setHasSchedule(false);
      }
      setQstashSchedules(schedules);
    } catch {
      setHasSchedule(false);
      setQstashSchedules([]);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!localQstashToken) return useAppStore.getState().showAlert(t.enterQstashTokenFirst);
    if (!localWebhookUrl) return useAppStore.getState().showAlert(t.enterWebhookUrlFirst);
    setScheduleIsLoading(true);
    try {
      await NotificationService.upsertDailySchedule(scheduleConfig, getLocalNotificationConfig());
      useAppStore.getState().showAlert(t.scheduleSaved);
      await loadSchedule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.getState().showAlert(`${t.failedPrefix}: ${message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleRefreshSchedules = async () => {
    if (!localQstashToken) return useAppStore.getState().showAlert(t.enterQstashTokenFirst);
    setScheduleIsLoading(true);
    try {
      await loadSchedule();
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    setScheduleIsLoading(true);
    try {
      await NotificationService.deleteSchedule(scheduleId, getLocalNotificationConfig());
      useAppStore.getState().showAlert(t.scheduleDeleted);
      await loadSchedule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.getState().showAlert(`${t.failedPrefix}: ${message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleToggleSchedule = async (scheduleId: string, pause: boolean) => {
    setScheduleIsLoading(true);
    try {
      await NotificationService.toggleSchedule(scheduleId, pause, getLocalNotificationConfig());
      await loadSchedule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.getState().showAlert(`${t.failedPrefix}: ${message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleTestSendDirect = async () => {
    if (!localWebhookUrl) {
      useAppStore.getState().showAlert(t.enterWebhookUrl);
      return;
    }
    
    setIsTestSending(true);
    try {
      const finalUrl = localWebhookUrl.replace(/\$url/g, window.location.origin);
      const bodyStr = localWebhookTemplate
        .replace(/\$title/g, t.directTestTitle)
        .replace(/\$content/g, t.directTestContent)
        .replace(/\$url/g, window.location.origin);

      const parsedBody: unknown = parseWebhookTemplate(bodyStr);

      // Parse headers
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (localWebhookHeaders) {
        const lines = localWebhookHeaders.split('\n');
        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const k = line.slice(0, colonIdx).trim();
            const v = line.slice(colonIdx + 1).trim();
            customHeaders[k] = v;
          }
        }
      }

      const res = await fetch(finalUrl, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify(parsedBody)
      });
      
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      useAppStore.getState().showAlert(t.directTestSuccess);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      useAppStore.getState().showAlert(`${t.directTestFailed}: ${message}`);
    } finally {
      setIsTestSending(false);
    }
  };

  const handleTestSendQStash = async () => {
    if (!localQstashToken) {
      useAppStore.getState().showAlert(t.enterQstashToken);
      return;
    }
    if (!localWebhookUrl) {
      useAppStore.getState().showAlert(t.enterWebhookUrl);
      return;
    }
    
    setIsTestSending(true);
    try {
      const finalUrl = localWebhookUrl.replace(/\$url/g, window.location.origin);
      const bodyStr = localWebhookTemplate
        .replace(/\$title/g, t.qstashTestTitle)
        .replace(/\$content/g, t.qstashTestContent)
        .replace(/\$url/g, window.location.origin);

      const parsedBody: unknown = parseWebhookTemplate(bodyStr);

      // Parse headers
      const customHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (localWebhookHeaders) {
        const lines = localWebhookHeaders.split('\n');
        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const k = line.slice(0, colonIdx).trim();
            const v = line.slice(colonIdx + 1).trim();
            customHeaders[k] = v;
          }
        }
      }

      console.log("[QStash Test] Initialize Client with Token");
      const client = new Client({ token: localQstashToken });

      console.log(`[QStash Test] target URL: ${finalUrl}`);
      console.log(`[QStash Test] headers:`, customHeaders);
      console.log(`[QStash Test] body:`, parsedBody);

      const result = await client.publishJSON({
        url: finalUrl,
        body: parsedBody,
        headers: customHeaders,
      });

      console.log("[QStash Test] Publish success:", result);
      useAppStore.getState().showAlert(`${t.qstashTestSuccess}\nMessage ID: ${result.messageId}`);
    } catch (err) {
      console.error("[QStash Test] Failed error:", err);
      const message = err instanceof Error ? err.message : String(err);
      useAppStore.getState().showAlert(`${t.qstashTestFailed}: ${message}`);
    } finally {
      setIsTestSending(false);
    }
  };

  const updateLocalProvider = <K extends keyof Provider>(index: number, field: K, value: Provider[K]) => {
    const nextProviders = [...localProviders];
    nextProviders[index] = { ...nextProviders[index], [field]: value };
    setLocalProviders(nextProviders);
  };

  const handleAddProvider = () => {
    const newProvider: Provider = {
      id: `provider-${Date.now()}`,
      type: 'OPENAI',
      name: t.newProvider,
      baseUrl: '',
      apiKey: '',
      models: [],
      activeModel: '',
      taskModels: {},
    };
    setLocalProviders([...localProviders, newProvider]);
  };

  const handleRemoveProvider = (providerId: string) => {
    const newProviders = localProviders.filter((provider) => provider.id !== providerId);
    setLocalProviders(newProviders);
    if (localActiveProviderId === providerId && newProviders.length > 0) {
      setLocalActiveProviderId(newProviders[0].id);
    }
  };

  const handleAddCustomPreference = () => {
    if (customPref && !prefs.includes(customPref)) {
      setPrefs([...prefs, customPref]);
      setCustomPref('');
    }
  };

  const fetchModels = async (provider: Provider, idx: number) => {
    let fetched = [...provider.models];
    try {
      if (provider.type === 'OPENAI') {
        const url = `${(provider.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/models`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${provider.apiKey}` }
        });
        const data = await res.json();
        if (data && data.data) {
          fetched = data.data.map((m: { id: string }) => m.id);
        }
      } else if (provider.type === 'GEMINI') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.models) {
          fetched = data.models.map((m: { name: string }) => m.name.replace('models/', ''));
        }
      } else if (provider.type === 'CLAUDE') {
        fetched = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
      useAppStore.getState().showAlert(t.fetchModelsFailed);
    }
    
    // Sort logic, prioritize common models, filter out non-chat models
    const newProviders = [...localProviders];
    newProviders[idx] = { ...provider, models: fetched, activeModel: fetched[0] || provider.activeModel };
    setLocalProviders(newProviders);
  };

  const getProviderMissingFields = (provider: Provider) => {
    const missingFields: string[] = [];
    if (!provider.apiKey.trim()) missingFields.push(t.providerApiKey);
    if (!provider.activeModel.trim()) missingFields.push(t.providerModel);
    return missingFields;
  };

  const isProviderConfigured = (provider: Provider | undefined) => {
    if (!provider) return false;
    return getProviderMissingFields(provider).length === 0;
  };

  const handleTestProvider = async (provider: Provider) => {
    const missingFields = getProviderMissingFields(provider);
    if (missingFields.length > 0) {
      useAppStore.getState().showAlert(`${t.providerMissingFields}: ${missingFields.join(', ')}`);
      return;
    }

    setTestingProviderId(provider.id);
    try {
      const response = await testProviderConnection(provider);
      useAppStore.getState().showAlert(`${t.providerTestSuccess}\n${t.providerTestResponse}: ${response}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.getState().showAlert(`${t.providerTestFailed}: ${message}`);
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleExportConfig = async () => {
    setIsConfigBackupBusy(true);
    try {
      const appStoreDraft = createZustandPersistValue(localStorage.getItem('mojo-app-store'), {
        activeProviderId: localActiveProviderId,
        providers: localProviders,
        storyPrompt: localStoryPrompt,
        preferences: prefs,
        dailyGoal: localDailyGoal,
        newsdataApiKey: localNewsdataApiKey.trim(),
        tavilyApiKey: localTavilyApiKey.trim(),
        upstashQstashToken: localQstashToken,
        webhookUrl: localWebhookUrl,
        webhookHeaders: localWebhookHeaders,
        webhookTemplate: localWebhookTemplate,
      });
      const backupBlob = await createConfigBackup({ 'mojo-app-store': appStoreDraft });
      const url = URL.createObjectURL(backupBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getConfigBackupFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      useAppStore.getState().showAlert(t.configExportSuccess);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.getState().showAlert(`${t.configExportFailed}: ${message}`);
    } finally {
      setIsConfigBackupBusy(false);
    }
  };

  const handleImportConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    useAppStore.getState().showAlert({
      title: t.configImportTitle,
      message: t.configImportMessage,
      isConfirm: true,
      confirmText: t.configImportConfirm,
      cancelText: t.cancel,
      onConfirm: async () => {
        setIsConfigBackupBusy(true);
        try {
          await restoreConfigBackup(file);
          sessionStorage.setItem(CONFIG_IMPORT_SUCCESS_KEY, 'true');
          window.location.reload();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          useAppStore.getState().showAlert(`${t.configImportFailed}: ${message}`);
        } finally {
          setIsConfigBackupBusy(false);
          if (configImportInputRef.current) configImportInputRef.current.value = '';
        }
      },
      onCancel: () => {
        if (configImportInputRef.current) configImportInputRef.current.value = '';
      },
    });
  };

  const persistSettings = () => {
    replaceProviders(localProviders, localActiveProviderId);
    setStoryPrompt(localStoryPrompt);
    
    setPreferences(prefs);
    setDailyGoal(localDailyGoal);
    setNewsdataApiKey(localNewsdataApiKey.trim());
    setTavilyApiKey(localTavilyApiKey.trim());
    if (localAnalyticsConsent !== null) {
      setAnalyticsConsent(localAnalyticsConsent);
    }
    setNotificationConfig(localQstashToken, localWebhookUrl, localWebhookHeaders, localWebhookTemplate);
    setHasConfigured(true);
    navigate('/');
  };

  const handleSave = () => {
    const activeProvider = localProviders.find((provider) => provider.id === localActiveProviderId);
    if (!isProviderConfigured(activeProvider)) {
      useAppStore.getState().showAlert({
        title: t.providerIncompleteWarningTitle,
        message: t.providerIncompleteWarningMessage,
        isConfirm: true,
        confirmText: t.continueWithoutProvider,
        cancelText: t.cancel,
        onConfirm: persistSettings,
      });
      return;
    }

    persistSettings();
  };

  const togglePref = (p: string) => {
    if (prefs.includes(p)) {
      setPrefs(prefs.filter(x => x !== p));
    } else {
      setPrefs([...prefs, p]);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto w-full pt-2 pb-32 md:pt-8 md:pb-36"
    >
      <div className="mb-8 md:mb-10 text-center">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-slate-800 dark:text-slate-200 transition-colors">{t.setupTitle}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base transition-colors">{t.setupIntro}</p>
      </div>

        <div className="space-y-6 md:space-y-8">
        <ProviderSettingsSection
          title={t.aiProviders || 'AI Providers'}
          providers={localProviders}
          activeProviderId={localActiveProviderId}
          onAddProvider={handleAddProvider}
          onSelectActiveProvider={setLocalActiveProviderId}
          onRemoveProvider={handleRemoveProvider}
          onProviderFieldChange={updateLocalProvider}
          onFetchModels={fetchModels}
          onTestProvider={handleTestProvider}
          testingProviderId={testingProviderId}
        />

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.storyPromptTitle}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{t.storyPromptDesc}</p>
          </div>
          <textarea
            value={localStoryPrompt}
            onChange={(event) => setLocalStoryPrompt(event.target.value)}
            rows={5}
            className="w-full resize-y bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-2xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200 text-sm leading-6"
            placeholder={t.storyPromptPlaceholder}
          />
        </div>

        <NotificationSettingsSection
          qstashToken={localQstashToken}
          webhookUrl={localWebhookUrl}
          webhookHeaders={localWebhookHeaders}
          webhookTemplate={localWebhookTemplate}
          isTestSending={isTestSending}
          scheduleConfig={scheduleConfig}
          scheduleIsLoading={scheduleIsLoading}
          hasSchedule={hasSchedule}
          isSchedulePaused={isSchedulePaused}
          primaryScheduleId={NotificationService.SCHEDULE_ID}
          schedules={qstashSchedules}
          onQstashTokenChange={setLocalQstashToken}
          onWebhookUrlChange={setLocalWebhookUrl}
          onWebhookHeadersChange={setLocalWebhookHeaders}
          onWebhookTemplateChange={setLocalWebhookTemplate}
          onTestSendDirect={handleTestSendDirect}
          onTestSendQStash={handleTestSendQStash}
          onScheduleConfigChange={setScheduleConfig}
          onCreateSchedule={handleCreateSchedule}
          onRefreshSchedules={handleRefreshSchedules}
          onToggleSchedule={handleToggleSchedule}
          onDeleteSchedule={handleDeleteSchedule}
        />

        <NewsApiSettingsSection
          newsdataApiKey={localNewsdataApiKey}
          tavilyApiKey={localTavilyApiKey}
          onNewsdataApiKeyChange={setLocalNewsdataApiKey}
          onTavilyApiKeyChange={setLocalTavilyApiKey}
        />

        {analyticsConsent !== null && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="text-blue-500 dark:text-blue-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.analyticsConsentTitle}</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            {t.analyticsConsentDesc}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setLocalAnalyticsConsent(true)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors",
                localAnalyticsConsent === true
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:bg-slate-800/60"
              )}
            >
              {t.analyticsConsentAccept}
            </button>
            <button
              type="button"
              onClick={() => setLocalAnalyticsConsent(false)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors",
                localAnalyticsConsent === false
                  ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:bg-slate-800/60"
              )}
            >
              {t.analyticsConsentDecline}
            </button>
          </div>
        </div>
        )}

        <ContentPreferencesSection
          title={t.preferencesTitle || 'Content Preferences'}
          presetPreferences={PRESET_PREFS}
          preferences={prefs}
          customPreference={customPref}
          onTogglePreference={togglePref}
          onCustomPreferenceChange={setCustomPref}
          onAddCustomPreference={handleAddCustomPreference}
        />

        <GoalThemeSection
          dailyGoalTitle={t.dailyGoal || 'Daily Goal'}
          themeTitle={t.themePreference || 'Theme Preferences'}
          dailyGoal={localDailyGoal}
          theme={theme}
          onDailyGoalChange={setLocalDailyGoal}
          onToggleTheme={toggleTheme}
        />

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <FileJson className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.configBackupTitle}</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {t.configBackupDesc}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleExportConfig}
              disabled={isConfigBackupBusy}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-800/50 transition-colors disabled:opacity-50"
            >
              {isConfigBackupBusy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {t.exportConfig}
            </button>

            <label className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold text-sm hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors",
              isConfigBackupBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            )}>
              {isConfigBackupBusy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {t.importConfig}
              <input
                ref={configImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                disabled={isConfigBackupBusy}
                onChange={handleImportConfig}
              />
            </label>
          </div>
        </div>

      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/70 bg-white/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/90 md:py-4 md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <button 
            onClick={handleSave}
            className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-xl py-4 font-bold text-lg transition-all shadow-lg shadow-blue-500/30 dark:shadow-none flex items-center justify-center gap-2"
          >
            <Save size={20} />
            {hasConfigured ? t.saveSettings : t.letsGo}
          </button>
        </div>
      </div>

    </motion.div>
  );
}
