import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findGit } from "./git.js";
import { execGit } from "./exec.js";
import { openRepository, type GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";

export async function tempDir(prefix = "gp-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function initRepo(
  dir: string,
  git: GitBinary,
  options: { bare?: boolean } = {},
): Promise<void> {
  const args = ["init"];
  if (options.bare) args.push("--bare");
  args.push(dir);
  await execGit(git.path, args);
  if (!options.bare) {
    await execGit(git.path, ["-C", dir, "config", "user.email", "test@example.com"]);
    await execGit(git.path, ["-C", dir, "config", "user.name", "Test User"]);
    await execGit(git.path, ["-C", dir, "config", "commit.gpgsign", "false"]);
  }
}

export async function commitFile(
  repoDir: string,
  git: GitBinary,
  fileName: string,
  content: string,
  message: string,
): Promise<string> {
  const filePath = path.join(repoDir, fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  await execGit(git.path, ["-C", repoDir, "add", fileName]);
  await execGit(git.path, ["-C", repoDir, "commit", "-m", message]);
  const sha = await execGit(git.path, ["-C", repoDir, "rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function createFixtureRepo(): Promise<{
  git: GitBinary;
  dir: string;
  repo: GitRepository;
  initialSha: string;
}> {
  const git = await findGit();
  const dir = await tempDir("gp-repo-");
  await initRepo(dir, git);
  // Ensure main branch name
  await execGit(git.path, ["-C", dir, "checkout", "-b", "main"]);
  const initialSha = await commitFile(dir, git, "README.md", "# fixture\n", "initial");
  const repo = await openRepository(dir, git);
  return { git, dir, repo, initialSha };
}

export async function createBareRemote(git: GitBinary): Promise<string> {
  const dir = await tempDir("gp-bare-");
  await initRepo(dir, git, { bare: true });
  return dir;
}
