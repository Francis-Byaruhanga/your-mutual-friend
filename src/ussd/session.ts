import { config } from '../config.js';

export interface Session {
  readonly sessionId: string;
  readonly phoneNumber: string;
  readonly networkCode: string;
  readonly serviceCode: string;
  /** Identifies which flow owns the session, e.g. "signup" or "claim.ticket". */
  readonly state: string;
  /** Flow specific data accumulated so far. */
  readonly data: Record<string, unknown>;
  lastTouchedAt: number;
  /** Input history, for logging and diagnostics. */
  readonly history: string[];
  /** States already visited, so "0. Back" can rewind one screen at a time. */
  readonly stateStack: string[];
}

export interface SessionStore {
  get(sessionId: string): Session | undefined;
  save(session: Session): Session;
  update(sessionId: string, changes: Partial<Session>): Session;
  delete(sessionId: string): void;
  sweep(now?: number): number;
  clear(): void;
  size(): number;
}

export function createSessionStore(ttlMinutes: number = config.SESSION_TTL_MINUTES): SessionStore {
  const ttlMs = ttlMinutes * 60_000;
  const sessions = new Map<string, Session>();

  return {
    get(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return undefined;
      }
      if (Date.now() - session.lastTouchedAt > ttlMs) {
        sessions.delete(sessionId);
        return undefined;
      }
      return session;
    },

    save(session) {
      const stored: Session = { ...session, lastTouchedAt: Date.now() };
      sessions.set(session.sessionId, stored);
      return stored;
    },

    update(sessionId, changes) {
      const existing = this.get(sessionId);
      if (!existing) {
        throw new Error(`Cannot update unknown session ${sessionId}`);
      }
      const merged: Session = {
        ...existing,
        ...changes,
        sessionId: existing.sessionId,
        lastTouchedAt: Date.now(),
      };
      sessions.set(sessionId, merged);
      return merged;
    },

    delete(sessionId) {
      sessions.delete(sessionId);
    },

    sweep(now = Date.now()) {
      let removed = 0;
      for (const [sessionId, session] of sessions) {
        if (now - session.lastTouchedAt > ttlMs) {
          sessions.delete(sessionId);
          removed += 1;
        }
      }
      return removed;
    },

    clear() {
      sessions.clear();
    },

    size() {
      return sessions.size;
    },
  };
}

/**
 * Expired sessions accumulate if nobody ever drives traffic. A cheap unref'd
 * interval keeps memory flat without holding the process open on shutdown.
 */
export function scheduleSessionSweep(store: SessionStore): NodeJS.Timeout {
  const timer = setInterval(() => {
    const removed = store.sweep();
    if (removed > 0) {
      console.info(`[ussd] swept ${removed} expired session(s)`);
    }
  }, 5 * 60_000);

  timer.unref();
  return timer;
}
