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
await writeFile(path.join(dir, "f.txt"), "hi\nline2\n");
await execGit(git.path, ["-C", dir, "add", "f.txt"]);
await execGit(git.path, ["-C", dir, "commit", "-m", "init"]);
const initSha = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();

const repo = await openRepository(dir, git);

// Phase 1: blame library API on shipped dist
const blameRows = await repo.blame.blame({ file: "f.txt" });
const blameLine = await repo.blame.blameLine("f.txt", 1);
if (!blameLine || blameLine.sha !== initSha || !blameLine.author) {
  console.error("blame consumer failed", { blameLine, initSha, blameRows });
  process.exitCode = 1;
}
console.log(
  JSON.stringify(
    {
      blameLineCount: blameRows.length,
      blameLine1Sha: blameLine?.sha,
      blameLine1Author: blameLine?.author,
      blameLine1Summary: blameLine?.summary,
      blameMatchesInit: blameLine?.sha === initSha,
    },
    null,
    2,
  ),
);

// P4/P5: history library API on shipped dist
await writeFile(path.join(dir, "f.txt"), "hi\nline2 evolved\n");
await execGit(git.path, ["-C", dir, "add", "f.txt"]);
await execGit(git.path, ["-C", dir, "commit", "-m", "evolve line2"]);
const secondSha = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();

const fileHist = await repo.history.file("f.txt", { limit: 10 });
const lineHist = await repo.history.line("f.txt", {
  startLine: 2,
  endLine: 2,
  limit: 10,
});
const shown = await repo.history.showFile("f.txt", initSha);

const fileShas = fileHist.map((c) => c.sha);
const lineShas = lineHist.map((c) => c.sha);
const historyOk =
  fileShas.includes(initSha) &&
  fileShas.includes(secondSha) &&
  fileHist[0]?.sha === secondSha &&
  fileHist.every((c) => c.author && c.authorTime > 0 && c.subject) &&
  lineShas.includes(secondSha) &&
  shown === "hi\nline2\n";

if (!historyOk) {
  console.error("history consumer failed", {
    fileHist,
    lineHist,
    shown,
    initSha,
    secondSha,
  });
  process.exitCode = 1;
}
console.log(
  JSON.stringify(
    {
      fileHistoryCount: fileHist.length,
      fileNewestSha: fileHist[0]?.sha,
      fileNewestSubject: fileHist[0]?.subject,
      lineHistoryCount: lineHist.length,
      lineTouchesSecond: lineShas.includes(secondSha),
      showAtInit: shown,
      historyOk,
    },
    null,
    2,
  ),
);

// P6: compare name-status + commit search on shipped dist
await repo.branches.create({ name: "p6-feature", startPoint: "main" });
await repo.branches.switchTo("p6-feature");
await writeFile(path.join(dir, "p6-only.txt"), "p6\n");
await execGit(git.path, ["-C", dir, "add", "p6-only.txt"]);
await execGit(git.path, ["-C", dir, "commit", "-m", "p6-unique-search-needle"]);
const p6Sha = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
await repo.branches.switchTo("main");

const compare = await repo.branches.compare({ base: "main", head: "p6-feature" });
const compareOk =
  Array.isArray(compare.files) &&
  compare.files.some((f) => f.path === "p6-only.txt") &&
  typeof compare.ahead === "number" &&
  typeof compare.shortstat === "string" &&
  compare.againstWorkingTree === false;

const searchHits = await repo.history.search({
  grep: "p6-unique-search-needle",
  limit: 10,
});
const searchOk = searchHits.some((c) => c.sha === p6Sha && c.subject.includes("p6-unique"));

if (!compareOk || !searchOk) {
  console.error("P6 compare/search consumer failed", { compare, searchHits, p6Sha });
  process.exitCode = 1;
}
console.log(
  JSON.stringify(
    {
      compareFilePaths: compare.files.map((f) => f.path),
      compareAhead: compare.ahead,
      compareShortstat: compare.shortstat,
      searchHitCount: searchHits.length,
      searchOk,
      compareOk,
    },
    null,
    2,
  ),
);

// P7: recent commits on current branch (HEAD ancestry)
const recent = await repo.history.recent({ limit: 20 });
const recentOk =
  Array.isArray(recent) &&
  recent.length >= 1 &&
  recent.every((c) => c.sha && c.author && c.authorTime > 0 && typeof c.subject === "string") &&
  // On main after switch-back: feature tip sha must not appear as HEAD tip
  recent[0]?.sha !== p6Sha;

// Alternate rev still walks feature tip
const recentFeature = await repo.history.recent({ rev: "p6-feature", limit: 5 });
const recentFeatureOk = recentFeature[0]?.sha === p6Sha;

if (!recentOk || !recentFeatureOk) {
  console.error("P7 history.recent consumer failed", { recent, recentFeature, p6Sha });
  process.exitCode = 1;
}
console.log(
  JSON.stringify(
    {
      recentCount: recent.length,
      recentNewestSha: recent[0]?.sha,
      recentNewestSubject: recent[0]?.subject,
      recentOk,
      recentFeatureOk,
    },
    null,
    2,
  ),
);

// P8: stashes list/push/show/drop on shipped dist
await writeFile(path.join(dir, "p8-stash.txt"), "stash-me\n");
await execGit(git.path, ["-C", dir, "add", "p8-stash.txt"]);
const emptyStashes = await repo.stashes.list();
const pushed = await repo.stashes.push({ message: "consumer-p8-stash" });
const afterPush = await repo.stashes.list();
const stashShown = pushed
  ? await repo.stashes.show({ stash: pushed.ref, stat: true })
  : "";
if (pushed) await repo.stashes.drop({ stash: pushed.ref });
const afterDrop = await repo.stashes.list();
const stashesOk =
  Array.isArray(emptyStashes) &&
  pushed &&
  pushed.message.includes("consumer-p8-stash") &&
  afterPush.some((s) => s.sha === pushed.sha) &&
  typeof stashShown === "string" &&
  stashShown.length > 0 &&
  !afterDrop.some((s) => s.sha === pushed.sha);

if (!stashesOk) {
  console.error("P8 stashes consumer failed", {
    emptyStashes,
    pushed,
    afterPush,
    stashShown,
    afterDrop,
  });
  process.exitCode = 1;
}
console.log(
  JSON.stringify(
    {
      stashPushRef: pushed?.ref,
      stashPushMessage: pushed?.message,
      stashShowLen: stashShown.length,
      stashesOk,
    },
    null,
    2,
  ),
);

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
