import { describe, it, expect } from "vitest";
import { isRebaseClientMessage, REBASE_ACTIONS } from "./protocol.js";

describe("rebase protocol (P19)", () => {
  it("lists standard actions", () => {
    expect(REBASE_ACTIONS).toContain("pick");
    expect(REBASE_ACTIONS).toContain("squash");
    expect(REBASE_ACTIONS).toContain("drop");
  });

  it("isRebaseClientMessage accepts known types", () => {
    expect(isRebaseClientMessage({ type: "rebase:ready" })).toBe(true);
    expect(isRebaseClientMessage({ type: "rebase:apply", payload: { rows: [] } })).toBe(
      true,
    );
    expect(isRebaseClientMessage({ type: "nope" })).toBe(false);
  });
});
