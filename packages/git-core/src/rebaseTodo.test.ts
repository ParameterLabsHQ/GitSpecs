import { describe, it, expect, beforeAll } from "vitest";
import {
  parseRebaseTodo,
  serializeRebaseTodo,
  applyTodoActions,
  actionableEntries,
} from "./rebaseTodo.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

const SAMPLE = `# Rebase todo
pick abcdef0 first commit
pick 1234567 second commit
# comment
pick deadbee third
`;

describe("parseRebaseTodo / serializeRebaseTodo", () => {
  it("round-trips pick lines and comments", () => {
    const entries = parseRebaseTodo(SAMPLE);
    expect(entries.filter((e) => !e.isComment)).toHaveLength(3);
    expect(entries[1]).toMatchObject({
      action: "pick",
      sha: "abcdef0",
      rest: "first commit",
    });
    const out = serializeRebaseTodo(entries);
    const again = parseRebaseTodo(out);
    expect(again.filter((e) => !e.isComment).map((e) => e.sha)).toEqual([
      "abcdef0",
      "1234567",
      "deadbee",
    ]);
  });

  it("applyTodoActions changes actions by actionable index", () => {
    const entries = parseRebaseTodo(SAMPLE);
    const next = applyTodoActions(entries, [
      { index: 1, action: "squash" },
      { index: 2, action: "drop" },
    ]);
    const actions = actionableEntries(next).map((e) => e.action);
    expect(actions).toEqual(["pick", "squash", "drop"]);
    const text = serializeRebaseTodo(next);
    expect(text).toMatch(/squash 1234567/);
    expect(text).toMatch(/drop deadbee/);
  });

  it("accepts short aliases", () => {
    const entries = parseRebaseTodo("p abcdef0 subj\nr 1234567 reword me\n");
    expect(entries[0]!.action).toBe("pick");
    expect(entries[1]!.action).toBe("reword");
  });
});

describe("interactiveRebase with sequence editor (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    // Linear history: base <- c1 <- c2 <- c3 (HEAD)
    await commitFile(dir, git, "rb.txt", "1\n", "rb: one");
    await commitFile(dir, git, "rb.txt", "1\n2\n", "rb: two");
    await commitFile(dir, git, "rb.txt", "1\n2\n3\n", "rb: three");
  });

  it("runs scripted interactive rebase dropping the tip commit", async () => {
    // Onto initial root: interactive todo lists commits after root (one, two, three)
    const root = (
      await execGit(git.path, ["-C", dir, "rev-list", "--max-parents=0", "HEAD"])
    ).stdout.trim();

    // Drop the last actionable pick (tip) — clean content ancestry
    await repo.rewrite.interactiveRebase({
      onto: root,
      edits: [{ index: 2, action: "drop" }],
      requireClean: true,
    });

    const st = await repo.rewrite.status();
    expect(st.kind).toBe("none");

    const log = await repo.history.recent({ limit: 20 });
    const subjects = log.map((c) => c.subject);
    expect(subjects.some((s) => s.includes("rb: three"))).toBe(false);
    expect(subjects.some((s) => s.includes("rb: two"))).toBe(true);
    expect(subjects.some((s) => s.includes("rb: one"))).toBe(true);
  });
});
