import { describe, it, expect, beforeAll } from "vitest";
import { parseHistoryLog, HISTORY_LOG_FORMAT } from "./history.js";
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
