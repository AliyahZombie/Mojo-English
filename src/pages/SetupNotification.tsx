import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ExternalLink, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';

const STEPS = ['qstash', 'preset', 'config', 'done'] as const;
type Step = typeof STEPS[number];

type PresetId = 'telegram' | 'pushme' | 'wecom' | 'custom';

interface Preset {
  id: PresetId;
  name: string;
  desc: string;
}

const PRESETS: Preset[] = [
  { id: 'telegram', name: 'Telegram', desc: '通过 Telegram Bot 接收通知' },
  { id: 'pushme', name: 'PushMe', desc: '安卓上最方便配置的通知渠道' },
  { id: 'wecom', name: '企业微信', desc: '通过企业微信群机器人推送' },
  { id: 'custom', name: '自定义 Webhook', desc: '手动配置 Webhook 地址和请求体' },
];

function buildConfig(preset: PresetId, fields: Record<string, string>) {
  switch (preset) {
    case 'telegram':
      return {
        url: `https://api.telegram.org/bot${fields.botToken}/sendMessage`,
        headers: '',
        template: `{\n  "chat_id": ${fields.userId || '00000000'},\n  "text": "$title\\n$content"\n}`,
      };
    case 'pushme':
      return {
        url: 'https://push.i-i.me/',
        headers: '',
        template: `{\n  "push_key": "${fields.pushKey || ''}",\n  "title": "$title",\n  "content": "$content"\n}`,
      };
    case 'wecom':
      return {
        url: fields.webhookUrl || '',
        headers: '',
        template: `{\n  "msgtype": "text",\n  "text": {\n    "content": "$title\\n$content"\n  }\n}`,
      };
    case 'custom':
      return {
        url: fields.url || '',
        headers: fields.headers || '',
        template: fields.template || '',
      };
  }
}

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
};

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

export function SetupNotification() {
  const navigate = useNavigate();
  const upstashQstashToken = useAppStore(s => s.upstashQstashToken);
  const setNotificationConfig = useAppStore(s => s.setNotificationConfig);

  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [qstashToken, setQstashToken] = useState(upstashQstashToken);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>('telegram');
  const [fields, setFields] = useState<Record<string, string>>({});

  const step = STEPS[stepIdx];

  const go = (delta: number) => {
    setDir(delta);
    setStepIdx(i => i + delta);
  };

  const finish = () => {
    const { url, headers, template } = buildConfig(selectedPreset, fields);
    setNotificationConfig(qstashToken, url, headers, template);
    go(1);
  };

  const inputCls = 'w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200 text-sm';
  const labelCls = 'block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5';

  const renderStep = () => {
    switch (step) {
      case 'qstash':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">配置 QStash</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                QStash 让 Mojo 无需服务器也能向您发送通知，且提供慷慨的免费额度。
              </p>
            </div>
            <a
              href="https://console.upstash.com/qstash"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600 font-medium"
            >
              点击前往获取 QStash API Key <ExternalLink size={14} />
            </a>
            <div>
              <label className={labelCls}>QStash Token</label>
              <input
                type="password"
                value={qstashToken}
                onChange={e => setQstashToken(e.target.value)}
                className={inputCls}
                placeholder="eyJhbGciOi..."
              />
            </div>
            <div className="flex justify-between pt-2">
              <button
                onClick={() => navigate('/setup')}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => go(1)}
                disabled={!qstashToken.trim()}
                className="px-6 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                下一步 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        );

      case 'preset':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">选择推送渠道</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">选择一个预设，或手动配置自定义 Webhook。</p>
            </div>
            <div className="space-y-2">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPreset(p.id); setFields({}); }}
                  className={cn(
                    'w-full text-left px-4 py-3.5 rounded-xl border transition-colors flex items-center justify-between',
                    selectedPreset === p.id
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500'
                      : 'border-blue-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-600'
                  )}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.desc}</div>
                  </div>
                  {selectedPreset === p.id && <Check size={16} className="text-blue-500 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => go(-1)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">上一步</button>
              <button onClick={() => go(1)} className="px-6 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-2">
                下一步 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                配置 {PRESETS.find(p => p.id === selectedPreset)?.name}
              </h2>
            </div>
            {selectedPreset === 'telegram' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  首先，前往{' '}
                  <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">@BotFather</a>
                  {' '}创建一个机器人，将 Token 粘贴在下方。
                </p>
                <div>
                  <label className={labelCls}>Bot Token</label>
                  <input type="text" value={fields.botToken || ''} onChange={e => setFields(f => ({ ...f, botToken: e.target.value }))} className={inputCls} placeholder="123456789:AAF..." />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  然后，前往{' '}
                  <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">@userinfobot</a>
                  {' '}发送 /start，复制 id 字段。
                </p>
                <div>
                  <label className={labelCls}>User ID</label>
                  <input type="text" value={fields.userId || ''} onChange={e => setFields(f => ({ ...f, userId: e.target.value }))} className={inputCls} placeholder="123456789" />
                </div>
              </div>
            )}
            {selectedPreset === 'pushme' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  前往{' '}
                  <a href="https://push.i-i.me/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">官网</a>
                  {' '}下载 APK 后，复制软件内的 Push Key。
                </p>
                <div>
                  <label className={labelCls}>Push Key</label>
                  <input type="text" value={fields.pushKey || ''} onChange={e => setFields(f => ({ ...f, pushKey: e.target.value }))} className={inputCls} placeholder="your-push-key" />
                </div>
              </div>
            )}
            {selectedPreset === 'wecom' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  在企业微信群中添加群机器人，复制并粘贴 Webhook 地址。
                </p>
                <div>
                  <label className={labelCls}>Webhook URL</label>
                  <input type="text" value={fields.webhookUrl || ''} onChange={e => setFields(f => ({ ...f, webhookUrl: e.target.value }))} className={inputCls} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
                </div>
              </div>
            )}
            {selectedPreset === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Webhook URL</label>
                  <input type="text" value={fields.url || ''} onChange={e => setFields(f => ({ ...f, url: e.target.value }))} className={inputCls} placeholder="https://..." />
                </div>
                <div>
                  <label className={labelCls}>请求头（每行一条，格式：Key: Value）</label>
                  <textarea value={fields.headers || ''} onChange={e => setFields(f => ({ ...f, headers: e.target.value }))} className={cn(inputCls, 'h-20 font-mono')} placeholder={'Authorization: Bearer xxx'} />
                </div>
                <div>
                  <label className={labelCls}>请求体模板（支持 $title、$content 变量）</label>
                  <textarea value={fields.template || ''} onChange={e => setFields(f => ({ ...f, template: e.target.value }))} className={cn(inputCls, 'h-28 font-mono')} placeholder={'{\n  "text": "$title: $content"\n}'} />
                </div>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => go(-1)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">上一步</button>
              <button
                onClick={finish}
                className="px-6 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                完成配置 <Check size={16} />
              </button>
            </div>
          </div>
        );

      case 'done':
        return (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Check size={32} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">配置完成</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">通知渠道已保存。您可以在设置页面继续配置提醒计划。</p>
            </div>
            <button
              onClick={() => navigate('/setup')}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              返回设置
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <StepDots current={stepIdx} />
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-blue-50 dark:border-slate-800 overflow-hidden relative">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
