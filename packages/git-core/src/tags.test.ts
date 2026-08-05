import { describe, it, expect, beforeAll } from "vitest";
import { parseTagList } from "./tags.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";

describe("parseTagList", () => {
  it("parses lightweight and annotated records", () => {
    const sha = "a".repeat(40);
    const raw = [
      ["v1.0", sha, "commit", ""].join("\0"),
      ["v2.0", "b".repeat(40), "tag", "release two"].join("\0"),
      "",
    ].join("\n");
    const rows = parseTagList(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "v1.0", annotated: false, sha });
    expect(rows[1]).toMatchObject({
      name: "v2.0",
      annotated: true,
      message: "release two",
    });
  });

  it("returns empty for blank", () => {
    expect(parseTagList("")).toEqual([]);
  });
});

describe("tags API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let tip: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    tip = fixture.initialSha;
  });

  it("lists empty tags then creates lightweight and annotated", async () => {
    expect(await repo.tags.list()).toEqual([]);

    await repo.tags.create({ name: "v0.1.0" });
    await commitFile(dir, git, "tag-b.txt", "b\n", "for annotated tag");
    await repo.tags.create({
      name: "v0.2.0",
      message: "annotated p9 release",
    });

    const list = await repo.tags.list();
    expect(list.map((t) => t.name).sort()).toEqual(["v0.1.0", "v0.2.0"]);
    const light = list.find((t) => t.name === "v0.1.0")!;
    expect(light.annotated).toBe(false);
    expect(light.sha).toMatch(/^[0-9a-f]{40}$/i);
    // lightweight points at initial tip
    expect(light.sha.startsWith(tip.slice(0, 7)) || light.sha === tip).toBe(true);

    const ann = list.find((t) => t.name === "v0.2.0")!;
    expect(ann.annotated).toBe(true);
    expect(ann.message).toMatch(/annotated p9/i);
  });

  it("deletes a tag", async () => {
    await repo.tags.delete({ name: "v0.1.0" });
    const list = await repo.tags.list();
    expect(list.some((t) => t.name === "v0.1.0")).toBe(false);
    expect(list.some((t) => t.name === "v0.2.0")).toBe(true);
  });

  it("create requires non-empty name", async () => {
    await expect(repo.tags.create({ name: "  " })).rejects.toThrow(/name/i);
  });
});
