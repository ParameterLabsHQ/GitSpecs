import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("commit graph contributions (P11)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: { commands?: { command: string }[]; views?: Record<string, { id: string }[]> };
  };

  it("declares graph view and action commands", () => {
    const allViews = Object.values(pkg.contributes?.views ?? {}).flat();
    expect(allViews.some((v) => v.id === "gitspecs.graph")).toBe(true);
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of [
      "gitspecs.graph.refresh",
      "gitspecs.graph.checkout",
      "gitspecs.graph.createBranch",
      "gitspecs.graph.compare",
      "gitspecs.graph.openRemote",
      "gitspecs.graph.copySha",
    ]) {
      expect(cmds).toContain(id);
    }
  });

  it("wires provider and library bounds", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerGraphCommands");
    expect(src).toContain('registerTreeDataProvider("gitspecs.graph"');
    const cmd = readFileSync(path.join(root, "src/modules/graph/commands.ts"), "utf8");
    expect(cmd).toContain("bindCommand");
    expect(cmd).toContain("runCompareInteractive");
    const graph = readFileSync(path.join(repoRoot, "packages/git-core/src/graph.ts"), "utf8");
    expect(graph).toContain("DEFAULT_GRAPH_LIMIT = 200");
    expect(graph).toContain("MAX_GRAPH_LIMIT = 500");
    expect(graph).toContain("layoutGraph");
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/graph.ts"))).toBe(true);
  });
});
