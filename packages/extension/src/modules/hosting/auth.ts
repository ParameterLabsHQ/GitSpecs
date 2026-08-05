import * as vscode from "vscode";

const GITLAB_PAT_KEY = "gitspecs.hosting.gitlab.pat";
const BITBUCKET_PAT_KEY = "gitspecs.hosting.bitbucket.pat";
const AZURE_PAT_KEY = "gitspecs.hosting.azure.pat";
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

/** Remove the GitHub session when the account API allows; otherwise clear our use of it. */
export async function signOutGitHub(): Promise<void> {
  try {
    const session = await vscode.authentication.getSession("github", GITHUB_SCOPES, {
      createIfNone: false,
    });
    if (session) {
      // VS Code has no universal revoke; removeAccounts exists on newer APIs.
      const auth = vscode.authentication as unknown as {
        removeSession?: (providerId: string, sessionId: string) => Thenable<void>;
      };
      if (typeof auth.removeSession === "function") {
        await auth.removeSession("github", session.id);
      }
    }
  } catch {
    // ignore
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

export async function getBitbucketPat(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  return secrets.get(BITBUCKET_PAT_KEY);
}

export async function setBitbucketPat(
  secrets: vscode.SecretStorage,
  pat: string | undefined,
): Promise<void> {
  if (!pat) {
    await secrets.delete(BITBUCKET_PAT_KEY);
    return;
  }
  await secrets.store(BITBUCKET_PAT_KEY, pat);
}

export async function getAzurePat(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(AZURE_PAT_KEY);
}

export async function setAzurePat(
  secrets: vscode.SecretStorage,
  pat: string | undefined,
): Promise<void> {
  if (!pat) {
    await secrets.delete(AZURE_PAT_KEY);
    return;
  }
  await secrets.store(AZURE_PAT_KEY, pat);
}

export async function signOutAllPats(secrets: vscode.SecretStorage): Promise<void> {
  await setGitLabPat(secrets, undefined);
  await setBitbucketPat(secrets, undefined);
  await setAzurePat(secrets, undefined);
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
