import { useAppStore } from '../store/useAppStore';
import { Client } from '@upstash/qstash';

export class NotificationService {
  private static getHeaders() {
    const { webhookHeaders } = useAppStore.getState();
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


  private static getParsedBody(title: string, content: string) {
    const { webhookTemplate } = useAppStore.getState();
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

  private static getReplacedUrl() {
    const { webhookUrl } = useAppStore.getState();
    return webhookUrl
      .replace(/\$url/g, window.location.origin)
      // If the user wants to substitute custom environment variables into the URL, 
      // they can be supported here in the future.
      ;
  }

  private static canSend() {
    const { upstashQstashToken, webhookUrl } = useAppStore.getState();
    return !!upstashQstashToken && !!webhookUrl;
  }

  /**
   * Schedule a notification for when a specific word is due.
   * To prevent spam, we can use Upstash-Deduplication-Id
   */
  static async scheduleWordDueNotification(word: string, dueTime: number) {
    if (!this.canSend()) return;
    const now = Date.now();
    if (dueTime <= now) return; // Already due

    const { upstashQstashToken } = useAppStore.getState();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();
    
    const client = new Client({ token: upstashQstashToken });

    const body = this.getParsedBody("Word Due Reminder", `Review time for: ${word} is now!`);
    if (!body) return;

    try {
      await client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: Math.floor(dueTime / 1000), // UNIX timestamp
        deduplicationId: `word-due-${word}-${Math.floor(dueTime / 1000)}`
      });
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

    const { upstashQstashToken } = useAppStore.getState();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();

    const client = new Client({ token: upstashQstashToken });
    const dateStr = new Date(dueTimeMs).toISOString().split('T')[0];

    const body = this.getParsedBody("Learning Time!", `You have words due for review. Let's keep the streak alive!`);
    if (!body) return;

    try {
      await client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: Math.floor(dueTimeMs / 1000),
        deduplicationId: `batch-due-${dateStr}`
      });
      console.log(`Scheduled batch due notification for ${dateStr}`);
    } catch (e) {
      console.error("Failed to schedule batch due notification", e);
    }
  }

  public static readonly SCHEDULE_ID = "mojo-daily-review";

  static async getDailySchedule() {
    if (!this.canSend()) return null;
    const { upstashQstashToken } = useAppStore.getState();
    const client = new Client({ token: upstashQstashToken });
    try {
      const res = await client.schedules.get(this.SCHEDULE_ID);
      return res;
    } catch (e: any) {
      if (e.message && e.message.includes("not found")) return null;
      console.error("Failed to get daily schedule", e);
      return null;
    }
  }

  static async upsertDailySchedule(cron: string) {
    if (!this.canSend()) throw new Error("Please configure QStash settings first");
    const { upstashQstashToken } = useAppStore.getState();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();
    const client = new Client({ token: upstashQstashToken });

    const body = this.getParsedBody("Daily Review Reminder", "It's time for your daily English learning session!");
    if (!body) throw new Error("Invalid body template");

    await client.schedules.create({
      destination: finalUrl,
      scheduleId: this.SCHEDULE_ID,
      cron,
      body: JSON.stringify(body),
      headers,
    });
  }

  static async deleteDailySchedule() {
    if (!this.canSend()) return;
    const { upstashQstashToken } = useAppStore.getState();
    const client = new Client({ token: upstashQstashToken });
    try {
      await client.schedules.delete(this.SCHEDULE_ID);
    } catch (e) {
      console.error("Failed to delete daily schedule", e);
    }
  }

  static async toggleDailySchedule(pause: boolean) {
    if (!this.canSend()) return;
    const { upstashQstashToken } = useAppStore.getState();
    const client = new Client({ token: upstashQstashToken });
    try {
      if (pause) {
        await client.schedules.pause({ schedule: this.SCHEDULE_ID });
      } else {
        await client.schedules.resume({ schedule: this.SCHEDULE_ID });
      }
    } catch (e) {
      console.error("Failed to toggle daily schedule", e);
    }
  }

  static async scheduleDailyReview(dueTimeMs: number) {
    // If we have a CRON schedule, we don't need to manually schedule the daily review after every session.
    // However, if the user hasn't set up a CRON, we could optionally do a dynamic schedule.
    // Let's just keep this as a functional fallback, or the user can rely entirely on the CRON.
    if (!this.canSend()) return;
    const now = Date.now();
    if (dueTimeMs <= now) return;

    // Check if there is an active CRON schedule to avoid duplicate notifications
    const cronSchedule = await this.getDailySchedule();
    if (cronSchedule && !cronSchedule.isPaused) {
        return; // Let the CRON handle it
    }

    const { upstashQstashToken } = useAppStore.getState();
    const finalUrl = this.getReplacedUrl();
    const headers = this.getHeaders();
    const client = new Client({ token: upstashQstashToken });

    const dateStr = new Date(dueTimeMs).toISOString().split('T')[0];

    const body = this.getParsedBody("Daily Review Reminder", `It's time for your daily English learning session!`);
    if (!body) return;

    try {
      await client.publishJSON({
        url: finalUrl,
        body,
        headers,
        notBefore: Math.floor(dueTimeMs / 1000),
        deduplicationId: `daily-review-${dateStr}`
      });
      console.log(`Scheduled daily review notification for ${dateStr}`);
    } catch (e) {
      console.error("Failed to schedule daily review notification", e);
    }
  }
}
