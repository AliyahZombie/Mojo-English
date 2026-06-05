import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Loader2, ExternalLink, Sun, Moon, Newspaper } from 'lucide-react';
import { Logo } from '../components/Logo';
import { proxyUrl } from '../lib/proxyUrl';
import { cn } from '../lib/utils';
import { useAppStore, type Provider } from '../store/useAppStore';
import type { AssistantReplyStyle } from '../store/useAppStore';
import { uploadAndParseApkg } from '../services/deckApi';
import {
  ECDICT_DOWNLOAD_URL,
  getDictionaryDownloadSnapshot,
  importDictionaryFile,
  startDictionaryDownload,
  subscribeDictionaryDownload,
} from '../services/dictionaryDownload';
import { testProviderConnection } from '../services/llm';

const UNITY2_BASE_URL = 'https://unity2.ai/v1';
const SKIP_COOLDOWN = 3;

function useSkipCooldown(active: boolean) {
  const [remaining, setRemaining] = useState(SKIP_COOLDOWN);
  useEffect(() => {
    if (!active) return;
    setRemaining(SKIP_COOLDOWN);
    const id = setInterval(() => setRemaining(r => r <= 1 ? (clearInterval(id), 0) : r - 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return remaining;
}

const STEPS = ['welcome', 'style', 'llm', 'newsdata', 'deck', 'goal', 'ecdict', 'finish'] as const;
type Step = typeof STEPS[number];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex gap-2 justify-center mb-8">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i === current ? 'w-6 h-2 bg-blue-500' : 'w-2 h-2 bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
    </div>
  );
}

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
};

export function OOBE() {
  const navigate = useNavigate();
  const {
    setAssistantReplyStyle, replaceProviders, setDailyGoal,
    addDeck, activeDeckId, setActiveDeckId, setHasConfigured, decks,
    theme, toggleTheme, setNewsdataApiKey, setTavilyApiKey
  } = useAppStore();

  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState(1);

  // style step
  const [style, setStyle] = useState<AssistantReplyStyle>('cute');

  // llm step
  const [apiKey, setApiKey] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customProviderType, setCustomProviderType] = useState<'OPENAI' | 'CLAUDE' | 'GEMINI'>('OPENAI');
  const [models, setModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // newsdata step
  const [newsdataApiKey, setLocalNewsdataApiKey] = useState('');
  const [tavilyApiKey, setLocalTavilyApiKey] = useState('');

  // deck step
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // goal step
  const [goal, setGoal] = useState(10);

  // ecdict step
  const [dictDownload, setDictDownload] = useState(getDictionaryDownloadSnapshot);
  const dictUploadRef = useRef<HTMLInputElement | null>(null);

  const step = STEPS[stepIdx];
  const dictProgress = dictDownload.progress;
  const dictDone = dictDownload.status === 'done';
  const dictFailed = dictDownload.status === 'failed';

  const isNewsdataSkip = step === 'newsdata' && !newsdataApiKey.trim() && !tavilyApiKey.trim();
  const isDeckSkip = step === 'deck' && decks.length === 0;
  const isEcdictSkip = step === 'ecdict' && dictFailed;

  const newsdataCooldown = useSkipCooldown(isNewsdataSkip);
  const deckCooldown = useSkipCooldown(isDeckSkip);
  const ecdictCooldown = useSkipCooldown(isEcdictSkip);

  const go = (delta: number) => {
    setDir(delta);
    setStepIdx(i => i + delta);
  };

  // Start ECDICT as soon as OOBE opens so the dedicated step can show live status.
  useEffect(() => {
    const unsubscribe = subscribeDictionaryDownload(setDictDownload);
    startDictionaryDownload().catch(() => {
      // Failure state is already published for the ECDICT step.
    });
    return unsubscribe;
  }, []);

  const buildProvider = (): Provider => {
    const baseUrl = showCustom && customBaseUrl ? customBaseUrl : UNITY2_BASE_URL;
    const type = showCustom ? customProviderType : 'OPENAI';
    return {
      id: 'provider-unity2',
      type,
      name: showCustom ? '自定义提供商' : 'Unity2.ai',
      baseUrl,
      apiKey: apiKey.trim(),
      models,
      activeModel,
      taskModels: {},
    };
  };

  // 在自定义提供商出错时，根据类型检查 baseUrl 结尾，给出修正建议
  const getBaseUrlHint = (): string => {
    if (!showCustom || !customBaseUrl.trim()) return '';
    const url = customBaseUrl.trim().replace(/\/$/, '');
    if (customProviderType === 'GEMINI') {
      if (!url.endsWith('/v1beta')) return ' 在 baseUrl 后加上 /v1beta 再试试吧';
    } else {
      // OPENAI 兼容 与 CLAUDE (Anthropic)
      if (!url.endsWith('/v1')) return ' 在 baseUrl 后加上 /v1 再试试吧';
    }
    return '';
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setTestResult(null);
    setTestError(null);
    setModelsError(null);
    try {
      const provider = buildProvider();
      const url = `${provider.baseUrl.replace(/\/$/, '')}/models`;
      const res = await fetch(proxyUrl(url), { headers: { Authorization: `Bearer ${provider.apiKey}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: string[] = data?.data?.map((m: { id: string }) => m.id) ?? [];
      if (list.length === 0) throw new Error('未返回任何模型');
      setModels(list);
      setActiveModel(list[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setModelsError(`拉取模型失败: ${message}.${getBaseUrlHint()}`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      await testProviderConnection(buildProvider());
      setTestResult('ok');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTestError(`连接失败: ${message}.${getBaseUrlHint() || ' 请检查 Key 和网络'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeckUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const parsed = await uploadAndParseApkg(file);
      addDeck(parsed);
      if (!activeDeckId) setActiveDeckId(parsed.id);
    } catch {
      // ignore for OOBE
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadEcdict = async () => {
    startDictionaryDownload({ force: true }).catch(() => {
      // Failure state is already published for the ECDICT step.
    });
  };

  const handleEcdictFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importDictionaryFile(file);
    } catch {
      // Failure state is already published for the ECDICT step.
    } finally {
      e.target.value = '';
    }
  };

  const handleFinish = () => {
    setAssistantReplyStyle(style);
    setDailyGoal(goal);
    if (apiKey.trim()) {
      const p = buildProvider();
      replaceProviders([p], p.id);
    }
    if (newsdataApiKey.trim()) setNewsdataApiKey(newsdataApiKey.trim());
    if (tavilyApiKey.trim()) setTavilyApiKey(tavilyApiKey.trim());
    setHasConfigured(true);
    navigate('/');
  };

  const dictProgressLabel = () => {
    if (!dictProgress) {
      if (dictDownload.status === 'checking') return '正在检查本地词典状态...';
      if (dictDownload.status === 'idle') return '准备下载离线词典...';
      return '';
    }
    const downloadedMb = ((dictProgress.loaded ?? 0) / 1024 / 1024).toFixed(1);
    const totalMb = dictProgress.total ? (dictProgress.total / 1024 / 1024).toFixed(1) : null;
    if (dictProgress.status === 'fetching') return '正在连接在线词典...';
    if (dictProgress.status === 'fetching' || dictProgress.status === 'downloading') {
      return totalMb ? `已下载 ${downloadedMb} / ${totalMb} MB` : `已下载 ${downloadedMb} MB`;
    }
    if (dictProgress.status === 'downloaded') return '下载完成，构建索引中...';
    if (dictProgress.status === 'reading') return '正在读取词典文件...';
    if (dictProgress.status === 'parsing') return `构建索引中... ${(dictProgress.rowsProcessed ?? 0).toLocaleString()} 词`;
    return '处理中...';
  };

  const dictStatusText = dictProgressLabel();
  const canProceedLLM = apiKey.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
      <button
        onClick={toggleTheme}
        aria-label="切换深浅色主题"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-colors backdrop-blur"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="w-full max-w-md">
        <StepDots current={stepIdx} />

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: 'easeInOut' }}
          >
            {step === 'welcome' && (
              <div className="flex flex-col items-center text-center gap-6">
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}>
                  <Logo size="lg" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Hi! 👋</h1>
                  <p className="mt-2 text-lg text-slate-500 dark:text-slate-400">欢迎来到 Mojo English.</p>
                </div>
                <button
                  onClick={() => go(1)}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-4 font-semibold text-base flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                >
                  开始定义你的英语学习之旅
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            {step === 'style' && (
              <div className="flex flex-col gap-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center">首先，你希望 Mojo 的风格是？</h2>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'cute', label: 'Cute', bubble: '嗨～ 今天想让 Mojo 陪你学点什么？' },
                    { id: 'precise', label: 'Precise', bubble: '你今天的学习任务还没完成，我们从哪开始？' },
                  ] as { id: AssistantReplyStyle; label: string; bubble: string }[]).map(({ id, label, bubble }) => (
                    <button
                      key={id}
                      onClick={() => setStyle(id)}
                      className={cn(
                        'rounded-2xl border p-4 text-left transition-all',
                        style === id
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{label}</span>
                      <div className={cn(
                        'mt-3 rounded-xl p-3 text-xs leading-relaxed',
                        style === id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      )}>
                        {bubble}
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => go(1)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-4 font-semibold transition-colors">
                  继续
                </button>
              </div>
            )}

            {step === 'llm' && (
              <div className="flex flex-col gap-5">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center">
                  {showCustom ? '配置自定义 LLM' : '输入你的 Unity2.ai API Key'}
                </h2>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center">密钥将被安全地储存在本地</p>
                  <a href="https://unity2.ai" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 justify-center">
                    获取 KEY <ExternalLink size={11} />
                  </a>

                  {showCustom && (
                    <div className="flex flex-col gap-2 mt-1 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <select
                        value={customProviderType}
                        onChange={e => setCustomProviderType(e.target.value as 'OPENAI' | 'CLAUDE' | 'GEMINI')}
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      >
                        <option value="OPENAI">OpenAI 兼容</option>
                        <option value="CLAUDE">Claude (Anthropic)</option>
                        <option value="GEMINI">Gemini</option>
                      </select>
                      <input
                        type="text"
                        value={customBaseUrl}
                        onChange={e => setCustomBaseUrl(e.target.value)}
                        placeholder="Base URL (e.g. https://api.openai.com/v1)"
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  )}

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={handleFetchModels}
                      disabled={!canProceedLLM || isFetchingModels}
                      className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {isFetchingModels ? <Loader2 size={13} className="animate-spin" /> : null}
                      拉取模型列表
                    </button>
                    <button
                      onClick={handleTestConnection}
                      disabled={!canProceedLLM || !activeModel || isTesting}
                      className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {isTesting ? <Loader2 size={13} className="animate-spin" /> : null}
                      检测连通性
                    </button>
                  </div>

                  {modelsError && (
                    <p className="text-xs text-center text-red-500">{modelsError}</p>
                  )}

                  {testResult === 'ok' && (
                    <p className="text-xs text-center text-green-500">✓ 连接成功</p>
                  )}
                  {testError && (
                    <p className="text-xs text-center text-red-500">✗ {testError}</p>
                  )}

                  {models.length > 0 && (
                    <select
                      value={activeModel}
                      onChange={e => setActiveModel(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none"
                    >
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                </div>

                <button
                  onClick={() => setShowCustom(v => !v)}
                  className="text-xs text-slate-400 dark:text-slate-500 text-center hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showCustom ? '收起' : '或者配置自定义提供商'}
                </button>

                <div className="flex gap-3">
                  <button onClick={() => go(-1)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    返回
                  </button>
                  <button
                    onClick={() => go(1)}
                    disabled={!canProceedLLM}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl py-3.5 font-semibold text-sm transition-colors"
                  >
                    继续
                  </button>
                </div>
              </div>
            )}

            {step === 'newsdata' && (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">配置新闻 API</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    NewsData.io 和 Tavily 对个人用户提供慷慨的免费额度，且无需信用卡。<br />
                    Mojo 强烈推荐接入这些服务来丰富您的英语学习体验 ✨
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-cyan-500 dark:text-cyan-400">
                      <Newspaper size={16} />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">NewsData.io API Key</span>
                      <a href="https://newsdata.io/" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-500 hover:underline inline-flex items-center gap-0.5">
                        获取 <ExternalLink size={10} />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={newsdataApiKey}
                      onChange={e => setLocalNewsdataApiKey(e.target.value)}
                      placeholder="pub_xxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-violet-500 dark:text-violet-400">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tavily API Key</span>
                      <a href="https://app.tavily.com/home" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-500 hover:underline inline-flex items-center gap-0.5">
                        获取 <ExternalLink size={10} />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={tavilyApiKey}
                      onChange={e => setLocalTavilyApiKey(e.target.value)}
                      placeholder="tvly-xxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center">密钥将被安全地储存在本地</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => go(-1)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    返回
                  </button>
                  <button
                    onClick={() => go(1)}
                    disabled={isNewsdataSkip && newsdataCooldown > 0}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl py-3.5 font-semibold text-sm transition-colors"
                  >
                    {isNewsdataSkip && newsdataCooldown > 0 ? `暂时跳过 (${newsdataCooldown}s)` : isNewsdataSkip ? '暂时跳过' : '继续'}
                  </button>
                </div>
              </div>
            )}

            {step === 'deck' && (
              <div className="flex flex-col gap-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">选择你的 Anki 词书进行导入</h2>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center gap-3">
                  {isUploading ? (
                    <Loader2 size={28} className="animate-spin text-blue-500" />
                  ) : decks.length > 0 ? (
                    <div className="text-center">
                      <p className="text-green-600 dark:text-green-400 font-semibold text-sm">✓ 已导入 {decks.length} 个词书</p>
                      <p className="text-xs text-slate-400 mt-1">{decks.map(d => d.name).join('、')}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">点击下方按钮选择 .apkg 文件</p>
                  )}
                  <label className="cursor-pointer bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
                    {decks.length > 0 ? '继续导入' : '选择词书文件'}
                    <input ref={fileInputRef} type="file" accept=".apkg" className="hidden" onChange={handleDeckUpload} />
                  </label>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => go(-1)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    返回
                  </button>
                  <button
                    onClick={() => go(1)}
                    disabled={isDeckSkip && deckCooldown > 0}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl py-3.5 font-semibold text-sm transition-colors"
                  >
                    {isDeckSkip && deckCooldown > 0 ? `暂时跳过 (${deckCooldown}s)` : isDeckSkip ? '暂时跳过' : '继续'}
                  </button>
                </div>
              </div>
            )}

            {step === 'goal' && (
              <div className="flex flex-col gap-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center">选择你的每日单词目标</h2>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                  <div className="text-center">
                    <span className="text-5xl font-bold text-blue-600 dark:text-blue-400">{goal}</span>
                    <span className="ml-2 text-slate-500 text-lg">词 / 天</span>
                  </div>
                  <input
                    type="range" min={1} max={100} value={goal}
                    onChange={e => setGoal(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>1</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => go(-1)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    返回
                  </button>
                  <button onClick={() => go(1)} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    继续
                  </button>
                </div>
              </div>
            )}

            {step === 'ecdict' && (
              <div className="flex flex-col gap-6 text-center">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">稍安勿躁...</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                  Mojo 正在尝试下载离线词典并构建索引，这可能需要一定时间。
                </p>

                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-4">
                  {dictDone ? (
                    <p className="text-green-600 dark:text-green-400 font-semibold">✓ 词典已准备就绪</p>
                  ) : dictFailed ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <p className="text-red-500 text-sm">
                        {dictDownload.error ? `下载失败：${dictDownload.error}` : '下载失败，请手动下载后导入：'}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">可手动下载后导入，或重试自动下载。</p>
                      <a
                        href={ECDICT_DOWNLOAD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                      >
                        下载 ecdict.csv <ExternalLink size={11} />
                      </a>
                      <label className="cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
                        上传词典文件
                        <input ref={dictUploadRef} type="file" accept=".csv" className="hidden" onChange={handleEcdictFileUpload} />
                      </label>
                      <button onClick={handleDownloadEcdict} className="text-xs text-blue-500 hover:underline">重试下载</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <Loader2 size={28} className="animate-spin text-blue-500" />
                      {dictStatusText && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">{dictStatusText}</p>
                      )}
                    </div>
                  )}
                </div>

                {decks.length === 0 && dictDone && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    提示：你还没有导入词书，可以在词书页面从 ECDICT 创建词书。
                  </p>
                )}

                <div className="flex gap-3">
                  <button onClick={() => go(-1)} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl py-3.5 font-semibold text-sm transition-colors">
                    返回
                  </button>
                  <button
                    onClick={() => go(1)}
                    disabled={(!dictDone && !dictFailed) || (isEcdictSkip && ecdictCooldown > 0)}
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl py-3.5 font-semibold text-sm transition-colors"
                  >
                    {isEcdictSkip && ecdictCooldown > 0 ? `跳过 (${ecdictCooldown}s)` : dictFailed ? '跳过' : '继续'}
                  </button>
                </div>
              </div>
            )}

            {step === 'finish' && (
              <div className="flex flex-col items-center text-center gap-6">
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                  <Logo size="lg" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">你已经完成了基础配置～ 🎉</h2>
                  <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">随时可以在设置中调整更多选项</p>
                </div>
                <button
                  onClick={handleFinish}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-4 font-semibold text-base transition-colors shadow-lg shadow-blue-500/20"
                >
                  开始使用 Mojo ✨
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
