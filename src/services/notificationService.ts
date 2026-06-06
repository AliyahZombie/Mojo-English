import { useAppStore } from '../store/useAppStore';
import { Client } from '@upstash/qstash';
import { getLocalDateString } from '../store/useFsrsStore';

const QSTASH_EU_BASE_URL = 'https://qstash.upstash.io';
const QSTASH_US_BASE_URL = 'https://qstash-us-east-1.upstash.io';
const QSTASH_REGION_BASE_URLS = [QSTASH_EU_BASE_URL, QSTASH_US_BASE_URL];
export const QSTASH_CRON_TZ_PREFIX = 'CRON_TZ=';
const DEFAULT_DAILY_REVIEW_TIME = '10:00';

export type ReviewScheduleConfig = {
  daysOfWeek: number[];
  time: string;
  timezone?: string;
};

export type ManagedQStashSchedule = {
  scheduleId: string;
  cron: string;
  destination: string;
  method: string;
  isPaused: boolean;
  createdAt: number;
  nextScheduleTime?: number;
  lastScheduleTime?: number;
  label?: string;
};

export type NotificationConfigOverride = {
  token: string;
  webhookUrl: string;
  webhookHeaders: string;
  webhookTemplate: string;
};

export function getQStashBaseUrl(token: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? token));
    return typeof payload.Address === 'string' ? payload.Address : undefined;
  } catch {
    return undefined;
  }
}

export function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getCronTimezone(timezone?: string) {
  const normalizedTimezone = (timezone || getLocalTimeZone()).trim();
  return normalizedTimezone && !/\s/.test(normalizedTimezone) ? normalizedTimezone : 'UTC';
}

function makeClient(token: string, baseUrl?: string) {
  return new Client({ token, ...(baseUrl ? { baseUrl } : {}) });
}

function getQStashBaseUrlCandidates(token: string): string[] {
  const embeddedBaseUrl = getQStashBaseUrl(token);
  const candidates = embeddedBaseUrl ? [embeddedBaseUrl, ...QSTASH_REGION_BASE_URLS] : QSTASH_REGION_BASE_URLS;
  return Array.from(new Set(candidates.map(url => url.replace(/\/$/, ''))));
}

function isQStashRegionMismatch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('not found in this region');
}

export async function withQStashClient<T>(token: string, operation: (client: Client) => Promise<T>): Promise<T> {
  const baseUrls = getQStashBaseUrlCandidates(token);
  let lastError: unknown;

  for (const baseUrl of baseUrls) {
    try {
      return await operation(makeClient(token, baseUrl));
    } catch (error) {
      lastError = error;
      if (!isQStashRegionMismatch(error)) break;
    }
  }

  throw lastError;
}

export class NotificationService {
  private static getConfig(config?: NotificationConfigOverride) {
    if (config) return config;
    const { upstashQstashToken, webhookUrl, webhookHeaders, webhookTemplate } = useAppStore.getState();
    return {
      token: upstashQstashToken,
      webhookUrl,
      webhookHeaders,
      webhookTemplate,
    };
  }

  private static getHeaders(config?: NotificationConfigOverride) {
    const { webhookHeaders } = this.getConfig(config);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhookHeaders) {
      const lines = webhookHeaders.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const k = line.slice(0, colonIdx).trim();
          const v = line.slice(colonIdx + 1).trim();
          headers[k] = v; // QStash client handles 'Upstash-Forward-' implicitly if we use `headers` option?
          // Actually, let's keep it as is, or use the `headers` field in QStash Client options.
        }
      }
    }
    return headers;
  }


  private static getParsedBody(title: string, content: string, config?: NotificationConfigOverride) {
    const { webhookTemplate } = this.getConfig(config);
    const bodyStr = webhookTemplate
      .replace(/\$title/g, title)
      .replace(/\$content/g, content)
      .replace(/\$url/g, window.location.origin);
      
    try {
      return JSON.parse(bodyStr);
    } catch (e) {
      return null;
    }
  }

  private static getReplacedUrl(config?: NotificationConfigOverride) {
    const { webhookUrl } = this.getConfig(config);
    return webhookUrl
      .replace(/\$url/g, window.location.origin)
      // If the user wants to substitute custom environment variables into the URL, 
      // they can be supported here in the future.
      ;
  }

  private static canSend(config?: NotificationConfigOverride) {
    const { token, webhookUrl } = this.getConfig(config);
    return !!token && !!webhookUrl;
  }

  static buildReviewCron({ daysOfWeek, time, timezone }: ReviewScheduleConfig) {
    const [hourPart, minutePart] = time.split(':');
    const hour = Number(hourPart);
    const minute = Number(minutePart);
    const uniqueDays = Array.from(new Set(daysOfWeek)).sort((a, b) => a - b);
    const cronTimezone = getCronTimezone(timezone);

    if (!uniqueDays.length) {
      throw new Error('Please select at least one reminder day');
    }
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Please select a valid reminder time');
    }
    if (uniqueDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('Invalid reminder day selected');
    }

    return `${QSTASH_CRON_TZ_PREFIX}${cronTimezone} ${minute} ${hour} * * ${uniqueDays.join(',')}`;
  }

  /**
   * Schedule a notification for when a specific word is due.
   * To prevent spam, we can use Upstash-Deduplication-Id
   */
  static async scheduleWordDueNotification(word: string, dueTime: number) {
    if (!this.canSend()) return;
    const now = Date.now();
    if (dueTime <= now) return; // Already due

    const { token } = this.getConfig();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();

    const body = this.getParsedBody("Word Due Reminder", `Review time for: ${word} is now!`);
    if (!body) return;

    try {
      await withQStashClient(token, client => client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: Math.floor(dueTime / 1000), // UNIX timestamp
        deduplicationId: `word-due-${word}-${Math.floor(dueTime / 1000)}`
      }));
      console.log(`Scheduled word due notification for ${word}`);
    } catch (e) {
      console.error("Failed to schedule word due notification", e);
    }
  }

  /**
   * Schedule a generic daily reminder or next batch reminder
   */
  static async scheduleNextBatchReminder(dueTimeMs: number) {
    if (!this.canSend()) return;
    const now = Date.now();
    if (dueTimeMs <= now) return;

    const { token } = this.getConfig();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();

    const dueSecond = Math.floor(dueTimeMs / 1000);
    const dateStr = getLocalDateString(new Date(dueTimeMs));

    const body = this.getParsedBody("Learning Time!", `You have words due for review. Let's keep the streak alive!`);
    if (!body) return;

    try {
      await withQStashClient(token, client => client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: dueSecond,
        deduplicationId: `batch-due-${dueSecond}`
      }));
      console.log(`Scheduled batch due notification for ${dateStr}`);
    } catch (e) {
      console.error("Failed to schedule batch due notification", e);
    }
  }

  public static readonly SCHEDULE_ID = "mojo-daily-review";
  private static readonly SCHEDULE_LABEL = "mojo-review";

  static async listSchedules(config?: NotificationConfigOverride): Promise<ManagedQStashSchedule[]> {
    if (!this.canSend(config)) return [];
    const { token } = this.getConfig(config);
    try {
      const schedules = await withQStashClient(token, client => client.schedules.list());
      return schedules.map(schedule => ({
        scheduleId: schedule.scheduleId,
        cron: schedule.cron,
        destination: schedule.destination,
        method: schedule.method,
        isPaused: schedule.isPaused,
        createdAt: schedule.createdAt,
        nextScheduleTime: schedule.nextScheduleTime,
        lastScheduleTime: schedule.lastScheduleTime,
        label: schedule.label,
      }));
    } catch (error) {
      console.error("Failed to list schedules", error);
      return [];
    }
  }

  static async getDailySchedule(config?: NotificationConfigOverride) {
    if (!this.canSend(config)) return null;
    const { token } = this.getConfig(config);
    try {
      const res = await withQStashClient(token, client => client.schedules.get(this.SCHEDULE_ID));
      return res;
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) return null;
      console.error("Failed to get daily schedule", error);
      return null;
    }
  }

  static async upsertDailySchedule(configInput: ReviewScheduleConfig, config?: NotificationConfigOverride) {
    if (!this.canSend(config)) throw new Error("Please configure QStash settings first");
    const { token } = this.getConfig(config);
    const finalUrl = this.getReplacedUrl(config);
    const headers = this.getHeaders(config);
    const cron = this.buildReviewCron(configInput);

    const body = this.getParsedBody("Daily Review Reminder", "It's time for your daily English learning session!", config);
    if (!body) throw new Error("Invalid body template");

    await withQStashClient(token, client => client.schedules.create({
      destination: finalUrl,
      scheduleId: this.SCHEDULE_ID,
      cron,
      body: JSON.stringify(body),
      headers,
      label: this.SCHEDULE_LABEL,
    }));
  }

  static async deleteSchedule(scheduleId: string, config?: NotificationConfigOverride) {
    if (!this.canSend(config)) return;
    const { token } = this.getConfig(config);
    try {
      await withQStashClient(token, client => client.schedules.delete(scheduleId));
    } catch (error) {
      console.error("Failed to delete schedule", error);
    }
  }

  static async deleteDailySchedule(config?: NotificationConfigOverride) {
    await this.deleteSchedule(this.SCHEDULE_ID, config);
  }

  static async toggleSchedule(scheduleId: string, pause: boolean, config?: NotificationConfigOverride) {
    if (!this.canSend(config)) return;
    const { token } = this.getConfig(config);
    try {
      if (pause) {
        await withQStashClient(token, client => client.schedules.pause({ schedule: scheduleId }));
      } else {
        await withQStashClient(token, client => client.schedules.resume({ schedule: scheduleId }));
      }
    } catch (error) {
      console.error("Failed to toggle schedule", error);
    }
  }

  static async toggleDailySchedule(pause: boolean, config?: NotificationConfigOverride) {
    await this.toggleSchedule(this.SCHEDULE_ID, pause, config);
  }

  static async scheduleDailyReview(dueTimeMs: number) {
    if (!this.canSend()) return;
    const now = Date.now();
    if (dueTimeMs <= now) return;

    // If a recurring schedule exists, respect it even when paused.
    const cronSchedule = await this.getDailySchedule();
    if (cronSchedule) {
      return;
    }

    const { token } = this.getConfig();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();

    const dateStr = getLocalDateString(new Date(dueTimeMs));

    const body = this.getParsedBody("Daily Review Reminder", `It's time for your daily English learning session!`);
    if (!body) return;

    try {
      await withQStashClient(token, client => client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: Math.floor(dueTimeMs / 1000),
        deduplicationId: `daily-review-${dateStr}`
      }));
      console.log(`Scheduled daily review notification for ${dateStr}`);
    } catch (e) {
      console.error("Failed to schedule daily review notification", e);
    }
  }

  static getNextDefaultDailyReviewTime(fromMs = Date.now()) {
    const [hourPart, minutePart] = DEFAULT_DAILY_REVIEW_TIME.split(':');
    const next = new Date(fromMs);
    next.setDate(next.getDate() + 1);
    next.setHours(Number(hourPart), Number(minutePart), 0, 0);
    return next.getTime();
  }

  static async scheduleAssistantNotification(title: string, content: string, dueTimeMs: number, deduplicationId: string) {
    if (!this.canSend()) throw new Error("Please configure QStash settings first");
    const now = Date.now();
    if (dueTimeMs <= now) throw new Error("Please choose a future reminder time");

    const { token } = this.getConfig();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();
    const body = this.getParsedBody(title, content);
    if (!body) throw new Error("Invalid body template");

    await withQStashClient(token, client => client.publishJSON({
      url: finalUrl,
      body,
      headers,
      notBefore: Math.floor(dueTimeMs / 1000),
      deduplicationId,
    }));
  }
}
