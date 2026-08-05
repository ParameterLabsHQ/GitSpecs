export type HostProvider = "github" | "gitlab";

export interface PullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged" | "unknown";
  authorLogin?: string;
  headRef?: string;
  baseRef?: string;
  draft?: boolean;
  updatedAt?: string;
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "unknown";
  authorLogin?: string;
}

export interface HostClientOptions {
  /** Injected fetch (defaults to globalThis.fetch when available). */
  fetch?: typeof fetch;
  /** Bearer / PAT token. */
  token?: string;
  /** API base URL override for self-hosted. */
  baseUrl?: string;
}
