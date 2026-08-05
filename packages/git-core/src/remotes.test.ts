import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { parseRemoteVerbose } from "./remotes.js";
import {
  createFixtureRepo,
  createBareRemote,
  commitFile,
} from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseRemoteVerbose", () => {
  it("merges fetch/push URLs per remote name", () => {
    const raw = [
      "origin\thttps://github.com/acme/r.git (fetch)",
      "origin\thttps://github.com/acme/r.git (push)",
      "upstream\tgit@github.com:other/r.git (fetch)",
      "upstream\tgit@github.com:other/r.git (push)",
      "",
    ].join("\n");
    const rows = parseRemoteVerbose(raw);
    expect(rows).toHaveLength(2);
    const origin = rows.find((r) => r.name === "origin")!;
    expect(origin.fetchUrl).toContain("github.com/acme/r");
    expect(origin.pushUrl).toContain("github.com/acme/r");
    expect(rows.find((r) => r.name === "upstream")?.fetchUrl).toContain("other/r");
  });

  it("returns empty for blank", () => {
    expect(parseRemoteVerbose("")).toEqual([]);
  });
});

describe("remotes API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let bare: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    bare = await createBareRemote(git);
    await execGit(git.path, ["-C", dir, "remote", "add", "origin", bare]);
    await commitFile(dir, git, "r.txt", "r\n", "for fetch");
    await execGit(git.path, ["-C", dir, "push", "-u", "origin", "main"]);
  });

  it("lists remotes with URLs via shipped API", async () => {
    const list = await repo.remotes.list();
    expect(list.some((r) => r.name === "origin")).toBe(true);
    const origin = list.find((r) => r.name === "origin")!;
    // bare path as URL
    expect(origin.fetchUrl).toBeTruthy();
    expect(path.resolve(origin.fetchUrl!)).toBe(path.resolve(bare));
  });

  it("getUrl and fetch remote work", async () => {
    const url = await repo.remotes.getUrl("origin");
    expect(url).toBeTruthy();
    await repo.remotes.fetch({ remote: "origin" });
  });
});
