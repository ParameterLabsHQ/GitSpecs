import type { GitRepository } from "./repository.js";

/** One tag from `git for-each-ref refs/tags`. */
export interface TagInfo {
  name: string;
  /** Object SHA the tag points to (peeled for annotated tags when available). */
  sha: string;
  /** True when the ref is an annotated tag object. */
  annotated: boolean;
  /** Optional subject from annotated tag message (empty for lightweight). */
  message?: string;
}

export interface TagCreateOptions {
  name: string;
  /** Commit/ref to tag (default HEAD). */
  ref?: string;
  /** Annotated tag message; when set, creates `-a -m`. */
  message?: string;
}

export interface TagDeleteOptions {
  name: string;
}

/**
 * Format: name \0 object \0 type \0 subject
 * type is "tag" for annotated, "commit" for lightweight.
 */
export const TAG_LIST_FORMAT = "%(refname:short)%00%(objectname)%00%(objecttype)%00%(subject)";

export class TagsApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * List tags newest-by-creatordate first when available.
   */
  async list(): Promise<TagInfo[]> {
    const result = await this.repo.exec(
      [
        "for-each-ref",
        "--sort=-creatordate",
        `--format=${TAG_LIST_FORMAT}`,
        "refs/tags",
      ],
      { allowFailure: true },
    );
    if (result.code !== 0) return [];
    return parseTagList(result.stdout);
  }

  async create(options: TagCreateOptions): Promise<void> {
    const name = options.name.trim();
    if (!name) throw new Error("tag name is required");
    const args = ["tag"];
    const msg = options.message?.trim();
    if (msg) {
      args.push("-a", "-m", msg, name);
    } else {
      args.push(name);
    }
    if (options.ref?.trim()) {
      args.push(options.ref.trim());
    }
    await this.repo.exec(args);
  }

  async delete(options: TagDeleteOptions): Promise<void> {
    const name = options.name.trim();
    if (!name) throw new Error("tag name is required");
    await this.repo.exec(["tag", "-d", name]);
  }
}

export function parseTagList(stdout: string): TagInfo[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];
  const out: TagInfo[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split("\0");
    if (parts.length < 3) continue;
    const [name, sha, objectType, ...subjectParts] = parts;
    if (!name || !sha) continue;
    const annotated = objectType === "tag";
    const message = subjectParts.join("\0").trim() || undefined;
    out.push({
      name,
      sha,
      annotated,
      message: annotated ? message : undefined,
    });
  }
  return out;
}
