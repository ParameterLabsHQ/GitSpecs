import { describe, it, expect } from "vitest";
import { formatContributorTreeRow } from "./format.js";

describe("contributors format", () => {
  it("formats name, commit count, email", () => {
    const row = formatContributorTreeRow({
      name: "Ada",
      email: "ada@example.com",
      commits: 12,
    });
    expect(row.label).toBe("Ada");
    expect(row.description).toContain("12 commits");
    expect(row.description).toContain("ada@example.com");
    expect(row.tooltip).toContain("Ada");
  });

  it("singular commit label", () => {
    const row = formatContributorTreeRow({ name: "Bob", commits: 1 });
    expect(row.description).toContain("1 commit");
  });
});
