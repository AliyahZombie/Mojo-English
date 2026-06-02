import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Save, BookA, Upload, Trash2, Loader2, Database, List, X, Download, FileJson, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { translations } from '../lib/i18n';
import { uploadAndParseApkg } from '../services/deckApi';
import { isDictionaryLoaded, getDictionaryWordCount, getWordsByTag } from '../services/dictionaryDb';
import { Client } from '@upstash/qstash';
import { NotificationService } from '../services/notificationService';
import { ProviderSettingsSection } from '../components/setup/ProviderSettingsSection';
import { NotificationSettingsSection } from '../components/setup/NotificationSettingsSection';
import { ContentPreferencesSection } from '../components/setup/ContentPreferencesSection';
import { GoalThemeSection } from '../components/setup/GoalThemeSection';
import { NewsApiSettingsSection } from '../components/setup/NewsApiSettingsSection';
import { createConfigBackup, createZustandPersistValue, getConfigBackupFileName, restoreConfigBackup } from '../services/configBackup';
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

const ECDICT_TAGS = [
  { id: 'zk', name: '中考 / Zhongkao' },
  { id: 'gk', name: '高考 / Gaokao' },
  { id: 'ky', name: '考研 / Kaoyan' },
  { id: 'cet4', name: '四级 / CET-4' },
  { id: 'cet6', name: '六级 / CET-6' },
  { id: 'gre', name: 'GRE' },
  { id: 'toefl', name: 'TOEFL' },
  { id: 'ielts', name: 'IELTS' }
];

const CONFIG_IMPORT_SUCCESS_KEY = 'mojo-config-import-success';
const ECDICT_DOWNLOAD_URL = 'https://ghproxy.aliyahzombie.top/https://raw.githubusercontent.com/skywind3000/ECDICT/refs/heads/master/ecdict.csv';

type DictionaryProgress = {
  status: string;
  loaded?: number;
  total?: number;
  rowsProcessed?: number;
};

export function Setup() {
  const navigate = useNavigate();
  const { 
    hasConfigured, setHasConfigured, activeProviderId,
    providers, replaceProviders,
    preferences, setPreferences, dailyGoal, setDailyGoal, 
    language, theme, toggleTheme, decks, activeDeckId, addDeck, 
    setActiveDeckId, deleteDeck, upstashQstashToken, webhookUrl, 
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
  
  const [prefs, setPrefs] = useState<string[]>(preferences);
  const [localDailyGoal, setLocalDailyGoal] = useState<number>(dailyGoal || 5);
  const [customPref, setCustomPref] = useState('');
  const [isUploading, setIsUploading] = useState(false);
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

  const [dictStatus, setDictStatus] = useState<{ isLoaded: boolean; count: number }>({ isLoaded: false, count: 0 });
  const [dictProgress, setDictProgress] = useState<DictionaryProgress | null>(null);
  const [isCreatingFromTag, setIsCreatingFromTag] = useState(false);

  const [customDeckTag, setCustomDeckTag] = useState('');
  
  const [viewingDeckId, setViewingDeckId] = useState<string | null>(null);
  const viewingDeck = decks.find(d => d.id === viewingDeckId);

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

  const handleCreateDeckFromTag = async (tag: string, name: string) => {
    setIsCreatingFromTag(true);
    try {
      const words = await getWordsByTag(tag);
      if (words.length === 0) {
        useAppStore.getState().showAlert(t.noWordsForTag);
        return;
      }
      const newDeck = {
        id: `deck-${Date.now()}`,
        name: `${name} (${tag})`,
        words: words,
        createdAt: Date.now(),
      };
      addDeck(newDeck);
      if (!activeDeckId) setActiveDeckId(newDeck.id);
      useAppStore.getState().showAlert(`${t.deckCreatedWith} ${words.length} ${t.words}!`);
    } catch (e) {
      console.error(e);
      useAppStore.getState().showAlert(t.deckCreateFailed);
    } finally {
      setIsCreatingFromTag(false);
    }
  };

  useEffect(() => {
    isDictionaryLoaded().then(async (loaded) => {
      if (loaded) {
        const count = await getDictionaryWordCount();
        setDictStatus({ isLoaded: true, count });
      }
    });
  }, []);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const parsedDeck = await uploadAndParseApkg(file);
      addDeck(parsedDeck);
      if (!activeDeckId) setActiveDeckId(parsedDeck.id);
    } catch (err) {
      console.error("Failed to upload apkg", err);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const refreshDictionaryStatus = async () => {
    const { getDictionaryWordCount } = await import('../services/dictionaryDb');
    const count = await getDictionaryWordCount();
    setDictStatus({ isLoaded: count > 0, count });
  };

  const importDictionaryFile = async (file: File) => {
    setDictProgress({ status: 'starting' });
    const { importDictionaryFromBlob } = await import('../services/dictionaryDb');
    await importDictionaryFromBlob(file, setDictProgress);
    await refreshDictionaryStatus();
  };

  const downloadDictionaryFile = async (): Promise<File> => {
    setDictProgress({ status: 'fetching', loaded: 0 });
    const response = await fetch(ECDICT_DOWNLOAD_URL);
    if (!response.ok) {
      throw new Error(`Dictionary download failed with HTTP ${response.status}`);
    }

    const totalHeader = response.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : undefined;
    const reader = response.body?.getReader();
    if (!reader) {
      const blob = await response.blob();
      setDictProgress({ status: 'downloaded', loaded: blob.size, total: blob.size });
      return new File([blob], 'ecdict.csv', { type: 'text/csv' });
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    setDictProgress({ status: 'downloading', loaded, total });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        setDictProgress({ status: 'downloading', loaded, total });
      }
    }

    const blob = new Blob(chunks, { type: 'text/csv' });
    setDictProgress({ status: 'downloaded', loaded: blob.size, total: total || blob.size });
    return new File([blob], 'ecdict.csv', { type: 'text/csv' });
  };

  const handleDownloadDictionary = async () => {
    try {
      const file = await downloadDictionaryFile();
      await importDictionaryFile(file);
      useAppStore.getState().showAlert(t.dictionaryDownloadSuccess);
    } catch (err) {
      console.error('Failed to download dictionary', err);
      setDictProgress({ status: 'error' });
      const message = err instanceof Error ? err.message : String(err);
      useAppStore.getState().showAlert(`${t.dictionaryDownloadFailed}: ${message}`);
    } finally {
      setDictProgress(null);
    }
  };

  const handleUploadDictionary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importDictionaryFile(file);
      useAppStore.getState().showAlert(t.dictionaryImportSuccess);
    } catch (err) {
      console.error('Failed to import dictionary', err);
      setDictProgress({ status: 'error' });
      const message = err instanceof Error ? err.message : String(err);
      useAppStore.getState().showAlert(`${t.dictionaryImportFailed}: ${message}`);
    } finally {
      setDictProgress(null);
      e.target.value = '';
    }
  };

  const getDictionaryProgressPercent = () => {
    if (!dictProgress?.loaded || !dictProgress.total) return null;
    return Math.min(100, Math.round((dictProgress.loaded / dictProgress.total) * 100));
  };

  const getDictionaryProgressLabel = () => {
    if (!dictProgress) return '';
    const progressPercent = getDictionaryProgressPercent();
    const downloadedMb = dictProgress.loaded ? (dictProgress.loaded / 1024 / 1024).toFixed(1) : '0.0';
    const totalMb = dictProgress.total ? (dictProgress.total / 1024 / 1024).toFixed(1) : null;

    if (dictProgress.status === 'fetching') return t.dictProgressFetching;
    if (dictProgress.status === 'downloading') {
      return totalMb && progressPercent !== null
        ? `${t.dictProgressDownloading}: ${progressPercent}% (${downloadedMb} / ${totalMb} MB)`
        : `${t.dictProgressDownloading}: ${downloadedMb} MB`;
    }
    if (dictProgress.status === 'downloaded') return t.dictProgressDownloaded;
    if (dictProgress.status === 'reading') return t.dictProgressReading;
    if (dictProgress.status === 'parsing') return `${t.dictProgressParsing}: ${dictProgress.rowsProcessed?.toLocaleString() || 0} ${t.words}...`;
    if (dictProgress.status === 'complete') return t.dictProgressComplete;
    if (dictProgress.status === 'error') return t.dictProgressError;
    return t.dictProgressWaiting;
  };

  const handleExportConfig = async () => {
    setIsConfigBackupBusy(true);
    try {
      const appStoreDraft = createZustandPersistValue(localStorage.getItem('mojo-app-store'), {
        activeProviderId: localActiveProviderId,
        providers: localProviders,
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

  const handleSave = () => {
    replaceProviders(localProviders, localActiveProviderId);
    
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
      className="max-w-2xl mx-auto w-full py-2 md:py-8"
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
        />

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

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <BookA className="text-purple-500 dark:text-purple-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.decksManagement}</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t.decksManagementDesc}</p>
          
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label htmlFor="dropzone-file" className={cn(
                "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer bg-slate-50 dark:bg-slate-900/40 transition-colors group",
                isUploading ? "border-blue-400" : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              )}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isUploading ? (
                    <Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
                  ) : (
                    <Upload size={32} className="text-slate-400 group-hover:text-blue-500 mb-3 transition-colors" />
                  )}
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {isUploading ? t.uploading : t.uploadApkg}
                  </p>
                </div>
                <input id="dropzone-file" type="file" className="hidden" accept=".apkg" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            </div>
            
            {decks.length > 0 ? (
              <div className="mt-6 flex flex-col gap-3 w-full min-w-0">
                {decks.map((deck) => (
                  <div key={deck.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 w-full min-w-0">
                    <div className="flex flex-col flex-1 min-w-0 mr-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate block flex-1 min-w-0" title={deck.name}>
                          {deck.name}
                        </span>
                        {activeDeckId === deck.id && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                            {t.activeDeck}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{deck.words.length} {t.wordsCount}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => setViewingDeckId(deck.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        title={t.viewDeckWords}
                      >
                        <List size={18} />
                      </button>
                      {activeDeckId !== deck.id && (
                        <button 
                          onClick={() => setActiveDeckId(deck.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          {t.select}
                        </button>
                      )}
                      <button 
                        onClick={() => deleteDeck(deck.id)}
                        className="p-2 rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        title={t.deleteDeck}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400 italic">
                {t.noDecks}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Database className="text-indigo-500 dark:text-indigo-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.offlineDictionary}</h2>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.offlineDictionaryDesc}
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-4">
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {dictStatus.isLoaded ? t.dictionaryAvailable : t.dictionaryMissing}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-2">
                  {dictStatus.isLoaded ? `${dictStatus.count.toLocaleString()} ${t.wordsLoaded}` : t.notLoaded}
                </p>
                {!dictStatus.isLoaded && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.dictionaryDownloadHintBefore} <a href={ECDICT_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t.dictionaryMirrorLink}</a> {t.dictionaryDownloadHintAfter}
                  </p>
                )}
              </div>
              
              {!dictProgress ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadDictionary}
                    className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Download size={16} />
                    {t.downloadOnline}
                  </button>

                  <label className="cursor-pointer px-4 py-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl font-medium text-sm hover:bg-indigo-100 dark:hover:bg-indigo-800/60 transition-colors">
                    {t.uploadCsv}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleUploadDictionary}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-right min-w-[180px]">
                  <span className="text-xs font-semibold text-indigo-500 block mb-1">
                    {getDictionaryProgressLabel()}
                  </span>
                  {dictProgress.status === 'downloading' && getDictionaryProgressPercent() !== null && (
                    <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${getDictionaryProgressPercent() || 0}%` }}
                      />
                    </div>
                  )}
                  <Loader2 size={16} className="text-indigo-500 animate-spin inline-block" />
                </div>
              )}
            </div>

            {dictStatus.isLoaded && (
              <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.createDeckFromTag}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {t.tagDeckDesc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ECDICT_TAGS.map(tagObj => (
                    <button
                      key={tagObj.id}
                      disabled={isCreatingFromTag}
                      onClick={() => handleCreateDeckFromTag(tagObj.id, tagObj.name)}
                      className="px-3 py-1.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isCreatingFromTag && <Loader2 size={14} className="animate-spin" />}
                      {tagObj.name}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t.customTagPlaceholder}
                    value={customDeckTag}
                    onChange={(e) => setCustomDeckTag(e.target.value)}
                    disabled={isCreatingFromTag}
                    className="flex-1 max-w-[200px] bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-sm text-slate-800 dark:text-slate-200"
                  />
                  <button
                    disabled={isCreatingFromTag || !customDeckTag.trim()}
                    onClick={() => handleCreateDeckFromTag(customDeckTag.trim(), customDeckTag.trim())}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl font-medium text-sm hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors disabled:opacity-50"
                  >
                    {t.create}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={handleSave}
          className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-xl py-4 font-bold text-lg transition-all shadow-lg shadow-blue-500/30 dark:shadow-none flex items-center justify-center gap-2"
        >
          <Save size={20} />
          {hasConfigured ? t.saveSettings : t.letsGo}
        </button>
      </div>

      <AnimatePresence>
        {viewingDeck && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-[60] backdrop-blur-sm"
              onClick={() => setViewingDeckId(null)}
            />
            <motion.div
              initial={{ y: '100%', opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '100%', opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 right-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl w-full h-[85vh] md:h-[70vh] z-[70] rounded-t-3xl md:rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 rounded-t-3xl text-slate-800 dark:text-slate-200">
                <h2 className="font-bold text-xl md:text-2xl flex items-center gap-2">
                  <List className="text-blue-500" /> {viewingDeck.name}
                </h2>
                <button onClick={() => setViewingDeckId(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
                {viewingDeck.words.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 dark:text-slate-400 font-medium">
                    {t.deckEmpty}
                  </div>
                ) : (
                  viewingDeck.words.map(w => (
                     <div key={w} className="p-3 md:p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 transition-colors hover:border-slate-200 dark:hover:border-slate-700">
                        <div className="font-bold text-lg text-slate-800 dark:text-slate-200">{w}</div>
                     </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
