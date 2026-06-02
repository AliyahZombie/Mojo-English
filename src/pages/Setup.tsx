import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Settings, Save, Sparkles, CheckCircle2, Target, BookA, Upload, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { translations } from '../lib/i18n';
import { uploadAndParseApkg } from '../services/deckApi';

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
  { id: "other", "name": "其他" },
  { id: "politics", "name": "政治" },
  { id: "science", "name": "科学" },
  { id: "sports", "name": "体育" },
  { id: "technology", "name": "科技" },
  { id: "top", "name": "头条" },
  { id: "tourism", "name": "旅游" },
  { id: "world", "name": "国际/世界" }
];

export function Setup() {
  const navigate = useNavigate();
  const { hasConfigured, setHasConfigured, activeProvider, setActiveProvider, providers, updateProvider, preferences, setPreferences, dailyGoal, setDailyGoal, language, decks, activeDeckId, addDeck, setActiveDeckId, deleteDeck } = useAppStore();
  
  const t = translations[language];
  const [localProviderKey, setLocalProviderKey] = useState(activeProvider);
  const [providerData, setProviderData] = useState(() => providers[activeProvider] || providers.gemini);
  const [prefs, setPrefs] = useState<string[]>(preferences);
  const [localDailyGoal, setLocalDailyGoal] = useState<number>(dailyGoal || 5);
  const [customPref, setCustomPref] = useState('');
  const [isUploading, setIsUploading] = useState(false);

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
    updateProvider(localProviderKey, providerData);
    setActiveProvider(localProviderKey);
    setPreferences(prefs);
    setDailyGoal(localDailyGoal);
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
      className="max-w-2xl mx-auto py-8"
    >
      <div className="mb-8 md:mb-10 text-center px-4">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-slate-800 dark:text-slate-200 transition-colors">Welcome to Mojo</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base transition-colors">Let's configure your English learning experience.</p>
      </div>

      <div className="space-y-6 md:space-y-8 px-4 md:px-0">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-blue-500 dark:text-blue-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">LLM Provider</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Provider</label>
              <select 
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                value={localProviderKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalProviderKey(val);
                  setProviderData(providers[val] || { name: val, baseUrl: '', apiKey: '', models: [], activeModel: '' });
                }} 
              >
                <option value="gemini">Gemini (Default)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Base URL</label>
              <input 
                type="text" 
                value={providerData.baseUrl}
                onChange={(e) => setProviderData({ ...providerData, baseUrl: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">API Key</label>
              <input 
                type="password"
                value={providerData.apiKey}
                onChange={(e) => setProviderData({ ...providerData, apiKey: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="sk-..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">Model</label>
              <input 
                type="text"
                value={providerData.activeModel}
                onChange={(e) => setProviderData({ ...providerData, activeModel: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                placeholder="e.g. gemini-1.5-flash"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">Your Interests</h2>
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

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Target className="text-orange-500 dark:text-orange-400 transition-colors" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors">Daily Goal</h2>
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

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
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
              <div className="mt-6 flex flex-col gap-3">
                {decks.map(deck => (
                  <div key={deck.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{deck.name}</span>
                        {activeDeckId === deck.id && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                            {t.activeDeck}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">{deck.words.length} {t.wordsCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
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

        <button 
          onClick={handleSave}
          className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-xl py-4 font-bold text-lg transition-all shadow-lg shadow-blue-500/30 dark:shadow-none flex items-center justify-center gap-2"
        >
          <Save size={20} />
          {hasConfigured ? 'Save Settings' : 'Let\'s Go!'}
        </button>
      </div>
    </motion.div>
  );
}
