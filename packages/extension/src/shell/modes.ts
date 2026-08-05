/**
 * Pure mode profile apply/restore for GitSpecs True Clone (P24d).
 * No vscode imports — extension shell maps config get/update.
 */

export type GitSpecsModeId = "zen" | "review" | "inspect" | "";

/** Flat configuration keys under the `gitspecs` section (dot paths after `gitspecs.`). */
export type ModeSettingKey =
  | "currentLine.enabled"
  | "blame.statusBar"
  | "blame.codeLens"
  | "blame.heatmap"
  | "hovers.enabled"
  | "hovers.currentLine.details"
  | "hovers.currentLine.changes"
  | "annotations.changes"
  | "mode.statusBar";

export type ModeSettingSnapshot = Partial<Record<ModeSettingKey, boolean | string>>;

export interface ModeProfile {
  id: Exclude<GitSpecsModeId, "">;
  label: string;
  /** Values applied when entering the mode. */
  settings: ModeSettingSnapshot;
}

/** Built-in profiles (GitLens-like intent, gitspecs.* keys only). */
export const MODE_PROFILES: Record<Exclude<GitSpecsModeId, "">, ModeProfile> = {
  zen: {
    id: "zen",
    label: "Zen",
    settings: {
      "currentLine.enabled": false,
      "blame.codeLens": false,
      "blame.heatmap": false,
      "hovers.enabled": false,
      "annotations.changes": false,
    },
  },
  review: {
    id: "review",
    label: "Review",
    settings: {
      "currentLine.enabled": true,
      "blame.codeLens": true,
      "blame.heatmap": true,
      "hovers.enabled": true,
      "hovers.currentLine.details": true,
      "hovers.currentLine.changes": true,
      "annotations.changes": true,
    },
  },
  inspect: {
    id: "inspect",
    label: "Inspect",
    settings: {
      "currentLine.enabled": true,
      "blame.codeLens": true,
      "hovers.enabled": true,
      "hovers.currentLine.details": true,
      "annotations.changes": false,
    },
  },
};

export const MODE_SNAPSHOT_KEYS: ModeSettingKey[] = [
  "currentLine.enabled",
  "blame.statusBar",
  "blame.codeLens",
  "blame.heatmap",
  "hovers.enabled",
  "hovers.currentLine.details",
  "hovers.currentLine.changes",
  "annotations.changes",
  "mode.statusBar",
];

/**
 * Capture current values for keys that a profile will touch (plus common chrome keys).
 */
export function captureModeSnapshot(
  get: (key: ModeSettingKey) => boolean | string | undefined,
  profile: ModeProfile,
): ModeSettingSnapshot {
  const keys = new Set<ModeSettingKey>([
    ...MODE_SNAPSHOT_KEYS,
    ...(Object.keys(profile.settings) as ModeSettingKey[]),
  ]);
  const snap: ModeSettingSnapshot = {};
  for (const key of keys) {
    const v = get(key);
    if (v !== undefined) snap[key] = v;
  }
  return snap;
}

/**
 * Compute setting updates to apply when entering a mode.
 * Returns ordered list of [key, value] pairs (profile settings only).
 */
export function modeApplyPatches(
  profile: ModeProfile,
): Array<[ModeSettingKey, boolean | string]> {
  return Object.entries(profile.settings) as Array<[ModeSettingKey, boolean | string]>;
}

/**
 * Compute setting updates to restore a prior snapshot (all keys present in snap).
 */
export function modeRestorePatches(
  snapshot: ModeSettingSnapshot,
): Array<[ModeSettingKey, boolean | string]> {
  return Object.entries(snapshot) as Array<[ModeSettingKey, boolean | string]>;
}

/**
 * Resolve next mode when toggling Zen: enter zen if not zen, else leave to "".
 */
export function toggleZenMode(current: GitSpecsModeId): GitSpecsModeId {
  return current === "zen" ? "" : "zen";
}

/**
 * Resolve next mode when toggling Review.
 */
export function toggleReviewMode(current: GitSpecsModeId): GitSpecsModeId {
  return current === "review" ? "" : "review";
}

export function isKnownMode(id: string): id is Exclude<GitSpecsModeId, ""> {
  return id === "zen" || id === "review" || id === "inspect";
}

export function modeStatusBarText(mode: GitSpecsModeId): string | undefined {
  if (!mode || !isKnownMode(mode)) return undefined;
  return `$(eye) ${MODE_PROFILES[mode].label}`;
}
