import { describe, it, expect } from "vitest";
import { churnMarkHeight, isFileHistoryClientMessage } from "./protocol.js";

describe("file history protocol (P20)", () => {
  it("scales mark heights", () => {
    expect(churnMarkHeight(0, 0, 10)).toBe(4);
    expect(churnMarkHeight(10, 0, 10)).toBe(40);
    expect(churnMarkHeight(5, 5, 10)).toBe(40);
  });

  it("validates client messages", () => {
    expect(isFileHistoryClientMessage({ type: "fh:ready" })).toBe(true);
    expect(isFileHistoryClientMessage({ type: "fh:open", payload: { sha: "a" } })).toBe(true);
    expect(isFileHistoryClientMessage({})).toBe(false);
  });
});
