import * as vscode from "vscode";

const GITLAB_PAT_KEY = "gitspecs.hosting.gitlab.pat";
const GITHUB_SCOPES = ["repo", "read:user"];

export async function getGitHubToken(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession("github", GITHUB_SCOPES, {
      createIfNone: false,
    });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

export async function signInGitHub(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession("github", GITHUB_SCOPES, {
      createIfNone: true,
    });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

export async function getGitLabPat(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(GITLAB_PAT_KEY);
}

export async function setGitLabPat(
  secrets: vscode.SecretStorage,
  pat: string | undefined,
): Promise<void> {
  if (!pat) {
    await secrets.delete(GITLAB_PAT_KEY);
    return;
  }
  await secrets.store(GITLAB_PAT_KEY, pat);
}

export function hostingEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("gitspecs")
    .get<boolean>("hosting.enabled", true);
}

export function githubApiBaseUrl(): string | undefined {
  const v = vscode.workspace
    .getConfiguration("gitspecs")
    .get<string>("hosting.github.baseUrl")
    ?.trim();
  return v || undefined;
}

export function gitlabApiBaseUrl(): string | undefined {
  const v = vscode.workspace
    .getConfiguration("gitspecs")
    .get<string>("hosting.gitlab.baseUrl")
    ?.trim();
  return v || undefined;
}
