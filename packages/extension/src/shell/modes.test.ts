import { describe, it, expect } from "vitest";
import {
  MODE_PROFILES,
  captureModeSnapshot,
  modeApplyPatches,
  modeRestorePatches,
  modeStatusBarText,
  toggleReviewMode,
  toggleZenMode,
} from "./modes.js";

describe("mode profiles", () => {
  it("zen quiets current-line, CodeLens, hovers, heatmap, changes", () => {
    const patches = Object.fromEntries(modeApplyPatches(MODE_PROFILES.zen));
    expect(patches["currentLine.enabled"]).toBe(false);
    expect(patches["blame.codeLens"]).toBe(false);
    expect(patches["hovers.enabled"]).toBe(false);
    expect(patches["annotations.changes"]).toBe(false);
    expect(patches["blame.heatmap"]).toBe(false);
  });

  it("review enables changes annotations and heatmap", () => {
    const patches = Object.fromEntries(modeApplyPatches(MODE_PROFILES.review));
    expect(patches["annotations.changes"]).toBe(true);
    expect(patches["blame.heatmap"]).toBe(true);
    expect(patches["currentLine.enabled"]).toBe(true);
  });

  it("capture + restore round-trips prior values without permanent clobber", () => {
    const store: Record<string, boolean | string> = {
      "currentLine.enabled": true,
      "blame.codeLens": true,
      "hovers.enabled": true,
      "annotations.changes": false,
      "blame.heatmap": false,
      "blame.statusBar": true,
      "hovers.currentLine.details": true,
      "hovers.currentLine.changes": true,
      "mode.statusBar": true,
    };
    const snap = captureModeSnapshot((k) => store[k], MODE_PROFILES.zen);
    // Apply zen
    for (const [k, v] of modeApplyPatches(MODE_PROFILES.zen)) {
      store[k] = v;
    }
    expect(store["currentLine.enabled"]).toBe(false);
    expect(store["blame.codeLens"]).toBe(false);
    // Restore
    for (const [k, v] of modeRestorePatches(snap)) {
      store[k] = v;
    }
    expect(store["currentLine.enabled"]).toBe(true);
    expect(store["blame.codeLens"]).toBe(true);
    expect(store["hovers.enabled"]).toBe(true);
  });

  it("toggleZen / toggleReview flip in and out", () => {
    expect(toggleZenMode("")).toBe("zen");
    expect(toggleZenMode("zen")).toBe("");
    expect(toggleReviewMode("review")).toBe("");
    expect(toggleReviewMode("inspect")).toBe("review");
  });

  it("modeStatusBarText labels known modes", () => {
    expect(modeStatusBarText("zen")).toContain("Zen");
    expect(modeStatusBarText("")).toBeUndefined();
  });
});
