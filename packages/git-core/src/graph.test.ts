import { describe, it, expect, beforeAll } from "vitest";
import {
  parseGraphLog,
  parseDecorations,
  layoutGraph,
  clampGraphLimit,
  DEFAULT_GRAPH_LIMIT,
  MAX_GRAPH_LIMIT,
  renderGraphPrefix,
} from "./graph.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("graph pure helpers", () => {
  it("clamps limits to documented bounds", () => {
    expect(clampGraphLimit(undefined)).toBe(DEFAULT_GRAPH_LIMIT);
    expect(clampGraphLimit(0)).toBe(DEFAULT_GRAPH_LIMIT);
    expect(clampGraphLimit(50)).toBe(50);
    expect(clampGraphLimit(10_000)).toBe(MAX_GRAPH_LIMIT);
  });

  it("parses decorations", () => {
    expect(parseDecorations("HEAD -> main, origin/main, tag: v1")).toEqual([
      "main",
      "origin/main",
      "v1",
    ]);
    expect(parseDecorations("")).toEqual([]);
  });

  it("parses log and layouts lanes for a linear chain", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    const c = "c".repeat(40);
    // newest first: c -> b -> a
    const raw = [
      [c, b, "Dev", "3", "third", "HEAD -> main"].join("\0"),
      [b, a, "Dev", "2", "second", ""].join("\0"),
      [a, "", "Dev", "1", "first", ""].join("\0"),
      "",
    ].join("\n");
    const parsed = parseGraphLog(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]!.parents).toEqual([b]);
    expect(parsed[0]!.refs).toContain("main");
    const laid = layoutGraph(parsed);
    expect(laid[0]!.lane).toBe(0);
    expect(laid[0]!.graph).toContain("*");
    expect(laid.every((x) => x.graph.length > 0)).toBe(true);
  });

  it("marks merges in graph prefix", () => {
    expect(renderGraphPrefix(0, 2, true)).toContain("M");
    expect(renderGraphPrefix(1, 2, false)).toMatch(/\*/);
  });
});

describe("graph API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let sha1: string;
  let sha2: string;
  let mergeSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    sha1 = fixture.initialSha;
    sha2 = await commitFile(dir, git, "g2.txt", "2\n", "graph second");

    await execGit(git.path, ["-C", dir, "checkout", "-b", "graph-side"]);
    await commitFile(dir, git, "side.txt", "s\n", "graph side");
    await execGit(git.path, ["-C", dir, "checkout", "main"]);
    await execGit(git.path, ["-C", dir, "merge", "--no-ff", "graph-side", "-m", "graph merge"]);
    mergeSha = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
  });

  it("returns parent lists, refs, and layout within bound", async () => {
    const nodes = await repo.graph.log({ limit: 50, all: true });
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes.length).toBeLessThanOrEqual(50);
    const bySha = new Map(nodes.map((n) => [n.sha, n]));
    expect(bySha.has(mergeSha)).toBe(true);
    expect(bySha.has(sha2)).toBe(true);
    expect(bySha.has(sha1)).toBe(true);
    const merge = bySha.get(mergeSha)!;
    expect(merge.parents.length).toBeGreaterThanOrEqual(2);
    expect(merge.subject).toMatch(/merge/i);
    expect(merge.graph.length).toBeGreaterThan(0);
    expect(merge.authorTime).toBeGreaterThan(0);
    // HEAD decoration should appear on tip
    expect(nodes[0]!.refs.length).toBeGreaterThan(0);
  });

  it("respects limit clamp", async () => {
    const nodes = await repo.graph.log({ limit: 2 });
    expect(nodes).toHaveLength(2);
  });

  it("logPage supports skip for incremental loads", async () => {
    const page0 = await repo.graph.logPage({ limit: 2, skip: 0, all: true });
    expect(page0.commits).toHaveLength(2);
    expect(page0.skip).toBe(0);
    expect(page0.hasMore).toBe(true);

    const page1 = await repo.graph.logPage({ limit: 2, skip: 2, all: true });
    expect(page1.skip).toBe(2);
    // Pages should not share the same first sha when history is long enough
    if (page1.commits.length > 0) {
      expect(page1.commits[0]!.sha).not.toBe(page0.commits[0]!.sha);
    }
  });
});
