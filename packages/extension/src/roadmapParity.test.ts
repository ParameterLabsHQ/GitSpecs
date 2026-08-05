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
      "Phase P15",
      "Phase P16",
      "Phase P17",
      "Phase P18",
      "Phase P19",
      "Phase P20",
      "Phase P21",
      "Phase P22",
      "Phase P23",
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

    // Graph library + module present (P11 shipped as high-density tree)
    expect(existsSync(path.join(repoRoot, "packages/extension/src/modules/graph/README.md"))).toBe(
      true,
    );
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/graph.ts"))).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "packages/extension/src/modules/graph/provider.ts")),
    ).toBe(true);

    // Roadmap must claim file/line history and graph shipped
    expect(roadmap).toMatch(/File history[\s\S]{0,120}\*\*Shipped\*\*/i);
    expect(roadmap).toMatch(/Line history[\s\S]{0,120}\*\*Shipped\*\*/i);
    expect(roadmap).toMatch(/Commit Graph[\s\S]{0,160}\*\*Shipped\*\*/i);
    // Blame and worktrees claimed shipped
    expect(roadmap).toMatch(/Worktree management[\s\S]{0,80}\*\*Shipped\*\*/);
    expect(roadmap).toMatch(/File blame[\s\S]{0,80}\*\*Shipped\*\*/);
  });

  it("covers the full-parity expansion areas (P15–P23) with honest status", () => {
    // Defining areas of the 2026-08-05 scope expansion
    expect(roadmap).toMatch(/revision navigation/i);
    expect(roadmap).toMatch(/changes annotations/i);
    expect(roadmap).toMatch(/terminal links/i);
    expect(roadmap).toMatch(/autolinks/i);
    expect(roadmap).toMatch(/multi-repo/i);
    expect(roadmap).toMatch(/webview platform/i);
    expect(roadmap).toMatch(/interactive rebase sequence editor/i);
    expect(roadmap).toMatch(/visual file history/i);
    expect(roadmap).toMatch(/vscode\.authentication/);
    expect(roadmap).toMatch(/SecretStorage/);
    expect(roadmap).toMatch(/work hub/i);
    expect(roadmap).toMatch(/BYO[- ]key/i);
    // Honesty: no P15+ area may claim Shipped until code exists
    if (!existsSync(path.join(repoRoot, "packages/extension/src/modules/revision"))) {
      expect(roadmap).toMatch(/Revision navigation[\s\S]{0,160}\*\*Not started\*\*/i);
    }
    if (!existsSync(path.join(repoRoot, "packages/extension/src/webviews"))) {
      expect(roadmap).toMatch(/Commit Graph webview[\s\S]{0,160}\*\*Not started\*\*/i);
    }
    // Clean-room licensing rule must remain stated
    expect(roadmap).toMatch(/clean-room/i);
    expect(roadmap).toMatch(/src\/plus/);
    // Gap analysis evidence doc exists and is linked
    expect(
      existsSync(
        path.join(repoRoot, "docs/superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md"),
      ),
    ).toBe(true);
    expect(roadmap).toMatch(/2026-08-05-gitlens-parity-gap-analysis\.md/);
  });

  it("labels cloud/AI items as non-parity and states implementation order", () => {
    expect(roadmap).toMatch(/Launchpad/);
    expect(roadmap).toMatch(/Cloud Patches/);
    expect(roadmap).toMatch(/Code Suggest|AI commit/i);
    expect(roadmap).toMatch(/out of open-source parity|non-parity|Non-goals/i);
    // Implementation order still documented (remaining sequence or full history)
    expect(roadmap).toMatch(
      /P13 deferred|P12 →|\(P13\?\)|P11 → P12|P10 → P11|P9 → P10|P8 → P9|P6 → P7|P2 → P4 → P5/,
    );
    expect(roadmap).toMatch(/\*\*P2\*\*|Phase P2/);
  });
});

describe("AGENTS.md / README point at complete roadmap", () => {
  it("links docs/ROADMAP.md", () => {
    const agents = read("AGENTS.md");
    const readme = read("README.md");
    expect(agents).toMatch(/docs\/ROADMAP\.md/);
    expect(readme).toMatch(/docs\/ROADMAP\.md/);
    expect(agents).toMatch(/P0–P23|P0-P23/);
    // AGENTS.md must name the current next slice and the clean-room rule.
    // After P17 ships, next incomplete phase is P18.
    expect(agents).toMatch(/Next implementation slice[\s\S]{0,120}P18/);
    expect(agents).toMatch(/clean-room/i);
  });
});
