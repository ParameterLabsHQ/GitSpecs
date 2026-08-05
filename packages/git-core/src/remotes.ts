import type { GitRepository } from "./repository.js";

/** Named remote with optional fetch URL. */
export interface RemoteInfo {
  name: string;
  /** Fetch URL when configured. */
  fetchUrl?: string;
  /** Push URL when different from fetch; otherwise may equal fetch. */
  pushUrl?: string;
}

export class RemotesApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * List remotes with URLs via `git remote -v`.
   * Empty remote list → [].
   */
  async list(): Promise<RemoteInfo[]> {
    const result = await this.repo.exec(["remote", "-v"], { allowFailure: true });
    if (result.code !== 0) return [];
    return parseRemoteVerbose(result.stdout);
  }

  /** Fetch one remote or all (`git fetch`). */
  async fetch(options: { remote?: string } = {}): Promise<void> {
    // Delegate semantics match branches.fetch
    await this.repo.branches.fetch({ remote: options.remote });
  }

  async getUrl(remote = "origin"): Promise<string | undefined> {
    return this.repo.branches.getRemoteUrl(remote);
  }
}

/**
 * Parse `git remote -v` lines:
 *   name\turl (fetch)
 *   name\turl (push)
 */
export function parseRemoteVerbose(stdout: string): RemoteInfo[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];
  const map = new Map<string, RemoteInfo>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // name <whitespace> url (fetch|push)
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)\s*$/);
    if (!m) continue;
    const [, name, url, kind] = m;
    const entry = map.get(name!) ?? { name: name! };
    if (kind === "fetch") entry.fetchUrl = url;
    else entry.pushUrl = url;
    map.set(name!, entry);
  }
  return [...map.values()];
}
