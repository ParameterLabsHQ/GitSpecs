export class GitNotFoundError extends Error {
  override readonly name = "GitNotFoundError";
  constructor(message = "Git executable not found") {
    super(message);
  }
}

export class NotAGitRepositoryError extends Error {
  override readonly name = "NotAGitRepositoryError";
  constructor(public readonly path: string) {
    super(`Not a git repository: ${path}`);
  }
}

export class GitCommandError extends Error {
  override readonly name: string = "GitCommandError";
  constructor(
    public readonly args: string[],
    public readonly code: number,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    const detail = (stderr || stdout || `exit ${code}`).trim().split("\n")[0] ?? `exit ${code}`;
    super(`git ${args.join(" ")} failed: ${detail}`);
  }
}

export class GitConflictError extends GitCommandError {
  override readonly name = "GitConflictError";
}

export class DirtyWorktreeError extends Error {
  override readonly name = "DirtyWorktreeError";
  constructor(message = "Working tree has uncommitted changes") {
    super(message);
  }
}

export function isConflictOutput(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  return (
    text.includes("conflict") ||
    text.includes("could not apply") ||
    text.includes("you are in the middle of") ||
    text.includes("fix your merge") ||
    text.includes("resolve") && text.includes("conflict")
  );
}
