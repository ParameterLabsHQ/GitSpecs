export type HostProvider = "github" | "gitlab" | "bitbucket" | "azuredevops" | "unknown";

export interface RemoteIdentity {
  provider: HostProvider;
  webBase: string;
  owner: string;
  repo: string;
  /** Azure DevOps project when applicable */
  project?: string;
}

/**
 * Parse a git remote URL into a hosting identity. Returns undefined when unparseable.
 * No network I/O.
 */
export function parseRemoteUrl(url: string): RemoteIdentity | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // SSH: git@host:path
  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return identityFromHostPath(sshMatch[1]!, sshMatch[2]!);
  }

  // ssh://git@host/path
  const sshUrlMatch = trimmed.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshUrlMatch) {
    return identityFromHostPath(sshUrlMatch[1]!, sshUrlMatch[2]!);
  }

  // HTTPS / HTTP
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    let pathname = u.pathname.replace(/\.git$/i, "").replace(/^\/+/, "");
    return identityFromHostPath(u.host, pathname, u.protocol.replace(":", ""));
  } catch {
    return undefined;
  }
}

function identityFromHostPath(
  host: string,
  rawPath: string,
  scheme = "https",
): RemoteIdentity | undefined {
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;

  // Azure DevOps: dev.azure.com/{org}/{project}/_git/{repo}
  // or {org}.visualstudio.com/{project}/_git/{repo}
  if (
    hostname === "dev.azure.com" ||
    hostname.endsWith(".visualstudio.com")
  ) {
    return parseAzure(hostname, parts, scheme);
  }

  // Bitbucket Server sometimes uses /scm/project/repo — skip specialized; cloud:
  // bitbucket.org/owner/repo
  if (hostname === "bitbucket.org" || hostname.includes("bitbucket")) {
    const owner = parts[0]!;
    const repo = parts[1]!.replace(/\.git$/i, "");
    return {
      provider: "bitbucket",
      webBase: `${scheme}://${host}`,
      owner,
      repo,
    };
  }

  if (hostname === "github.com" || hostname.includes("github")) {
    return {
      provider: "github",
      webBase: `${scheme}://${host}`,
      owner: parts[0]!,
      repo: parts[1]!.replace(/\.git$/i, ""),
    };
  }

  if (hostname === "gitlab.com" || hostname.includes("gitlab")) {
    // GitLab can have nested groups: a/b/c/repo — last is repo, rest owner path
    const repo = parts[parts.length - 1]!.replace(/\.git$/i, "");
    const owner = parts.slice(0, -1).join("/");
    return {
      provider: "gitlab",
      webBase: `${scheme}://${host}`,
      owner,
      repo,
    };
  }

  // Best-effort self-hosted: treat as github-like owner/repo
  if (parts.length >= 2) {
    return {
      provider: "unknown",
      webBase: `${scheme}://${host}`,
      owner: parts[0]!,
      repo: parts[1]!.replace(/\.git$/i, ""),
    };
  }

  return undefined;
}

function parseAzure(
  hostname: string,
  parts: string[],
  scheme: string,
): RemoteIdentity | undefined {
  // dev.azure.com/org/project/_git/repo
  if (hostname === "dev.azure.com") {
    const org = parts[0];
    const project = parts[1];
    let repo: string | undefined;
    const gitIdx = parts.indexOf("_git");
    if (gitIdx >= 0 && parts[gitIdx + 1]) {
      repo = parts[gitIdx + 1];
    } else if (parts[2]) {
      repo = parts[2];
    }
    if (!org || !project || !repo) return undefined;
    return {
      provider: "azuredevops",
      webBase: `${scheme}://dev.azure.com/${org}`,
      owner: org,
      project,
      repo: repo.replace(/\.git$/i, ""),
    };
  }

  // org.visualstudio.com/project/_git/repo
  const org = hostname.replace(/\.visualstudio\.com$/i, "");
  const project = parts[0];
  const gitIdx = parts.indexOf("_git");
  const repo = gitIdx >= 0 ? parts[gitIdx + 1] : parts[1];
  if (!project || !repo) return undefined;
  return {
    provider: "azuredevops",
    webBase: `${scheme}://${hostname}`,
    owner: org,
    project,
    repo: repo.replace(/\.git$/i, ""),
  };
}

export function branchUrl(identity: RemoteIdentity, branch: string): string {
  const b = encodeURIComponent(branch).replace(/%2F/g, "/");
  switch (identity.provider) {
    case "github":
    case "unknown":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/tree/${b}`;
    case "gitlab":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/-/tree/${b}`;
    case "bitbucket":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/branch/${b}`;
    case "azuredevops":
      return `${identity.webBase}/${identity.project}/_git/${identity.repo}?version=GB${encodeURIComponent(branch)}`;
    default:
      return `${identity.webBase}/${identity.owner}/${identity.repo}/tree/${b}`;
  }
}

export function commitUrl(identity: RemoteIdentity, sha: string): string {
  switch (identity.provider) {
    case "github":
    case "unknown":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/commit/${sha}`;
    case "gitlab":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/-/commit/${sha}`;
    case "bitbucket":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/commits/${sha}`;
    case "azuredevops":
      return `${identity.webBase}/${identity.project}/_git/${identity.repo}/commit/${sha}`;
    default:
      return `${identity.webBase}/${identity.owner}/${identity.repo}/commit/${sha}`;
  }
}

export function compareUrl(identity: RemoteIdentity, base: string, head: string): string {
  switch (identity.provider) {
    case "github":
    case "unknown":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    case "gitlab":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/-/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    case "bitbucket":
      return `${identity.webBase}/${identity.owner}/${identity.repo}/branches/compare/${encodeURIComponent(head)}%0D${encodeURIComponent(base)}`;
    case "azuredevops":
      return `${identity.webBase}/${identity.project}/_git/${identity.repo}/branchCompare?baseVersion=GB${encodeURIComponent(base)}&targetVersion=GB${encodeURIComponent(head)}`;
    default:
      return `${identity.webBase}/${identity.owner}/${identity.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  }
}
