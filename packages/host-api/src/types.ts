export type HostProvider = "github" | "gitlab" | "bitbucket" | "azuredevops";

export type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "pending"
  | "unknown";

export interface PullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged" | "unknown";
  authorLogin?: string;
  authorAvatarUrl?: string;
  headRef?: string;
  baseRef?: string;
  draft?: boolean;
  updatedAt?: string;
  /** CI / check-suite rollup when fetched. */
  ciStatus?: CheckConclusion;
  mergeable?: boolean | null;
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "unknown";
  authorLogin?: string;
  authorAvatarUrl?: string;
  body?: string;
}

export interface HostUser {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface HostClientOptions {
  /** Injected fetch (defaults to globalThis.fetch when available). */
  fetch?: typeof fetch;
  /** Bearer / PAT token. */
  token?: string;
  /** API base URL override for self-hosted. */
  baseUrl?: string;
}

export class RateLimitError extends Error {
  readonly status = 403;
  readonly resetAt?: number;

  constructor(message: string, resetAt?: number) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

/** Last-known cache entry used when rate-limited or offline. */
export interface CachedValue<T> {
  value: T;
  fetchedAt: number;
  key: string;
}
