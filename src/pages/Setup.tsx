import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Settings, Save, Sparkles, CheckCircle2, Target, BookA, Upload, Trash2, Loader2, LogOut, Sun, Moon, Database, List, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { translations } from '../lib/i18n';
import { uploadAndParseApkg } from '../services/deckApi';
import { isDictionaryLoaded, getDictionaryWordCount, getWordsByTag } from '../services/dictionaryDb';
import { Client } from '@upstash/qstash';
import { CustomSelect } from '../components/ui/CustomSelect';
import { NotificationService } from '../services/notificationService';

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

export function Setup() {
  const navigate = useNavigate();
  const { 
    hasConfigured, setHasConfigured, activeProviderId, setActiveProviderId, 
    providers, addProvider, updateProvider, deleteProvider, 
    preferences, setPreferences, dailyGoal, setDailyGoal, 
    language, theme, toggleTheme, decks, activeDeckId, addDeck, 
    setActiveDeckId, deleteDeck, upstashQstashToken, webhookUrl, 
    webhookTemplate, setNotificationConfig, webhookHeaders
  } = useAppStore();
  
  const t = translations[language];
  const [localProviders, setLocalProviders] = useState(() => {
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
        activeModel: p.activeModel || ''
      }));
    }
    return [];
  });
  const [localActiveProviderId, setLocalActiveProviderId] = useState(activeProviderId);
  
  const [prefs, setPrefs] = useState<string[]>(preferences);
  const [localDailyGoal, setLocalDailyGoal] = useState<number>(dailyGoal || 5);
  const [customPref, setCustomPref] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const [localQstashToken, setLocalQstashToken] = useState(upstashQstashToken);
  const [localWebhookUrl, setLocalWebhookUrl] = useState(webhookUrl);
  const [localWebhookHeaders, setLocalWebhookHeaders] = useState(webhookHeaders || '');
  const [localWebhookTemplate, setLocalWebhookTemplate] = useState(webhookTemplate);
  const [isTestSending, setIsTestSending] = useState(false);

  const [scheduleCron, setScheduleCron] = useState('0 10 * * *');
  const [scheduleIsLoading, setScheduleIsLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [isSchedulePaused, setIsSchedulePaused] = useState(false);

  useEffect(() => {
    if (upstashQstashToken && webhookUrl) {
      loadSchedule();
    }
  }, [upstashQstashToken, webhookUrl]);

  const loadSchedule = async () => {
    setScheduleIsLoading(true);
    try {
      const sch = await NotificationService.getDailySchedule();
      if (sch) {
        setHasSchedule(true);
        setScheduleCron(sch.cron);
        setIsSchedulePaused(sch.isPaused);
      } else {
        setHasSchedule(false);
      }
    } catch {
      setHasSchedule(false);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!localQstashToken) return useAppStore.getState().showAlert('Please save QStash Token first');
    setScheduleIsLoading(true);
    try {
      await NotificationService.upsertDailySchedule(scheduleCron);
      useAppStore.getState().showAlert('Schedule created/updated successfully!');
      await loadSchedule();
    } catch (e: any) {
      useAppStore.getState().showAlert(`Failed: ${e.message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleDeleteSchedule = async () => {
    setScheduleIsLoading(true);
    try {
      await NotificationService.deleteDailySchedule();
      useAppStore.getState().showAlert('Schedule deleted!');
      await loadSchedule();
    } catch (e: any) {
      useAppStore.getState().showAlert(`Failed: ${e.message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleToggleSchedule = async () => {
    setScheduleIsLoading(true);
    try {
      await NotificationService.toggleDailySchedule(!isSchedulePaused);
      await loadSchedule();
    } catch (e: any) {
      useAppStore.getState().showAlert(`Failed: ${e.message}`);
    } finally {
      setScheduleIsLoading(false);
    }
  };

  const handleTestSendDirect = async () => {
    if (!localWebhookUrl) {
      useAppStore.getState().showAlert('Please enter a Webhook URL');
      return;
    }
    
    setIsTestSending(true);
    try {
      let finalUrl = localWebhookUrl.replace(/\$url/g, window.location.origin);
      const bodyStr = localWebhookTemplate
        .replace(/\$title/g, 'Direct Test Notification')
        .replace(/\$content/g, 'This is a test message from Mojo without QStash')
        .replace(/\$url/g, window.location.origin);
        
      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyStr);
      } catch (err) {
        throw new Error('Template is not a valid JSON string');
      }

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
      useAppStore.getState().showAlert('Direct test sent successfully! Check your destination.');
    } catch (err: any) {
      console.error(err);
      useAppStore.getState().showAlert(`Direct test send failed: ${err.message}`);
    } finally {
      setIsTestSending(false);
    }
  };

  const handleTestSendQStash = async () => {
    if (!localQstashToken) {
      useAppStore.getState().showAlert('Please enter a QStash Token');
      return;
    }
    if (!localWebhookUrl) {
      useAppStore.getState().showAlert('Please enter a Webhook URL');
      return;
    }
    
    setIsTestSending(true);
    try {
      let finalUrl = localWebhookUrl.replace(/\$url/g, window.location.origin);
      const bodyStr = localWebhookTemplate
        .replace(/\$title/g, 'QStash Test Notification')
        .replace(/\$content/g, 'This is a test message from Mojo via Upstash')
        .replace(/\$url/g, window.location.origin);
        
      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyStr);
      } catch (err) {
        throw new Error('Template is not a valid JSON string');
      }

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
      useAppStore.getState().showAlert(`QStash test sent successfully!\nMessage ID: ${result.messageId}`);
    } catch (err: any) {
      console.error("[QStash Test] Failed error:", err);
      useAppStore.getState().showAlert(`QStash test send failed: ${err.message || String(err)}`);
    } finally {
      setIsTestSending(false);
    }
  };

  const [dictStatus, setDictStatus] = useState<{ isLoaded: boolean; count: number }>({ isLoaded: false, count: 0 });
  const [dictProgress, setDictProgress] = useState<{ status: string; loaded?: number; total?: number; rowsProcessed?: number } | null>(null);
  const [isCreatingFromTag, setIsCreatingFromTag] = useState(false);

  const [customDeckTag, setCustomDeckTag] = useState('');
  
  const [viewingDeckId, setViewingDeckId] = useState<string | null>(null);
  const viewingDeck = decks.find(d => d.id === viewingDeckId);

  const handleCreateDeckFromTag = async (tag: string, name: string) => {
    setIsCreatingFromTag(true);
    try {
      const words = await getWordsByTag(tag);
      if (words.length === 0) {
        useAppStore.getState().showAlert('No words found for this tag.');
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
      useAppStore.getState().showAlert(`Created deck successfully with ${words.length} words!`);
    } catch (e) {
      console.error(e);
      useAppStore.getState().showAlert('Failed to create deck from tag.');
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

  const fetchModels = async (provider: any, idx: number) => {
    let fetched = [...provider.models];
    try {
      if (provider.type === 'OPENAI') {
        const url = `${(provider.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/models`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${provider.apiKey}` }
        });
        const data = await res.json();
        if (data && data.data) {
          fetched = data.data.map((m: any) => m.id);
        }
      } else if (provider.type === 'GEMINI') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.models) {
          fetched = data.models.map((m: any) => m.name.replace('models/', ''));
        }
      } else if (provider.type === 'CLAUDE') {
        fetched = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
      useAppStore.getState().showAlert('Failed to fetch models. Check console for details.');
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

  const handleSave = () => {
    // Diff to delete removed ones? No, we can just replace everything in store
    // Since useAppStore doesn't have setProviders, we should do it or add it
    // Wait, the store doesn't have a setProviders! Let's update useAppStore later to accept an array, or we can just iterate.
    // Actually, localProviders IS the full array. But the store only has updateProvider / addProvider. Let's add a setProviders to store.
    
    // For now we assume we add a setProviders inside useAppStore
    useAppStore.setState({ providers: localProviders, activeProviderId: localActiveProviderId });
    
    setPreferences(prefs);
    setDailyGoal(localDailyGoal);
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
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-slate-800 dark:text-slate-200 transition-colors">{t.setupTitle || 'App Configuration'}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base transition-colors">Let's configure your English learning experience.</p>
      </div>

      <div className="space-y-6 md:space-y-8">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="text-blue-500 dark:text-blue-400 transition-colors" size={24} />
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.aiProviders || 'AI Providers'}</h2>
            </div>
            <button 
              onClick={() => {
                const newProvider = { id: `provider-${Date.now()}`, type: 'OPENAI', name: 'New Provider', baseUrl: '', apiKey: '', models: [], activeModel: '' };
                setLocalProviders([...localProviders, newProvider]);
              }}
              className="px-3 py-1.5 text-sm font-medium bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
            >
              + Add Provider
            </button>
          </div>
          
          <div className="space-y-6">
            {localProviders.map((provider: any, idx: number) => (
              <div key={provider.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="activeProviderId" 
                      checked={localActiveProviderId === provider.id}
                      onChange={() => setLocalActiveProviderId(provider.id)}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Set as Active</span>
                  </div>
                  {localProviders.length > 1 && (
                    <button 
                      onClick={() => {
                        const newProviders = localProviders.filter((p: any) => p.id !== provider.id);
                        setLocalProviders(newProviders);
                        if (localActiveProviderId === provider.id) setLocalActiveProviderId(newProviders[0].id);
                      }}
                      className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Type</label>
                    <CustomSelect 
                      options={[
                        { value: 'OPENAI', label: 'OpenAI Compatible' },
                        { value: 'GEMINI', label: 'Google Gemini' },
                        { value: 'CLAUDE', label: 'Anthropic Claude' }
                      ]}
                      value={provider.type}
                      onChange={(value) => {
                        const newP = [...localProviders];
                        newP[idx].type = value;
                        setLocalProviders(newP);
                      }} 
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Display Name</label>
                    <input 
                      type="text" 
                      value={provider.name}
                      onChange={(e) => {
                        const newP = [...localProviders];
                        newP[idx].name = e.target.value;
                        setLocalProviders(newP);
                      }}
                      className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                      placeholder="e.g. DeepSeek"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Base URL</label>
                    <input 
                      type="text" 
                      value={provider.baseUrl}
                      onChange={(e) => {
                        const newP = [...localProviders];
                        newP[idx].baseUrl = e.target.value;
                        setLocalProviders(newP);
                      }}
                      className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                      placeholder="e.g. https://api.openai.com/v1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">API Key</label>
                    <input 
                      type="password"
                      value={provider.apiKey}
                      onChange={(e) => {
                        const newP = [...localProviders];
                        newP[idx].apiKey = e.target.value;
                        setLocalProviders(newP);
                      }}
                      className="w-full bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                      placeholder="sk-..."
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Model</label>
                    <div className="flex gap-2">
                      {provider.models.length > 0 ? (
                        <CustomSelect 
                          className="flex-1"
                          options={provider.models.map((m: string) => ({ value: m, label: m }))}
                          value={provider.activeModel}
                          onChange={(value) => {
                            const newP = [...localProviders];
                            newP[idx].activeModel = value;
                            setLocalProviders(newP);
                          }}
                        />
                      ) : (
                        <input 
                          type="text"
                          value={provider.activeModel}
                          onChange={(e) => {
                            const newP = [...localProviders];
                            newP[idx].activeModel = e.target.value;
                            setLocalProviders(newP);
                          }}
                          className="flex-1 bg-white dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                          placeholder="Wait for fetch or custom model name"
                        />
                      )}
                      
                      <button 
                        onClick={() => fetchModels(provider, idx)}
                        className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 px-4 rounded-xl font-medium hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
                      >
                        Fetch
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">Notification</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Mojo uses Upstash QStash to provide push services. <br />
            Get your QStash Token at <a href="https://console.upstash.com/qstash" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline">https://console.upstash.com/qstash</a>
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">QStash Token</label>
              <input 
                type="password"
                value={localQstashToken}
                onChange={(e) => setLocalQstashToken(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="eyJhbGciOi..."
              />
            </div>
            
            <div className="pt-2">
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Webhook URL</label>
              <p className="text-xs text-slate-400 mb-2">Configure a webhook address. URL supports $ variables. Mojo will push to this address via QStash.</p>
              <input 
                type="text" 
                value={localWebhookUrl}
                onChange={(e) => setLocalWebhookUrl(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="https://api.telegram.org/bot$telegram_bot_token/sendMessage"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Custom Headers (Optional)</label>
              <p className="text-xs text-slate-400 mb-2">One per line, e.g. Authorization: Bearer sk-xxx</p>
              <textarea 
                value={localWebhookHeaders}
                onChange={(e) => setLocalWebhookHeaders(e.target.value)}
                className="w-full h-24 font-mono text-sm bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="Authorization: Bearer sk-xxx\nX-Custom-Header: value"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Message Body Template (JSON)</label>
              <p className="text-xs text-slate-400 mb-2">Supports magic variables: $title, $content, $url</p>
              <textarea 
                value={localWebhookTemplate}
                onChange={(e) => setLocalWebhookTemplate(e.target.value)}
                className="w-full h-32 font-mono text-sm bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder='{\n  "chat_id": 00000000,\n  "text": "$title:$content"\n}'
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={handleTestSendDirect}
                disabled={isTestSending}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isTestSending && <Loader2 size={16} className="animate-spin" />}
                Direct Test Webhook
              </button>
              <button
                onClick={handleTestSendQStash}
                disabled={isTestSending}
                className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isTestSending && <Loader2 size={16} className="animate-spin" />}
                Test via QStash
              </button>
            </div>

            <hr className="border-slate-100 dark:border-slate-800 my-4" />

            <div className="pt-2">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="text-blue-500" size={20} />
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Daily Review Schedule</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Set a daily CRON expression to receive automatic reminders via QStash.
              </p>
              
              <div className="flex items-center gap-4 mb-4">
                <input 
                  type="text"
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200 font-mono"
                  placeholder="0 10 * * *"
                />
                <button
                  onClick={handleCreateSchedule}
                  disabled={scheduleIsLoading}
                  className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {scheduleIsLoading && <Loader2 size={16} className="animate-spin" />}
                  Save Schedule
                </button>
              </div>

              {hasSchedule && (
                <div className="bg-blue-50 dark:bg-slate-800/50 p-4 rounded-xl flex items-center justify-between border border-blue-100 dark:border-slate-700">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Active Schedule
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                      {isSchedulePaused ? <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/> : <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>}
                      {isSchedulePaused ? 'Paused' : 'Running'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleSchedule}
                      disabled={scheduleIsLoading}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                      {isSchedulePaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={handleDeleteSchedule}
                      disabled={scheduleIsLoading}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.preferencesTitle || 'Content Preferences'}</h2>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-6">
            {PRESET_PREFS.map(p => {
              const active = prefs.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePref(p.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
                    active 
                      ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-500 dark:border-blue-400 shadow-md shadow-blue-500/20 dark:shadow-none" 
                      : "bg-transparent text-slate-600 dark:text-slate-400 border-blue-100 dark:border-slate-700 hover:border-blue-400 dark:hover:border-slate-500"
                  )}
                >
                  {p.name}
                </button>
              );
            })}
            {prefs.filter(p => !PRESET_PREFS.find(preset => preset.id === p)).map(p => (
              <button
                key={p}
                onClick={() => togglePref(p)}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border bg-blue-600 dark:bg-blue-500 text-white border-blue-500 dark:border-blue-400 shadow-md shadow-blue-500/20 dark:shadow-none"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input 
              type="text" 
              value={customPref}
              onChange={(e) => setCustomPref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customPref) {
                  if (!prefs.includes(customPref)) setPrefs([...prefs, customPref]);
                  setCustomPref('');
                }
              }}
              className="flex-1 bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-sm text-slate-800 dark:text-slate-200"
              placeholder="Add custom interest (e.g. Photography)..."
            />
            <button 
              onClick={() => {
                if (customPref && !prefs.includes(customPref)) {
                  setPrefs([...prefs, customPref]);
                  setCustomPref('');
                }
              }}
              className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 px-6 rounded-xl font-medium hover:bg-blue-100 dark:hover:bg-blue-800/60 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Target className="text-orange-500 dark:text-orange-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.dailyGoal || 'Daily Goal'}</h2>
          </div>
          
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Target words per day</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={localDailyGoal}
                  onChange={(e) => setLocalDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-3 py-2 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-orange-600 dark:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
                <span className="text-slate-500 dark:text-slate-400 font-medium">words</span>
              </div>
            </div>
            
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={localDailyGoal}
              onChange={(e) => setLocalDailyGoal(parseInt(e.target.value))}
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
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.themePreference || 'Theme Preferences'}</h2>
          </div>
          
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Theme</span>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-medium text-slate-700 dark:text-slate-300"
              >
                {theme === 'dark' ? (
                  <>
                    <Moon size={18} className="text-blue-400" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun size={18} className="text-amber-500" />
                    <span>Light Mode</span>
                  </>
                )}
              </button>
            </div>
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
                        title="View Deck Words"
                      >
                        <List size={18} />
                      </button>
                      {activeDeckId !== deck.id && (
                        <button 
                          onClick={() => setActiveDeckId(deck.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          Select
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
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">{t.offlineDictionary || 'Offline Dictionary'}</h2>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.offlineDictionaryDesc || "Download the comprehensive ECDICT database (CSV format) directly into your browser's IndexedDB for lightning-fast, offline word lookups."}
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-4">
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {dictStatus.isLoaded ? (t.dictionaryAvailable || 'Dictionary Available') : (t.dictionaryMissing || 'Dictionary Missing')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-2">
                  {dictStatus.isLoaded ? `${dictStatus.count.toLocaleString()} ${t.wordsLoaded || 'words loaded.'}` : (t.notLoaded || 'Not loaded. Search will fallback to mock data.')}
                </p>
                {!dictStatus.isLoaded && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Download it <a href="https://github.com/skywind3000/ECDICT/raw/refs/heads/master/ecdict.csv" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">from here</a> first.
                  </p>
                )}
              </div>
              
              {!dictProgress ? (
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer px-4 py-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl font-medium text-sm hover:bg-indigo-100 dark:hover:bg-indigo-800/60 transition-colors">
                    {t.uploadCsv || 'Upload CSV'}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        try {
                          setDictProgress({ status: 'starting' });
                          const { importDictionaryFromBlob } = await import('../services/dictionaryDb');
                          await importDictionaryFromBlob(file, setDictProgress);
                          
                          // After completion, update the UI
                          const { getDictionaryWordCount } = await import('../services/dictionaryDb');
                          const count = await getDictionaryWordCount();
                          setDictStatus({ isLoaded: count > 0, count });
                        } catch (err) {
                          console.error('Failed to import', err);
                          setDictProgress({ status: 'error' });
                        } finally {
                          setDictProgress(null);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-right">
                  <span className="text-xs font-semibold text-indigo-500 block mb-1">
                    {dictProgress.status === 'fetching' ? 'Initiating...' :
                     dictProgress.status === 'downloading' ? `Downloading: ${dictProgress.loaded ? (dictProgress.loaded / 1024 / 1024).toFixed(1) : 0} MB` :
                     dictProgress.status === 'parsing' ? `Parsing: ${dictProgress.rowsProcessed?.toLocaleString() || 0} words...` :
                     dictProgress.status === 'error' ? 'Error occurred' : 'Please wait...'}
                  </span>
                  <Loader2 size={16} className="text-indigo-500 animate-spin inline-block" />
                </div>
              )}
            </div>

            {dictStatus.isLoaded && (
              <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.createDeckFromTag || 'Create Deck from Tag'}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Select a tag to extract words from your offline dictionary.
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
                    placeholder="Custom tag (e.g. nmet)"
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
                    Create
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
          {hasConfigured ? 'Save Settings' : 'Let\'s Go!'}
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
                    This deck is empty.
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
