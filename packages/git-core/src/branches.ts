import type { GitRepository } from "./repository.js";

export interface BranchInfo {
  name: string;
  refName: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ahead: number;
  behind: number;
  detached: boolean;
  commit?: string;
}

/** One path from `git diff --name-status` (and rename/copy variants). */
export interface NameStatusEntry {
  /** Status letter(s): A/M/D/T/U or R###/C### for rename/copy. */
  status: string;
  /** Path after the change (new path for renames). */
  path: string;
  /** Previous path when status is rename/copy. */
  oldPath?: string;
}

export interface CompareResult {
  ahead: number;
  behind: number;
  shortstat: string;
  base: string;
  /** Head ref name, or the literal `"WORKING_TREE"` when comparing against the worktree. */
  head: string;
  /** Changed paths from `git diff --name-status` (same range as shortstat). */
  files: NameStatusEntry[];
  /** True when `head` is the working tree (not a commit). */
  againstWorkingTree: boolean;
}

export interface CompareOptions {
  base: string;
  /**
   * Tip ref to compare. Ignored when `againstWorkingTree` is true.
   * Required when not comparing to the working tree.
   */
  head?: string;
  /**
   * When true, compare `base` tree → working tree (index + unstaged).
   *
   * **Semantics:** uses `git diff base` (two-dot / worktree), not triple-dot.
   * Ahead/behind still report `base...HEAD` commit divergence so the UI can
   * show branch drift; file list + shortstat reflect uncommitted + committed
   * changes from `base` to the working tree.
   */
  againstWorkingTree?: boolean;
}

export class BranchesApi {
  constructor(private readonly repo: GitRepository) {}

  async list(options: { includeRemotes?: boolean } = {}): Promise<BranchInfo[]> {
    const includeRemotes = options.includeRemotes ?? true;
    const format = [
      "%(refname)",
      "%(refname:short)",
      "%(objectname)",
      "%(HEAD)",
      "%(upstream)",
      "%(upstream:short)",
      "%(upstream:track)",
    ].join("%00");

    const patterns = includeRemotes
      ? ["refs/heads", "refs/remotes"]
      : ["refs/heads"];

    const result = await this.repo.exec(
      ["for-each-ref", `--format=${format}`, ...patterns],
      { allowFailure: true },
    );

    if (result.code !== 0) {
      return [];
    }

    const branches: BranchInfo[] = [];
    const lines = result.stdout.split("\n").filter((l) => l.length > 0);

    for (const line of lines) {
      const parts = line.split("\0");
      const [refName, shortName, commit, headMark, _upstreamFull, upstreamShort, track] = parts;
      if (!refName || !shortName) continue;

      // Skip remote HEAD symbolic refs like origin/HEAD
      if (refName.startsWith("refs/remotes/") && shortName.endsWith("/HEAD")) {
        continue;
      }

      const remote = refName.startsWith("refs/remotes/");
      const { ahead, behind } = parseTrack(track ?? "");
      let upstreamRemote: string | undefined;
      let upstreamBranch: string | undefined;
      if (upstreamShort) {
        const slash = upstreamShort.indexOf("/");
        if (slash > 0) {
          upstreamRemote = upstreamShort.slice(0, slash);
          upstreamBranch = upstreamShort.slice(slash + 1);
        }
      }

      branches.push({
        name: shortName,
        refName,
        current: headMark === "*",
        remote,
        upstream: upstreamShort || undefined,
        upstreamRemote,
        upstreamBranch,
        ahead,
        behind,
        detached: false,
        commit,
      });
    }

    // Detect detached HEAD
    const headSym = await this.repo.exec(["symbolic-ref", "-q", "HEAD"], { allowFailure: true });
    if (headSym.code !== 0) {
      const sha = (await this.repo.exec(["rev-parse", "HEAD"])).stdout.trim();
      branches.unshift({
        name: `(detached ${sha.slice(0, 7)})`,
        refName: "HEAD",
        current: true,
        remote: false,
        ahead: 0,
        behind: 0,
        detached: true,
        commit: sha,
      });
    }

    return branches;
  }

  async create(options: { name: string; startPoint?: string }): Promise<void> {
    const args = ["branch", options.name];
    if (options.startPoint) {
      args.push(options.startPoint);
    }
    await this.repo.exec(args);
  }

  async rename(options: { oldName: string; newName: string }): Promise<void> {
    await this.repo.exec(["branch", "-m", options.oldName, options.newName]);
  }

  async delete(options: { name: string; force?: boolean }): Promise<void> {
    await this.repo.exec(["branch", options.force ? "-D" : "-d", options.name]);
  }

  async checkout(options: {
    name?: string;
    commit?: string;
    create?: boolean;
  }): Promise<void> {
    if (options.create && options.name) {
      const args = ["switch", "-c", options.name];
      if (options.commit) {
        args.push(options.commit);
      }
      await this.repo.exec(args);
      return;
    }
    if (options.name) {
      await this.repo.exec(["switch", options.name]);
      return;
    }
    if (options.commit) {
      await this.repo.exec(["switch", "--detach", options.commit]);
      return;
    }
    throw new Error("checkout requires name or commit");
  }

  async switchTo(nameOrCommit: string, options: { create?: boolean; startPoint?: string } = {}): Promise<void> {
    if (options.create) {
      const args = ["switch", "-c", nameOrCommit];
      if (options.startPoint) {
        args.push(options.startPoint);
      }
      await this.repo.exec(args);
      return;
    }

    // Prefer plain switch (DWIM: local branch or unique remote-tracking branch).
    const switched = await this.repo.exec(["switch", nameOrCommit], { allowFailure: true });
    if (switched.code === 0) {
      return;
    }

    // Explicit remote-tracking ref like origin/feature
    const isRemote = await this.repo.exec(
      ["show-ref", "--verify", "--quiet", `refs/remotes/${nameOrCommit}`],
      { allowFailure: true },
    );
    if (isRemote.code === 0) {
      const short = nameOrCommit.includes("/")
        ? nameOrCommit.slice(nameOrCommit.indexOf("/") + 1)
        : nameOrCommit;
      await this.repo.exec(["switch", "-c", short, "--track", nameOrCommit]);
      return;
    }

    // Commit / tag / other ref — detach
    await this.repo.exec(["switch", "--detach", nameOrCommit]);
  }

  async setUpstream(options: {
    branch: string;
    remote: string;
    remoteBranch: string;
  }): Promise<void> {
    await this.repo.exec([
      "branch",
      `--set-upstream-to=${options.remote}/${options.remoteBranch}`,
      options.branch,
    ]);
  }

  async publish(options: { branch: string; remote?: string }): Promise<void> {
    const remote = options.remote ?? "origin";
    await this.repo.exec(["push", "-u", remote, options.branch], { timeoutMs: 120_000 });
  }

  async push(options: { remote?: string; branch?: string } = {}): Promise<void> {
    const args = ["push"];
    if (options.remote) {
      args.push(options.remote);
      if (options.branch) {
        args.push(options.branch);
      }
    }
    await this.repo.exec(args, { timeoutMs: 120_000 });
  }

  async pull(options: { remote?: string; branch?: string } = {}): Promise<void> {
    const args = ["pull"];
    if (options.remote) {
      args.push(options.remote);
      if (options.branch) {
        args.push(options.branch);
      }
    }
    await this.repo.exec(args, { timeoutMs: 120_000 });
  }

  async fetch(options: { remote?: string } = {}): Promise<void> {
    const args = ["fetch"];
    if (options.remote) {
      args.push(options.remote);
    } else {
      args.push("--all");
    }
    await this.repo.exec(args, { timeoutMs: 120_000 });
  }

  async deleteRemote(options: { remote: string; name: string }): Promise<void> {
    await this.repo.exec(["push", options.remote, "--delete", options.name], {
      timeoutMs: 120_000,
    });
  }

  async merge(options: { ref: string }): Promise<void> {
    await this.repo.exec(["merge", "--no-edit", options.ref]);
  }

  async rebase(options: { onto: string }): Promise<void> {
    await this.repo.exec(["rebase", options.onto]);
  }

  async cherryPick(options: { commits: string[] }): Promise<void> {
    if (options.commits.length === 0) {
      throw new Error("cherryPick requires at least one commit");
    }
    await this.repo.exec(["cherry-pick", ...options.commits]);
  }

  async createFromCommit(options: { name: string; commit: string }): Promise<void> {
    await this.repo.exec(["branch", options.name, options.commit]);
  }

  /**
   * Compare two refs (triple-dot merge-base style) or a ref vs the working tree.
   *
   * **Two-ref:** `base...head` for ahead/behind, shortstat, and name-status.
   * **Working tree:** shortstat + name-status via `git diff base` (worktree);
   * ahead/behind from `base...HEAD` (committed divergence only).
   */
  async compare(options: CompareOptions): Promise<CompareResult> {
    const againstWorkingTree = Boolean(options.againstWorkingTree);
    const base = options.base;
    if (!base) {
      throw new Error("compare requires a base ref");
    }
    if (!againstWorkingTree && !options.head) {
      throw new Error("compare requires head ref when not against working tree");
    }

    const headLabel = againstWorkingTree ? "WORKING_TREE" : options.head!;

    // Ahead/behind always uses commits (base...HEAD or base...head).
    const tipForCounts = againstWorkingTree ? "HEAD" : options.head!;
    const revList = await this.repo.exec([
      "rev-list",
      "--left-right",
      "--count",
      `${base}...${tipForCounts}`,
    ]);
    const counts = revList.stdout.trim().split(/\s+/);
    const behind = Number(counts[0] ?? 0);
    const ahead = Number(counts[1] ?? 0);

    // Diff range: triple-dot for two commits; plain base for working tree.
    const diffRange = againstWorkingTree ? base : `${base}...${options.head!}`;

    const stat = await this.repo.exec(["diff", "--shortstat", diffRange], {
      allowFailure: true,
    });

    const nameStatus = await this.repo.exec(
      ["diff", "--name-status", "-z", diffRange],
      { allowFailure: true },
    );

    return {
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
      shortstat: (stat.stdout || "").trim(),
      base,
      head: headLabel,
      files: parseNameStatus(nameStatus.stdout || ""),
      againstWorkingTree,
    };
  }

  async recentCommits(limit = 50): Promise<Array<{ sha: string; subject: string }>> {
    const result = await this.repo.exec([
      "log",
      `-n${limit}`,
      "--format=%H%x00%s",
    ]);
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, subject] = line.split("\0");
        return { sha: sha!, subject: subject ?? "" };
      });
  }

  async getRemoteUrl(remote = "origin"): Promise<string | undefined> {
    const result = await this.repo.exec(["remote", "get-url", remote], { allowFailure: true });
    if (result.code !== 0) return undefined;
    return result.stdout.trim() || undefined;
  }

  async listRemotes(): Promise<string[]> {
    const result = await this.repo.exec(["remote"], { allowFailure: true });
    if (result.code !== 0) return [];
    return result.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

function parseTrack(track: string): { ahead: number; behind: number } {
  // e.g. [ahead 2, behind 1] or [ahead 2] or [behind 1] or [gone]
  let ahead = 0;
  let behind = 0;
  const aheadMatch = track.match(/ahead\s+(\d+)/);
  const behindMatch = track.match(/behind\s+(\d+)/);
  if (aheadMatch) ahead = Number(aheadMatch[1]);
  if (behindMatch) behind = Number(behindMatch[1]);
  return { ahead, behind };
}

/**
 * Parse `git diff --name-status -z` stdout.
 *
 * Records are NUL-delimited. Status-only fields (A/M/D/…) are followed by one
 * path; rename/copy (`R###` / `C###`) are followed by old path then new path.
 * Empty / whitespace-only stdout → empty array (no throw).
 */
export function parseNameStatus(stdout: string): NameStatusEntry[] {
  if (!stdout || !stdout.replace(/\0/g, "").trim()) return [];

  // Split on NUL; trailing empty segment from final NUL is fine.
  const parts = stdout.split("\0");
  const entries: NameStatusEntry[] = [];
  let i = 0;
  while (i < parts.length) {
    const status = parts[i];
    if (status == null || status === "") {
      i += 1;
      continue;
    }
    // Rename/copy: R100\0old\0new  or status may be "R100" as one field
    if (/^[RC]\d*/.test(status)) {
      const oldPath = parts[i + 1] ?? "";
      const newPath = parts[i + 2] ?? "";
      if (oldPath || newPath) {
        entries.push({
          status,
          path: newPath || oldPath,
          oldPath: oldPath || undefined,
        });
      }
      i += 3;
      continue;
    }
    // Single-path statuses: A, M, D, T, U, typechange, etc.
    if (/^[A-Z]/.test(status)) {
      const path = parts[i + 1] ?? "";
      if (path) {
        entries.push({ status, path });
      }
      i += 2;
      continue;
    }
    // Unrecognized token — skip to avoid infinite loop
    i += 1;
  }
  return entries;
}
