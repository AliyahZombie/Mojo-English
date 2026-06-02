import { createClient, type RealtimeChannel, type RealtimePresenceState, type SupabaseClient } from '@supabase/supabase-js';

const CLIENT_ID_STORAGE_KEY = 'mojo-analytics-client-id';
const USAGE_FLUSH_INTERVAL_MS = 60_000;
const MIN_USAGE_DURATION_SECONDS = 3;

type MojoPresence = {
  clientId: string;
  sessionId: string;
  onlineAt: string;
};

type UsageInterval = {
  client_id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  timezone: string;
  local_date: string;
  local_hour: number;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (char) => {
    const value = Number(char);
    const randomValue = crypto.getRandomValues(new Uint8Array(1))[0];
    return (value ^ (randomValue & (15 >> (value / 4)))).toString(16);
  });
}

function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const clientId = createId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  return clientId;
}

function getTimeFields(startedAt: Date): Pick<UsageInterval, 'timezone' | 'local_date' | 'local_hour'> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localDate = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(startedAt.getDate()).padStart(2, '0')}`;

  return {
    timezone,
    local_date: localDate,
    local_hour: startedAt.getHours(),
  };
}

class MojoAnalyticsSession {
  private readonly client: SupabaseClient;
  private readonly clientId: string;
  private readonly sessionId: string;
  private readonly onOnlineCountChange: (count: number) => void;
  private channel: RealtimeChannel | null = null;
  private intervalId: number | null = null;
  private activeStartedAt: Date | null = null;
  private disposed = false;

  constructor(client: SupabaseClient, onOnlineCountChange: (count: number) => void) {
    this.client = client;
    this.clientId = getClientId();
    this.sessionId = createId();
    this.onOnlineCountChange = onOnlineCountChange;
  }

  start() {
    this.startPresence();
    this.startUsageTracking();
  }

  dispose() {
    this.disposed = true;
    this.flushUsageInterval();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handlePageHide);
    this.onOnlineCountChange(0);
  }

  private startPresence() {
    this.channel = this.client.channel('mojo-online-users', {
      config: {
        presence: {
          key: this.clientId,
        },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        if (!this.channel) return;
        this.onOnlineCountChange(this.countPresence(this.channel.presenceState<MojoPresence>()));
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || !this.channel || this.disposed) return;
        await this.channel.track({
          clientId: this.clientId,
          sessionId: this.sessionId,
          onlineAt: new Date().toISOString(),
        });
      });
  }

  private countPresence(state: RealtimePresenceState<MojoPresence>): number {
    return Object.keys(state).length;
  }

  private startUsageTracking() {
    this.activeStartedAt = new Date();
    this.intervalId = window.setInterval(() => this.flushUsageInterval(), USAGE_FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushUsageInterval();
      return;
    }
    this.activeStartedAt = new Date();
  };

  private handlePageHide = () => {
    this.flushUsageInterval();
  };

  private flushUsageInterval() {
    if (!this.activeStartedAt) return;

    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - this.activeStartedAt.getTime()) / 1000);
    if (durationSeconds < MIN_USAGE_DURATION_SECONDS) {
      this.activeStartedAt = endedAt;
      return;
    }

    const startedAt = this.activeStartedAt;
    const payload: UsageInterval = {
      client_id: this.clientId,
      session_id: this.sessionId,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      ...getTimeFields(startedAt),
    };

    this.activeStartedAt = endedAt;
    void this.client.from('mojo_usage_intervals').insert(payload);
  }
}

export function startMojoAnalytics(onOnlineCountChange: (count: number) => void): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const session = new MojoAnalyticsSession(client, onOnlineCountChange);
  session.start();
  return () => session.dispose();
}
