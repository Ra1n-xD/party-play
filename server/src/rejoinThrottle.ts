export const REJOIN_FAILURE_RETENTION_MS = 5 * 60_000;
export const MAX_REJOIN_FAILURE_IDENTITIES = 10_000;

interface RejoinFailureEntry {
  count: number;
  blockedUntil: number;
  lastFailureAt: number;
}

export class RejoinThrottle {
  private readonly failures = new Map<string, RejoinFailureEntry>();

  isBlocked(identity: string, now = Date.now()): boolean {
    const entry = this.failures.get(identity);
    if (!entry) return false;
    if (now - entry.lastFailureAt >= REJOIN_FAILURE_RETENTION_MS) {
      this.failures.delete(identity);
      return false;
    }
    return now < entry.blockedUntil;
  }

  recordFailure(identity: string, now = Date.now()): void {
    this.pruneExpired(now);
    const previous = this.failures.get(identity);
    const count = Math.min((previous?.count ?? 0) + 1, 6);
    const delayMs = Math.min(60_000, 2 ** count * 1_000);

    if (!previous && this.failures.size >= MAX_REJOIN_FAILURE_IDENTITIES) {
      const oldestIdentity = this.failures.keys().next().value;
      if (oldestIdentity !== undefined) this.failures.delete(oldestIdentity);
    }

    this.failures.set(identity, {
      count,
      blockedUntil: now + delayMs,
      lastFailureAt: now,
    });
  }

  clear(identity: string): void {
    this.failures.delete(identity);
  }

  reset(): void {
    this.failures.clear();
  }

  private pruneExpired(now: number): void {
    for (const [identity, entry] of this.failures) {
      if (now - entry.lastFailureAt >= REJOIN_FAILURE_RETENTION_MS) {
        this.failures.delete(identity);
      }
    }
  }
}
