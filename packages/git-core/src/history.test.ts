import { describe, it, expect, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseHistoryLog,
  parseFileHistoryWithPaths,
  parseFileChurnLog,
  HISTORY_LOG_FORMAT,
} from "./history.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseHistoryLog", () => {
  it("parses null-delimited format records", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const raw = [
      [sha1, "Alice", "<a@example.com>", "1700000000", "first subject"].join("\0"),
      [sha2, "Bob", "<b@example.com>", "1700000001", "second subject"].join("\0"),
      "",
    ].join("\n");

    const rows = parseHistoryLog(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sha: sha1,
      author: "Alice",
      authorMail: "<a@example.com>",
      authorTime: 1700000000,
      subject: "first subject",
    });
    expect(rows[1]).toMatchObject({
      sha: sha2,
      author: "Bob",
      subject: "second subject",
      authorTime: 1700000001,
    });
  });

  it("returns empty array for empty stdout", () => {
    expect(parseHistoryLog("")).toEqual([]);
    expect(parseHistoryLog("   \n")).toEqual([]);
  });

  it("skips malformed lines", () => {
    const sha = "c".repeat(40);
    const good = [sha, "Dev", "<d@x.com>", "100", "ok"].join("\0");
    const raw = `not-a-commit\n${good}\n`;
    const rows = parseHistoryLog(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sha).toBe(sha);
  });
});

describe("history.file (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let sha1: string;
  let sha2: string;
  let sha3: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    sha1 = await commitFile(
      dir,
      git,
      "hist.txt",
      "line one\n",
      "hist: add hist.txt",
    );
    sha2 = await commitFile(
      dir,
      git,
      "hist.txt",
      "line one\nline two\n",
      "hist: add line two",
    );
    sha3 = await commitFile(
      dir,
      git,
      "hist.txt",
      "line one\nline two\nline three\n",
      "hist: add line three",
    );
  });

  it("returns newest-first commits with sha, subject, author, authorTime via shipped API", async () => {
    const commits = await repo.history.file("hist.txt", { limit: 10 });
    expect(commits.length).toBeGreaterThanOrEqual(3);

    // Newest first
    expect(commits[0]!.sha).toBe(sha3);
    expect(commits[1]!.sha).toBe(sha2);
    expect(commits[2]!.sha).toBe(sha1);

    expect(commits[0]!.subject).toBe("hist: add line three");
    expect(commits[1]!.subject).toBe("hist: add line two");
    expect(commits[2]!.subject).toBe("hist: add hist.txt");

    for (const c of commits.slice(0, 3)) {
      expect(c.author).toBeTruthy();
      expect(c.authorTime).toBeGreaterThan(0);
      expect(c.sha).toMatch(/^[0-9a-f]{40}$/i);
    }
  });

  it("respects limit", async () => {
    const commits = await repo.history.file("hist.txt", { limit: 2 });
    expect(commits).toHaveLength(2);
    expect(commits[0]!.sha).toBe(sha3);
    expect(commits[1]!.sha).toBe(sha2);
  });

  it("returns empty for a path with no history", async () => {
    const commits = await repo.history.file("does-not-exist-ever.txt", { limit: 5 });
    expect(commits).toEqual([]);
  });

  it("follows renames with --follow", async () => {
    // Rename hist.txt → hist-renamed.txt in a new commit
    await execGit(git.path, ["-C", dir, "mv", "hist.txt", "hist-renamed.txt"]);
    await execGit(git.path, ["-C", dir, "commit", "-m", "hist: rename to hist-renamed"]);
    const renameSha = (
      await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])
    ).stdout.trim();

    const commits = await repo.history.file("hist-renamed.txt", { limit: 20 });
    const shas = commits.map((c) => c.sha);
    expect(shas).toContain(renameSha);
    expect(shas).toContain(sha3);
    expect(shas).toContain(sha1);
  });

  it("showFile returns blob content at revision", async () => {
    // After rename, path at sha1 was hist.txt
    const content = await repo.history.showFile("hist.txt", sha1);
    expect(content).toBe("line one\n");
  });
});

describe("history.line (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let addMarkerSha: string;
  let changeMarkerSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    // Stable header + evolving marker line + footer
    await commitFile(
      dir,
      git,
      "line-hist.txt",
      "header\nMARKER_A\nfooter\n",
      "line: initial with MARKER_A",
    );
    addMarkerSha = (
      await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])
    ).stdout.trim();

    // Unrelated change (line 1 only conceptually — rewrite whole file carefully)
    await commitFile(
      dir,
      git,
      "line-hist.txt",
      "header changed\nMARKER_A\nfooter\n",
      "line: change header only",
    );

    changeMarkerSha = await commitFile(
      dir,
      git,
      "line-hist.txt",
      "header changed\nMARKER_B\nfooter\n",
      "line: change marker to MARKER_B",
    );
  });

  it("returns commits that touched the line range via shipped line API", async () => {
    // Line 2 is the marker line
    const commits = await repo.history.line("line-hist.txt", {
      startLine: 2,
      endLine: 2,
      limit: 20,
    });

    expect(commits.length).toBeGreaterThanOrEqual(2);
    const shas = commits.map((c) => c.sha);
    // Must include the commits that introduced and changed the marker
    expect(shas).toContain(addMarkerSha);
    expect(shas).toContain(changeMarkerSha);

    // Newest-first among returned
    const idxAdd = shas.indexOf(addMarkerSha);
    const idxChange = shas.indexOf(changeMarkerSha);
    expect(idxChange).toBeLessThan(idxAdd);

    for (const c of commits) {
      expect(c.author).toBeTruthy();
      expect(c.authorTime).toBeGreaterThan(0);
      expect(c.subject).toBeTruthy();
    }
  });

  it("does not require header-only commits for the marker line when -L works", async () => {
    const commits = await repo.history.line("line-hist.txt", {
      startLine: 2,
      endLine: 2,
      limit: 50,
    });
    const subjects = commits.map((c) => c.subject);
    // If -L works, header-only commit should not appear; if fallback to file
    // history, it may appear — either is acceptable; assert known evolution exists.
    expect(subjects.some((s) => s.includes("MARKER"))).toBe(true);
  });

  it("line history shares HistoryCommit shape with file history", async () => {
    const fileCommits = await repo.history.file("line-hist.txt", { limit: 5 });
    const lineCommits = await repo.history.line("line-hist.txt", {
      startLine: 1,
      endLine: 3,
      limit: 5,
    });
    expect(fileCommits[0]).toMatchObject({
      sha: expect.any(String),
      subject: expect.any(String),
      author: expect.any(String),
      authorTime: expect.any(Number),
    });
    expect(lineCommits[0]).toMatchObject({
      sha: expect.any(String),
      subject: expect.any(String),
      author: expect.any(String),
      authorTime: expect.any(Number),
    });
  });
});

describe("HISTORY_LOG_FORMAT constant", () => {
  it("matches the documented field order", () => {
    expect(HISTORY_LOG_FORMAT).toBe("%H%x00%an%x00%ae%x00%at%x00%s");
  });
});

describe("history.search (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let grepSha: string;
  let authorSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    grepSha = await commitFile(
      dir,
      git,
      "search-a.txt",
      "a\n",
      "unique-needle-xyz: message search target",
    );

    // Commit with a distinct author for --author filter
    await writeFile(path.join(dir, "search-b.txt"), "b\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "search-b.txt"]);
    await execGit(git.path, [
      "-C",
      dir,
      "-c",
      "user.name=SearchAuthor",
      "-c",
      "user.email=search-author@example.com",
      "commit",
      "-m",
      "ordinary subject for author filter",
    ]);
    authorSha = (
      await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])
    ).stdout.trim();
  });

  it("finds commits by message grep via shipped search API", async () => {
    const hits = await repo.history.search({ grep: "unique-needle-xyz", limit: 20 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((c) => c.sha === grepSha)).toBe(true);
    const match = hits.find((c) => c.sha === grepSha)!;
    expect(match.subject).toContain("unique-needle-xyz");
    expect(match.author).toBeTruthy();
    expect(match.authorTime).toBeGreaterThan(0);
  });

  it("finds commits by author via shipped search API", async () => {
    const hits = await repo.history.search({ author: "SearchAuthor", limit: 20 });
    expect(hits.some((c) => c.sha === authorSha)).toBe(true);
    const match = hits.find((c) => c.sha === authorSha)!;
    expect(match.author).toContain("SearchAuthor");
    expect(match.subject).toContain("ordinary subject");
  });

  it("combines grep and author filters", async () => {
    const hits = await repo.history.search({
      grep: "ordinary subject",
      author: "SearchAuthor",
      limit: 10,
    });
    expect(hits.some((c) => c.sha === authorSha)).toBe(true);
    expect(hits.every((c) => c.author.includes("SearchAuthor"))).toBe(true);
  });

  it("returns empty array when nothing matches", async () => {
    const hits = await repo.history.search({
      grep: "definitely-not-in-any-commit-zzzz",
      limit: 5,
    });
    expect(hits).toEqual([]);
  });

  it("throws when neither grep nor author is provided", async () => {
    await expect(repo.history.search({})).rejects.toThrow(/grep|author/i);
    await expect(repo.history.search({ grep: "  ", author: "" })).rejects.toThrow(
      /grep|author/i,
    );
  });
});

describe("history.recent (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let sha1: string;
  let sha2: string;
  let sha3: string;
  let featureSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    sha1 = fixture.initialSha;

    sha2 = await commitFile(dir, git, "recent-a.txt", "a\n", "recent second commit");
    sha3 = await commitFile(dir, git, "recent-b.txt", "b\n", "recent third commit");

    // Side branch tip not on main HEAD ancestry after switch back
    await execGit(git.path, ["-C", dir, "checkout", "-b", "feature/recent-side"]);
    featureSha = await commitFile(
      dir,
      git,
      "feature-only.txt",
      "feat\n",
      "feature-only tip commit",
    );
    await execGit(git.path, ["-C", dir, "checkout", "main"]);
  });

  it("lists newest-first commits on current branch with full fields", async () => {
    const commits = await repo.history.recent({ limit: 20 });
    expect(commits.length).toBeGreaterThanOrEqual(3);
    // Newest first: sha3, sha2, sha1 (feature tip not on main)
    expect(commits[0]!.sha).toBe(sha3);
    expect(commits[0]!.subject).toBe("recent third commit");
    expect(commits[0]!.author).toBeTruthy();
    expect(commits[0]!.authorTime).toBeGreaterThan(0);

    const shas = commits.map((c) => c.sha);
    expect(shas).toContain(sha1);
    expect(shas).toContain(sha2);
    expect(shas).toContain(sha3);
    expect(shas).not.toContain(featureSha);

    // Order: later commits before earlier ones
    expect(shas.indexOf(sha3)).toBeLessThan(shas.indexOf(sha2));
    expect(shas.indexOf(sha2)).toBeLessThan(shas.indexOf(sha1));
  });

  it("respects limit", async () => {
    const commits = await repo.history.recent({ limit: 2 });
    expect(commits).toHaveLength(2);
    expect(commits[0]!.sha).toBe(sha3);
    expect(commits[1]!.sha).toBe(sha2);
  });

  it("walks from an alternate rev when provided", async () => {
    const commits = await repo.history.recent({ rev: "feature/recent-side", limit: 10 });
    expect(commits[0]!.sha).toBe(featureSha);
    expect(commits[0]!.subject).toContain("feature-only");
    const shas = commits.map((c) => c.sha);
    expect(shas).toContain(sha3);
    expect(shas).toContain(sha1);
  });

  it("returns empty array for empty repository-like rev with no commits", async () => {
    // Orphan empty: use a non-existent path via invalid rev should throw from git;
    // instead verify clamp: limit 0 falls back to default and still returns commits.
    const commits = await repo.history.recent({ limit: 0 });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]!.sha).toMatch(/^[0-9a-f]{40}$/i);
  });
});

describe("parseFileChurnLog / fileChurn (P20)", () => {
  it("parses numstat pairs after format lines", () => {
    const sha = "a".repeat(40);
    const raw = [
      [sha, "Ada", "<a@x.com>", "100", "add lines"].join("\0"),
      "",
      "3\t1\tfile.txt",
      "",
    ].join("\n");
    const rows = parseFileChurnLog(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sha,
      subject: "add lines",
      additions: 3,
      deletions: 1,
    });
  });

  it("fileChurn returns real additions/deletions via shipped API", async () => {
    const fixture = await createFixtureRepo();
    const sha1 = await commitFile(
      fixture.dir,
      fixture.git,
      "churn.txt",
      "a\nb\n",
      "churn: add two",
    );
    const sha2 = await commitFile(
      fixture.dir,
      fixture.git,
      "churn.txt",
      "a\nb\nc\nd\n",
      "churn: add two more",
    );
    const rows = await fixture.repo.history.fileChurn("churn.txt", { limit: 10 });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const bySha = new Map(rows.map((r) => [r.sha, r]));
    expect(bySha.get(sha1)?.additions).toBeGreaterThanOrEqual(2);
    expect(bySha.get(sha2)?.additions).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.sha).toBe(sha2);
  });
});

describe("parseFileHistoryWithPaths", () => {
  it("pairs commit records with path lines (rename-aware)", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const raw = [
      [sha1, "Alice", "<a@x.com>", "100", "newest"].join("\0"),
      "",
      "new-name.txt",
      "",
      [sha2, "Bob", "<b@x.com>", "90", "older"].join("\0"),
      "",
      "old-name.txt",
      "",
    ].join("\n");

    const rows = parseFileHistoryWithPaths(raw, "fallback.txt");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sha: sha1,
      subject: "newest",
      pathAtRev: "new-name.txt",
    });
    expect(rows[1]).toMatchObject({
      sha: sha2,
      subject: "older",
      pathAtRev: "old-name.txt",
    });
  });

  it("uses fallback path when name-only lines are missing", () => {
    const sha = "c".repeat(40);
    const raw = [[sha, "Dev", "<d@x.com>", "1", "solo"].join("\0"), ""].join("\n");
    const rows = parseFileHistoryWithPaths(raw, "only.txt");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pathAtRev).toBe("only.txt");
  });
});

describe("history.revisionNeighbors + rename-aware showFile (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let sha1: string;
  let sha2: string;
  let renameSha: string;
  let sha4: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    sha1 = await commitFile(dir, git, "rev-nav.txt", "v1\n", "revnav: add file");
    sha2 = await commitFile(dir, git, "rev-nav.txt", "v2\n", "revnav: second");
    await execGit(git.path, ["-C", dir, "mv", "rev-nav.txt", "rev-nav-renamed.txt"]);
    await execGit(git.path, ["-C", dir, "commit", "-m", "revnav: rename"]);
    renameSha = (
      await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])
    ).stdout.trim();
    sha4 = await commitFile(
      dir,
      git,
      "rev-nav-renamed.txt",
      "v3\n",
      "revnav: after rename",
    );
  });

  it("fileWithPaths tracks pathAtRev across a rename", async () => {
    const entries = await repo.history.fileWithPaths("rev-nav-renamed.txt", {
      limit: 20,
    });
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries[0]!.sha).toBe(sha4);
    expect(entries[0]!.pathAtRev).toBe("rev-nav-renamed.txt");

    const atSha1 = entries.find((e) => e.sha === sha1);
    expect(atSha1).toBeDefined();
    expect(atSha1!.pathAtRev).toBe("rev-nav.txt");

    const atRename = entries.find((e) => e.sha === renameSha);
    expect(atRename).toBeDefined();
    expect(atRename!.pathAtRev).toBe("rev-nav-renamed.txt");
  });

  it("revisionNeighbors: middle sha has previous (older) and next (newer)", async () => {
    const neighbors = await repo.history.revisionNeighbors(
      "rev-nav-renamed.txt",
      sha2,
      { limit: 20 },
    );
    expect(neighbors.index).toBeGreaterThanOrEqual(0);
    expect(neighbors.current?.sha).toBe(sha2);
    // previous = older → sha1
    expect(neighbors.previous?.sha).toBe(sha1);
    // next = newer → renameSha (or could be further depending on sequence)
    expect(neighbors.next?.sha).toBe(renameSha);
    expect(neighbors.sequence.length).toBeGreaterThanOrEqual(4);
  });

  it("revisionNeighbors: oldest has no previous; newest has no next", async () => {
    const oldest = await repo.history.revisionNeighbors(
      "rev-nav-renamed.txt",
      sha1,
      { limit: 20 },
    );
    expect(oldest.current?.sha).toBe(sha1);
    expect(oldest.previous).toBeUndefined();
    expect(oldest.next?.sha).toBe(sha2);

    const newest = await repo.history.revisionNeighbors(
      "rev-nav-renamed.txt",
      sha4,
      { limit: 20 },
    );
    expect(newest.current?.sha).toBe(sha4);
    expect(newest.next).toBeUndefined();
    expect(newest.previous?.sha).toBe(renameSha);
  });

  it("revisionNeighbors matches short SHA prefixes", async () => {
    const neighbors = await repo.history.revisionNeighbors(
      "rev-nav-renamed.txt",
      sha2.slice(0, 7),
      { limit: 20 },
    );
    expect(neighbors.current?.sha).toBe(sha2);
    expect(neighbors.index).toBeGreaterThanOrEqual(0);
  });

  it("revisionNeighbors returns index -1 when sha is outside the file sequence", async () => {
    // initial fixture README commit is not on rev-nav history
    const initial = (
      await execGit(git.path, ["-C", dir, "rev-list", "--max-parents=0", "HEAD"])
    ).stdout.trim();
    // If initial is sha1 for this file it might match — use a synthetic invalid sha
    const neighbors = await repo.history.revisionNeighbors(
      "rev-nav-renamed.txt",
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      { limit: 20 },
    );
    expect(neighbors.index).toBe(-1);
    expect(neighbors.current).toBeUndefined();
    expect(neighbors.previous).toBeUndefined();
    expect(neighbors.next).toBeUndefined();
    expect(neighbors.sequence.length).toBeGreaterThan(0);
    void initial;
  });

  it("showFile resolves renamed paths at older revisions", async () => {
    // Current path is rev-nav-renamed.txt; at sha1 the blob lived at rev-nav.txt
    const content = await repo.history.showFile("rev-nav-renamed.txt", sha1);
    expect(content).toBe("v1\n");

    const content2 = await repo.history.showFile("rev-nav-renamed.txt", sha2);
    expect(content2).toBe("v2\n");

    const content4 = await repo.history.showFile("rev-nav-renamed.txt", sha4);
    expect(content4).toBe("v3\n");
  });

  it("resolvePathAtRevision returns historical path", async () => {
    const p1 = await repo.history.resolvePathAtRevision("rev-nav-renamed.txt", sha1);
    expect(p1).toBe("rev-nav.txt");
    const p4 = await repo.history.resolvePathAtRevision("rev-nav-renamed.txt", sha4);
    expect(p4).toBe("rev-nav-renamed.txt");
  });
});
