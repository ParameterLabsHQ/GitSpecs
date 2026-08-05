import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  parseBlamePorcelain,
  formatBlameAnnotation,
  toRepoRelative,
} from "./blame.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseBlamePorcelain", () => {
  it("parses multi-line porcelain with shared commit headers", () => {
    const sha = "a".repeat(40);
    const raw = [
      `${sha} 1 1 2`,
      "author Alice",
      "author-mail <a@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-time 1700000000",
      "summary first commit",
      "filename note.txt",
      "\tline one",
      `${sha} 2 2`,
      "\tline two",
      "",
    ].join("\n");

    const rows = parseBlamePorcelain(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      lineNumber: 1,
      sha,
      author: "Alice",
      summary: "first commit",
      content: "line one",
    });
    expect(rows[1]).toMatchObject({
      lineNumber: 2,
      sha,
      author: "Alice",
      summary: "first commit",
      content: "line two",
    });
  });
});

describe("formatBlameAnnotation", () => {
  it("includes author, date, short sha, summary", () => {
    const text = formatBlameAnnotation({
      lineNumber: 1,
      sha: "abcdef0123456789",
      author: "Bob",
      authorTime: 1700000000,
      summary: "hello world",
      content: "x",
    });
    expect(text).toContain("Bob");
    expect(text).toContain("abcdef0");
    expect(text).toContain("hello world");
  });
});

describe("toRepoRelative", () => {
  it("strips repo root from absolute paths", () => {
    const root = "/repo/root";
    expect(toRepoRelative(root, "/repo/root/src/a.ts")).toBe("src/a.ts");
  });
});

describe("blame (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let firstSha: string;
  let secondSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    firstSha = fixture.initialSha;

    // Expand README with known lines across two commits
    await writeFile(path.join(dir, "blame-me.txt"), "alpha\nbeta\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "blame-me.txt"]);
    await execGit(git.path, ["-C", dir, "commit", "-m", "add blame-me alpha beta"]);
    firstSha = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();

    await writeFile(path.join(dir, "blame-me.txt"), "alpha\nbeta\ngamma\n", "utf8");
    secondSha = await commitFile(dir, git, "blame-me.txt", "alpha\nbeta\ngamma\n", "add gamma line");
  });

  it("blames entire file with real author and shas", async () => {
    const rows = await repo.blame.blame({ file: "blame-me.txt" });
    expect(rows.length).toBe(3);

    expect(rows[0]!.content).toBe("alpha");
    expect(rows[1]!.content).toBe("beta");
    expect(rows[2]!.content).toBe("gamma");

    expect(rows[0]!.sha).toBe(firstSha);
    expect(rows[1]!.sha).toBe(firstSha);
    expect(rows[2]!.sha).toBe(secondSha);

    expect(rows[0]!.author).toBe("Test User");
    expect(rows[2]!.summary).toContain("gamma");
    expect(rows[0]!.lineNumber).toBe(1);
    expect(rows[2]!.lineNumber).toBe(3);
  });

  it("blames a single line range", async () => {
    const line = await repo.blame.blameLine("blame-me.txt", 3);
    expect(line).toBeDefined();
    expect(line!.sha).toBe(secondSha);
    expect(line!.content).toBe("gamma");
    expect(line!.author).toBe("Test User");
  });

  it("accepts absolute paths under the repo", async () => {
    const abs = path.join(dir, "blame-me.txt");
    const rows = await repo.blame.blame({ file: abs, startLine: 1, endLine: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sha).toBe(firstSha);
  });
});
