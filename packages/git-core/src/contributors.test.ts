import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { parseShortlog } from "./contributors.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseShortlog", () => {
  it("parses count, name, and email", () => {
    const raw = "    12\tAda Lovelace <ada@example.com>\n     3\tBob <b@x.com>\n";
    const rows = parseShortlog(raw);
    expect(rows).toEqual([
      { name: "Ada Lovelace", email: "ada@example.com", commits: 12 },
      { name: "Bob", email: "b@x.com", commits: 3 },
    ]);
  });

  it("handles missing email", () => {
    const rows = parseShortlog("     1\tMystery Author\n");
    expect(rows[0]).toEqual({ name: "Mystery Author", commits: 1 });
  });

  it("returns empty for blank", () => {
    expect(parseShortlog("")).toEqual([]);
  });
});

describe("contributors API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    // Default author is Test User from fixture
    await commitFile(dir, git, "c1.txt", "1\n", "c1 by test");

    // Second author
    await writeFile(path.join(dir, "c2.txt"), "2\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "c2.txt"]);
    await execGit(git.path, [
      "-C",
      dir,
      "-c",
      "user.name=Contrib Alice",
      "-c",
      "user.email=alice-contrib@example.com",
      "commit",
      "-m",
      "c2 by alice",
    ]);

    await writeFile(path.join(dir, "c3.txt"), "3\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "c3.txt"]);
    await execGit(git.path, [
      "-C",
      dir,
      "-c",
      "user.name=Contrib Alice",
      "-c",
      "user.email=alice-contrib@example.com",
      "commit",
      "-m",
      "c3 by alice again",
    ]);
  });

  it("lists multi-author commit counts via shipped API", async () => {
    const list = await repo.contributors.list({ limit: 50, all: false });
    expect(list.length).toBeGreaterThanOrEqual(2);
    const alice = list.find((c) => c.name.includes("Alice") || c.email?.includes("alice-contrib"));
    expect(alice).toBeDefined();
    expect(alice!.commits).toBeGreaterThanOrEqual(2);
    expect(list.every((c) => c.commits > 0 && c.name)).toBe(true);
    // Sorted by commits desc
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.commits).toBeGreaterThanOrEqual(list[i]!.commits);
    }
  });

  it("respects limit", async () => {
    const list = await repo.contributors.list({ limit: 1 });
    expect(list.length).toBeLessThanOrEqual(1);
  });
});
