import { describe, it, expect } from "vitest";
import { resolvePublishRemote } from "./publishRemote.js";

describe("resolvePublishRemote", () => {
  it("returns none when there are no remotes", () => {
    expect(resolvePublishRemote([], undefined)).toEqual({ ok: false, reason: "none" });
  });

  it("auto-selects the only remote", () => {
    expect(resolvePublishRemote(["origin"], undefined)).toEqual({
      ok: true,
      remote: "origin",
    });
  });

  it("uses the selected remote when multiple exist", () => {
    expect(resolvePublishRemote(["origin", "upstream"], "upstream")).toEqual({
      ok: true,
      remote: "upstream",
    });
  });

  it("does not fall back to origin when multi-remote pick is cancelled", () => {
    const result = resolvePublishRemote(["origin", "upstream"], undefined);
    expect(result).toEqual({ ok: false, reason: "cancelled" });
    // Must not invent origin on cancel
    expect(result).not.toMatchObject({ ok: true });
  });
});
