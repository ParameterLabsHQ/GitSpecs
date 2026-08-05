import { spawn } from "node:child_process";
import { GitCommandError, GitConflictError, isConflictOutput } from "./errors.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** When true, non-zero exit does not throw. */
  allowFailure?: boolean;
}

export async function execGit(
  gitPath: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    LANG: "C",
    LC_ALL: "C",
  };

  const result = await new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(gitPath, args, {
      cwd: options.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new GitCommandError(args, -1, stdout, `Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });

  if (result.code !== 0 && !options.allowFailure) {
    if (isConflictOutput(result.stderr, result.stdout)) {
      throw new GitConflictError(args, result.code, result.stdout, result.stderr);
    }
    throw new GitCommandError(args, result.code, result.stdout, result.stderr);
  }

  return result;
}
