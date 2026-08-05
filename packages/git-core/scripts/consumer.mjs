/**
 * Fresh consumer outside vitest: import shipped dist and exercise real git + host-urls.
 */
import { mkdtemp, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const gitCore = await import("../dist/index.js");

async function samePath(a, b) {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

// host-urls may live next door
let hostUrls;
try {
  hostUrls = await import("../../host-urls/dist/index.js");
} catch {
  hostUrls = null;
}

const { findGit, openRepository, execGit } = gitCore;

const git = await findGit();
const dir = await mkdtemp(path.join(tmpdir(), "gp-consumer-"));
await execGit(git.path, ["init", dir]);
await execGit(git.path, ["-C", dir, "config", "user.email", "c@example.com"]);
await execGit(git.path, ["-C", dir, "config", "user.name", "Consumer"]);
await execGit(git.path, ["-C", dir, "checkout", "-b", "main"]);
await writeFile(path.join(dir, "f.txt"), "hi\n");
await execGit(git.path, ["-C", dir, "add", "f.txt"]);
await execGit(git.path, ["-C", dir, "commit", "-m", "init"]);

const repo = await openRepository(dir, git);
const branches = await repo.branches.list({ includeRemotes: false });
await repo.branches.create({ name: "consumer-branch" });
const after = await repo.branches.list({ includeRemotes: false });

const wtDir = await mkdtemp(path.join(tmpdir(), "gp-cwt-"));
const wtPath = path.join(wtDir, "wt");
await repo.worktrees.add({ path: wtPath, branch: "consumer-branch" });
const worktrees = await repo.worktrees.list();

let worktreeAdded = false;
for (const w of worktrees) {
  if (await samePath(w.path, wtPath)) worktreeAdded = true;
}

console.log(
  JSON.stringify(
    {
      gitVersion: git.version,
      repo: dir,
      branchNames: after.map((b) => b.name),
      createdBranch: after.some((b) => b.name === "consumer-branch"),
      worktreePaths: worktrees.map((w) => w.path),
      worktreeAdded,
    },
    null,
    2,
  ),
);

if (hostUrls) {
  const id = hostUrls.parseRemoteUrl("git@github.com:acme/widgets.git");
  const url = id ? hostUrls.branchUrl(id, "main") : null;
  console.log(JSON.stringify({ hostParse: id, branchUrl: url }, null, 2));
  if (!url || !url.includes("github.com")) {
    process.exitCode = 1;
    console.error("host-urls failed");
  }
}

if (!after.some((b) => b.name === "consumer-branch")) {
  process.exitCode = 1;
}
if (!worktreeAdded) {
  process.exitCode = 1;
}
