import path from "node:path";
import type { GitRepository } from "./repository.js";

/** One logical line of blame (working-tree line numbering, 1-based). */
export interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  authorMail?: string;
  authorTime?: number;
  authorTz?: string;
  committer?: string;
  committerTime?: number;
  summary?: string;
  previousSha?: string;
  previousPath?: string;
  filename?: string;
  /** Content of the line without trailing newline */
  content: string;
}

export interface BlameOptions {
  /** Path relative to repo root, or absolute path under the repo */
  file: string;
  /** 1-based start line (inclusive), optional */
  startLine?: number;
  /** 1-based end line (inclusive), optional */
  endLine?: number;
  /** Blame as of this revision (default: working tree / HEAD mix per git blame) */
  rev?: string;
}

export class BlameApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Run `git blame --porcelain` for a file and return structured per-line rows.
   */
  async blame(options: BlameOptions): Promise<BlameLine[]> {
    const rel = toRepoRelative(this.repo.root, options.file);
    const args = ["blame", "--porcelain", "--line-porcelain"];

    if (options.startLine != null || options.endLine != null) {
      const start = options.startLine ?? options.endLine ?? 1;
      const end = options.endLine ?? options.startLine ?? start;
      args.push("-L", `${start},${end}`);
    }

    if (options.rev) {
      args.push(options.rev);
    }

    args.push("--", rel);

    const result = await this.repo.exec(args);
    return parseBlamePorcelain(result.stdout);
  }

  /** Blame a single 1-based line; empty array if out of range. */
  async blameLine(file: string, lineNumber: number, rev?: string): Promise<BlameLine | undefined> {
    const rows = await this.blame({
      file,
      startLine: lineNumber,
      endLine: lineNumber,
      rev,
    });
    return rows[0];
  }
}

export function toRepoRelative(repoRoot: string, file: string): string {
  const abs = path.isAbsolute(file) ? path.normalize(file) : path.resolve(repoRoot, file);
  const root = path.resolve(repoRoot);
  if (abs === root) return ".";
  if (abs.startsWith(root + path.sep)) {
    return abs.slice(root.length + 1).split(path.sep).join("/");
  }
  // Already relative-ish
  return file.split(path.sep).join("/");
}

/**
 * Parse `git blame --line-porcelain` output into BlameLine[].
 * @see https://git-scm.com/docs/git-blame#_the_porcelain_format
 */
export function parseBlamePorcelain(stdout: string): BlameLine[] {
  const lines = stdout.split("\n");
  const commitMeta = new Map<
    string,
    {
      author?: string;
      authorMail?: string;
      authorTime?: number;
      authorTz?: string;
      committer?: string;
      committerTime?: number;
      summary?: string;
      previousSha?: string;
      previousPath?: string;
      filename?: string;
    }
  >();

  const result: BlameLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const header = lines[i];
    if (!header || header.length === 0) {
      i++;
      continue;
    }

    // header: <sha> <orig> <final> [<num>]
    const headerMatch = header.match(/^([0-9a-f]{40}|[0-9a-f]{64})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/i);
    if (!headerMatch) {
      i++;
      continue;
    }

    const sha = headerMatch[1]!;
    const finalLine = Number(headerMatch[3]);
    i++;

    let meta = commitMeta.get(sha);
    if (!meta) {
      meta = {};
      commitMeta.set(sha, meta);
    }

    // Read property lines until content line starting with TAB
    let content = "";
    while (i < lines.length) {
      const line = lines[i]!;
      if (line.startsWith("\t")) {
        content = line.slice(1);
        i++;
        break;
      }
      if (line.startsWith("author ")) {
        meta.author = line.slice("author ".length);
      } else if (line.startsWith("author-mail ")) {
        meta.authorMail = line.slice("author-mail ".length);
      } else if (line.startsWith("author-time ")) {
        meta.authorTime = Number(line.slice("author-time ".length));
      } else if (line.startsWith("author-tz ")) {
        meta.authorTz = line.slice("author-tz ".length);
      } else if (line.startsWith("committer ")) {
        meta.committer = line.slice("committer ".length);
      } else if (line.startsWith("committer-time ")) {
        meta.committerTime = Number(line.slice("committer-time ".length));
      } else if (line.startsWith("summary ")) {
        meta.summary = line.slice("summary ".length);
      } else if (line.startsWith("previous ")) {
        const rest = line.slice("previous ".length).trim();
        const sp = rest.indexOf(" ");
        if (sp > 0) {
          meta.previousSha = rest.slice(0, sp);
          meta.previousPath = rest.slice(sp + 1);
        } else {
          meta.previousSha = rest;
        }
      } else if (line.startsWith("filename ")) {
        meta.filename = line.slice("filename ".length);
      }
      // boundary, etc. ignored
      i++;
    }

    result.push({
      lineNumber: finalLine,
      sha,
      author: meta.author ?? "",
      authorMail: meta.authorMail,
      authorTime: meta.authorTime,
      authorTz: meta.authorTz,
      committer: meta.committer,
      committerTime: meta.committerTime,
      summary: meta.summary,
      previousSha: meta.previousSha,
      previousPath: meta.previousPath,
      filename: meta.filename,
      content,
    });
  }

  return result;
}

/** Format a compact annotation for decorations / status bar. */
export function formatBlameAnnotation(line: BlameLine, options: { maxSummary?: number } = {}): string {
  const max = options.maxSummary ?? 40;
  const when =
    line.authorTime != null
      ? new Date(line.authorTime * 1000).toISOString().slice(0, 10)
      : "";
  let summary = (line.summary ?? "").trim();
  if (summary.length > max) {
    summary = summary.slice(0, max - 1) + "…";
  }
  const shortSha = line.sha.slice(0, 7);
  const parts = [line.author || "unknown", when, shortSha, summary].filter(Boolean);
  return parts.join(" • ");
}
