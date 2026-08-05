import { describe, it, expect } from "vitest";
import { formatTagTreeRow } from "./format.js";

describe("tags format", () => {
  it("formats name, short sha, and annotated flag", () => {
    const row = formatTagTreeRow({
      name: "v1.2.3",
      sha: "abcdef0123456789abcdef0123456789abcdef01",
      annotated: true,
      message: "release",
    });
    expect(row.label).toBe("v1.2.3");
    expect(row.description).toContain("abcdef0");
    expect(row.description).toContain("annotated");
    expect(row.description).toContain("release");
    expect(row.tooltip).toContain(row.label);
  });
});
