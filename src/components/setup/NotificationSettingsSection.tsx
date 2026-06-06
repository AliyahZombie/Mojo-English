import { Clock, Loader2, RefreshCw, Settings, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLocalTimeZone, type ManagedQStashSchedule, type ReviewScheduleConfig } from '../../services/notificationService';
import { useAppStore } from '../../store/useAppStore';
import { translations } from '../../lib/i18n';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

type NotificationSettingsSectionProps = {
  qstashToken: string;
  webhookUrl: string;
  webhookHeaders: string;
  webhookTemplate: string;
  isTestSending: boolean;
  scheduleConfig: ReviewScheduleConfig;
  scheduleIsLoading: boolean;
  hasSchedule: boolean;
  isSchedulePaused: boolean;
  primaryScheduleId: string;
  schedules: ManagedQStashSchedule[];
  onQstashTokenChange: (value: string) => void;
  onWebhookUrlChange: (value: string) => void;
  onWebhookHeadersChange: (value: string) => void;
  onWebhookTemplateChange: (value: string) => void;
  onTestSendDirect: () => void;
  onTestSendQStash: () => void;
  onScheduleConfigChange: (value: ReviewScheduleConfig) => void;
  onCreateSchedule: () => void;
  onRefreshSchedules: () => void;
  onToggleSchedule: (scheduleId: string, pause: boolean) => void;
  onDeleteSchedule: (scheduleId: string) => void;
};

export function NotificationSettingsSection({
  qstashToken,
  webhookUrl,
  webhookHeaders,
  webhookTemplate,
  isTestSending,
  scheduleConfig,
  scheduleIsLoading,
  hasSchedule,
  isSchedulePaused,
  primaryScheduleId,
  schedules,
  onQstashTokenChange,
  onWebhookUrlChange,
  onWebhookHeadersChange,
  onWebhookTemplateChange,
  onTestSendDirect,
  onTestSendQStash,
  onScheduleConfigChange,
  onCreateSchedule,
  onRefreshSchedules,
  onToggleSchedule,
  onDeleteSchedule,
}: NotificationSettingsSectionProps) {
  const { language } = useAppStore();
  const t = translations[language];
  const navigate = useNavigate();
  const localTimezone = getLocalTimeZone();
  const selectedTimezone = scheduleConfig.timezone || localTimezone;
  const timezoneOptions = Array.from(new Set([selectedTimezone, localTimezone, 'UTC']));
  const weekdayLabels: Record<number, string> = {
    0: t.sun,
    1: t.mon,
    2: t.tue,
    3: t.wed,
    4: t.thu,
    5: t.fri,
    6: t.sat,
  };

  const toggleDay = (day: number) => {
    const hasDay = scheduleConfig.daysOfWeek.includes(day);
    const nextDays = hasDay
      ? scheduleConfig.daysOfWeek.filter(value => value !== day)
      : [...scheduleConfig.daysOfWeek, day];

    onScheduleConfigChange({
      ...scheduleConfig,
      daysOfWeek: nextDays,
    });
  };

  const formatScheduleTime = (timestamp?: number) => {
    if (!timestamp) return t.notScheduled;
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-50 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="text-emerald-500 dark:text-emerald-400 transition-colors" size={24} />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 transition-colors flex-1">{t.notification}</h2>
        <button
          onClick={() => navigate('/setupNotification')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          <Wand2 size={13} />
          交互式配置
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        {t.notificationDesc} <br />
        {t.getQstashTokenAt} <a href="https://console.upstash.com/qstash" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline">https://console.upstash.com/qstash</a>
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.qstashToken}</label>
          <input
            type="password"
            value={qstashToken}
            onChange={(e) => onQstashTokenChange(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
            placeholder="eyJhbGciOi..."
          />
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.webhookUrl}</label>
          <p className="text-xs text-slate-400 mb-2">{t.webhookUrlDesc}</p>
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => onWebhookUrlChange(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
            placeholder="https://api.telegram.org/bot$telegram_bot_token/sendMessage"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.customHeaders}</label>
          <p className="text-xs text-slate-400 mb-2">{t.customHeadersDesc}</p>
          <textarea
            value={webhookHeaders}
            onChange={(e) => onWebhookHeadersChange(e.target.value)}
            className="w-full h-24 font-mono text-sm bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
            placeholder={"Authorization: Bearer sk-xxx\nX-Custom-Header: value"}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.messageBodyTemplate}</label>
          <p className="text-xs text-slate-400 mb-2">{t.messageBodyTemplateDesc}</p>
          <textarea
            value={webhookTemplate}
            onChange={(e) => onWebhookTemplateChange(e.target.value)}
            className="w-full h-32 font-mono text-sm bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
            placeholder={'{\n  "chat_id": 00000000,\n  "text": "$title:$content"\n}'}
          />
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <button
            onClick={onTestSendDirect}
            disabled={isTestSending}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isTestSending && <Loader2 size={16} className="animate-spin" />}
            {t.directTestWebhook}
          </button>
          <button
            onClick={onTestSendQStash}
            disabled={isTestSending}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isTestSending && <Loader2 size={16} className="animate-spin" />}
            {t.testViaQstash}
          </button>
        </div>

        <hr className="border-slate-100 dark:border-slate-800 my-4" />

        <div className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="text-blue-500" size={20} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">{t.reviewReminderSchedule}</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t.reviewReminderScheduleDesc}
          </p>

          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 transition-colors">{t.reminderDays}</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(day => {
                  const isSelected = scheduleConfig.daysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      disabled={scheduleIsLoading}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${isSelected
                        ? 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/20'
                        : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border-blue-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500'
                      }`}
                    >
                      {weekdayLabels[day.value]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.reminderTime}</label>
                <input
                  type="time"
                  value={scheduleConfig.time}
                  onChange={(e) => onScheduleConfigChange({ ...scheduleConfig, time: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 transition-colors">{t.reminderTimezone}</label>
                <select
                  value={selectedTimezone}
                  onChange={(e) => onScheduleConfigChange({ ...scheduleConfig, timezone: e.target.value })}
                  disabled={scheduleIsLoading}
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200"
                >
                  {timezoneOptions.map(timezone => (
                    <option key={timezone} value={timezone}>{timezone}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={onCreateSchedule}
                disabled={scheduleIsLoading || scheduleConfig.daysOfWeek.length === 0}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {scheduleIsLoading && <Loader2 size={16} className="animate-spin" />}
                {t.saveReminder}
              </button>
            </div>
          </div>

          {hasSchedule && (
            <div className="bg-blue-50 dark:bg-slate-800/50 p-4 rounded-xl flex items-center justify-between border border-blue-100 dark:border-slate-700 mb-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.mojoReviewReminder}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                  {isSchedulePaused ? <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> : <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
                  {isSchedulePaused ? t.paused : t.running}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onToggleSchedule(primaryScheduleId, !isSchedulePaused)}
                  disabled={scheduleIsLoading}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                  {isSchedulePaused ? t.resume : t.pause}
                </button>
                <button
                  onClick={() => onDeleteSchedule(primaryScheduleId)}
                  disabled={scheduleIsLoading}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {t.delete}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{t.qstashScheduleManagement}</h4>
                <p className="text-xs text-slate-400 mt-1">{t.qstashScheduleManagementDesc}</p>
              </div>
              <button
                onClick={onRefreshSchedules}
                disabled={scheduleIsLoading}
                className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {scheduleIsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t.refresh}
              </button>
            </div>

            {schedules.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                {t.noQstashSchedules}
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(schedule => (
                  <div key={schedule.scheduleId} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 break-all">{schedule.scheduleId}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${schedule.isPaused ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                            {schedule.isPaused ? t.paused : t.running}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">{schedule.cron}</p>
                        <p className="text-xs text-slate-400 mt-1 truncate" title={schedule.destination}>{schedule.method} {schedule.destination}</p>
                        <p className="text-xs text-slate-400 mt-1">{t.nextSchedule}: {formatScheduleTime(schedule.nextScheduleTime)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onToggleSchedule(schedule.scheduleId, !schedule.isPaused)}
                          disabled={scheduleIsLoading}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                          {schedule.isPaused ? t.resume : t.pause}
                        </button>
                        <button
                          onClick={() => onDeleteSchedule(schedule.scheduleId)}
                          disabled={scheduleIsLoading}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
