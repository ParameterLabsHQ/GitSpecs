import type { BlameLine, GitRepository } from "@gitspecs/git-core";

interface CacheEntry {
  /** Document version, mtime, or other invalidation token */
  versionKey: string;
  rows: BlameLine[];
}

/**
 * Shared in-memory blame cache for decorations, status bar, CodeLens, and hovers.
 * Keyed by repo root + absolute file path; invalidated when versionKey changes.
 */
export class BlameCache {
  private readonly entries = new Map<string, CacheEntry>();

  private key(repoRoot: string, file: string): string {
    return `${repoRoot}\0${file}`;
  }

  /**
   * Return blame rows for a file, reusing cache when versionKey matches.
   */
  async get(
    repo: GitRepository,
    file: string,
    versionKey: string,
  ): Promise<BlameLine[]> {
    const k = this.key(repo.root, file);
    const hit = this.entries.get(k);
    if (hit && hit.versionKey === versionKey) {
      return hit.rows;
    }
    const rows = await repo.blame.blame({ file });
    this.entries.set(k, { versionKey, rows });
    return rows;
  }

  /** Look up a single 1-based line from a cached or freshly fetched blame. */
  async getLine(
    repo: GitRepository,
    file: string,
    versionKey: string,
    lineNumber: number,
  ): Promise<BlameLine | undefined> {
    const rows = await this.get(repo, file, versionKey);
    return rows.find((r) => r.lineNumber === lineNumber);
  }

  invalidate(repoRoot?: string, file?: string): void {
    if (repoRoot == null) {
      this.entries.clear();
      return;
    }
    if (file == null) {
      const prefix = `${repoRoot}\0`;
      for (const k of this.entries.keys()) {
        if (k.startsWith(prefix)) this.entries.delete(k);
      }
      return;
    }
    this.entries.delete(this.key(repoRoot, file));
  }

  clear(): void {
    this.entries.clear();
  }
}
