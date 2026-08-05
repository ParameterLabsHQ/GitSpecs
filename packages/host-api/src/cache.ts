import type { CachedValue } from "./types.js";

/**
 * Simple in-memory last-known cache for host API responses (P21 resilience).
 * Pure — no timers; callers decide TTL.
 */
export class HostApiCache {
  private readonly store = new Map<string, CachedValue<unknown>>();

  get<T>(key: string, maxAgeMs?: number): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (maxAgeMs != null && Date.now() - hit.fetchedAt >= maxAgeMs) {
      return undefined;
    }
    return hit.value as T;
  }

  /** Return stale value even past TTL (for rate-limit fallback). */
  getStale<T>(key: string): T | undefined {
    return this.store.get(key)?.value as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { key, value, fetchedAt: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}

export function cacheKey(parts: Array<string | number | undefined>): string {
  return parts.map((p) => String(p ?? "")).join("|");
}
