import type { RemoteInfo } from "@gitspecs/git-core";
import { parseRemoteUrl } from "@gitspecs/host-urls";

export function formatRemoteTreeRow(remote: RemoteInfo): {
  label: string;
  description: string;
  tooltip: string;
} {
  const url = remote.fetchUrl ?? remote.pushUrl ?? "";
  return {
    label: remote.name,
    description: url,
    tooltip: [
      remote.name,
      remote.fetchUrl ? `fetch: ${remote.fetchUrl}` : undefined,
      remote.pushUrl ? `push: ${remote.pushUrl}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Build a hosting repo root URL from a remote fetch/push URL (URL-only, no network).
 */
export function resolveRemoteWebUrl(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return undefined;
  const identity = parseRemoteUrl(remoteUrl);
  if (!identity) return undefined;
  // Azure DevOps includes project segment when present
  if (identity.provider === "azuredevops" && identity.project) {
    return `${identity.webBase}/${identity.owner}/${identity.project}/_git/${identity.repo}`;
  }
  return `${identity.webBase}/${identity.owner}/${identity.repo}`;
}
