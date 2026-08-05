import { describe, it, expect } from "vitest";
import { formatConflictGuidance } from "@gitspecs/git-core";

describe("rewrite conflict guidance (shipped pure helper)", () => {
  it("mentions conflicted paths for in-progress rebase", () => {
    const msg = formatConflictGuidance("rebase", ["src/a.ts", "src/b.ts"]);
    expect(msg).toMatch(/rebase/i);
    expect(msg).toContain("src/a.ts");
    expect(msg).toMatch(/Continue|Abort/i);
  });
});
