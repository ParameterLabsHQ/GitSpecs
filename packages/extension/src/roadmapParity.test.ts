/**
 * Structural checks that the committed GitLens-parity roadmap remains complete
 * and consistent with monorepo module reality (docs-only contract tests).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("docs/ROADMAP.md GitLens parity contract", () => {
  const roadmap = read("docs/ROADMAP.md");

  it("exists and uses GitSpecs / ParameterLabsHQ branding", () => {
    expect(existsSync(path.join(repoRoot, "docs/ROADMAP.md"))).toBe(true);
    expect(roadmap).toContain("GitSpecs");
    expect(roadmap).toContain("ParameterLabsHQ");
    expect(roadmap).not.toMatch(/\bgitPlatform\./);
  });

  it("defines ordered phases covering defining GitLens surface areas", () => {
    const requiredHeadings = [
      "Phase P0",
      "Phase P1",
      "Phase P2",
      "Phase P3",
      "Phase P4",
      "Phase P5",
      "Phase P6",
      "Phase P7",
      "Phase P8",
      "Phase P9",
      "Phase P10",
      "Phase P11",
      "Phase P12",
      "Phase P13",
      "Phase P14",
    ];
    for (const h of requiredHeadings) {
      expect(roadmap, `missing ${h}`).toContain(h);
    }

    // Defining areas (criterion 1)
    expect(roadmap.toLowerCase()).toMatch(/blame/);
    expect(roadmap).toMatch(/CodeLens/i);
    expect(roadmap).toMatch(/status-bar|status bar/i);
    expect(roadmap.toLowerCase()).toMatch(/file history/);
    expect(roadmap.toLowerCase()).toMatch(/line history/);
    expect(roadmap.toLowerCase()).toMatch(/compare/);
    expect(roadmap.toLowerCase()).toMatch(/worktree/);
    expect(roadmap.toLowerCase()).toMatch(/branch/);
    expect(roadmap.toLowerCase()).toMatch(/commit graph|graph/);
    expect(roadmap.toLowerCase()).toMatch(/stash/);
    expect(roadmap.toLowerCase()).toMatch(/remote/);
    expect(roadmap).toMatch(/Done means/i);
  });

  it("marks shipped vs incomplete honestly vs the tree", () => {
    // Shipped modules present
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/worktrees.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/branches.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/blame.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/history.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/host-urls/src/index.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/extension/src/modules/history/commands.ts"))).toBe(
      true,
    );

    // Graph still stub (README only, no library ops)
    expect(existsSync(path.join(repoRoot, "packages/extension/src/modules/graph/README.md"))).toBe(
      true,
    );
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/graph.ts"))).toBe(false);

    // Roadmap must claim file/line history shipped; graph not started
    expect(roadmap).toMatch(/File history[\s\S]{0,120}\*\*Shipped\*\*/i);
    expect(roadmap).toMatch(/Line history[\s\S]{0,120}\*\*Shipped\*\*/i);
    expect(roadmap).toMatch(/Commit Graph[\s\S]{0,120}\*\*Not started\*\*/i);
    // Blame and worktrees claimed shipped
    expect(roadmap).toMatch(/Worktree management[\s\S]{0,80}\*\*Shipped\*\*/);
    expect(roadmap).toMatch(/File blame[\s\S]{0,80}\*\*Shipped\*\*/);
  });

  it("labels cloud/AI items as non-parity and states implementation order", () => {
    expect(roadmap).toMatch(/Launchpad/);
    expect(roadmap).toMatch(/Cloud Patches/);
    expect(roadmap).toMatch(/Code Suggest|AI commit/i);
    expect(roadmap).toMatch(/out of open-source parity|non-parity|Non-goals/i);
    // Implementation order still documented (remaining sequence or full history)
    expect(roadmap).toMatch(/P10 → P11|P9 → P10|P8 → P9|P6 → P7|P2 → P4 → P5/);
    expect(roadmap).toMatch(/\*\*P2\*\*|Phase P2/);
  });
});

describe("AGENTS.md / README point at complete roadmap", () => {
  it("links docs/ROADMAP.md", () => {
    const agents = read("AGENTS.md");
    const readme = read("README.md");
    expect(agents).toMatch(/docs\/ROADMAP\.md/);
    expect(readme).toMatch(/docs\/ROADMAP\.md/);
    expect(agents).toMatch(/P0–P14|P0-P14|P2/);
  });
});
