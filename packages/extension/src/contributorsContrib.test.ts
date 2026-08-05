import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("contributors contributions (P10)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string }[];
      views?: Record<string, { id: string }[]>;
    };
  };

  it("declares view and commands", () => {
    expect((pkg.contributes?.views?.gitspecs ?? []).some((v) => v.id === "gitspecs.contributors")).toBe(true);
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    expect(cmds).toContain("gitspecs.contributors.refresh");
    expect(cmds).toContain("gitspecs.contributors.copyName");
    expect(cmds).toContain("gitspecs.contributors.copyEmail");
  });

  it("wires extension entry and library", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerContributorCommands");
    expect(src).toContain('registerTreeDataProvider("gitspecs.contributors"');
    const cmd = readFileSync(path.join(root, "src/modules/contributors/commands.ts"), "utf8");
    expect(cmd).toContain("bindCommand");
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/contributors.ts"))).toBe(true);
    const core = readFileSync(path.join(repoRoot, "packages/git-core/src/contributors.ts"), "utf8");
    expect(core).toContain("shortlog");
    expect(core).toContain("parseShortlog");
  });
});
