export type PublishRemoteResult =
  | { ok: true; remote: string }
  | { ok: false; reason: "none" | "cancelled" };

/**
 * Choose which remote to publish to.
 * - 0 remotes → none
 * - 1 remote → that remote
 * - 2+ remotes → require an explicit selection; cancel must not fall back to origin
 */
export function resolvePublishRemote(
  remotes: string[],
  selected: string | undefined,
): PublishRemoteResult {
  if (remotes.length === 0) {
    return { ok: false, reason: "none" };
  }
  if (remotes.length === 1) {
    return { ok: true, remote: remotes[0]! };
  }
  if (!selected) {
    return { ok: false, reason: "cancelled" };
  }
  return { ok: true, remote: selected };
}
