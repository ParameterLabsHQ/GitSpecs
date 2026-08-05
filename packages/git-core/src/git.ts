import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter } from "node:path";
import { GitNotFoundError } from "./errors.js";
import { execGit } from "./exec.js";

export interface GitBinary {
  path: string;
  version: string;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveOnPath(command: string): Promise<string | undefined> {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = `${dir}/${command}`;
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function findGit(pathOverride?: string): Promise<GitBinary> {
  const candidates = pathOverride?.trim()
    ? [pathOverride.trim()]
    : (await (async () => {
        const fromPath = await resolveOnPath("git");
        return fromPath ? [fromPath] : ["git"];
      })());

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const result = await execGit(candidate, ["--version"], { timeoutMs: 10_000 });
      const version = result.stdout.trim().replace(/^git version\s+/i, "");
      return { path: candidate, version };
    } catch (err) {
      lastError = err;
    }
  }

  throw new GitNotFoundError(
    lastError instanceof Error ? lastError.message : "Git executable not found",
  );
}
