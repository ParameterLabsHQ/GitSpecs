/**
 * Structural checks for P13 deferral notes + P14 finite polish artifacts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("P13 deferral + P14 polish (finite slice)", () => {
  it("roadmap defers P13 with credential reason and ships P14 slice", () => {
    const roadmap = readFileSync(path.join(repoRoot, "docs/ROADMAP.md"), "utf8");
    expect(roadmap).toMatch(/P13[\s\S]{0,200}[Dd]eferred/);
    expect(roadmap).toMatch(/PAT|OAuth|token|secret/i);
    expect(roadmap).toMatch(/gitspecs\.blame\.heatmap|heatmap/);
    expect(roadmap).toMatch(/CONTRIBUTING/);
  });

  it("ships CONTRIBUTING and CI workflow", () => {
    expect(existsSync(path.join(repoRoot, "CONTRIBUTING.md"))).toBe(true);
    const contributing = readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8");
    expect(contributing).toContain("pnpm test");
    expect(contributing).toContain("GPL-3.0");
    expect(existsSync(path.join(repoRoot, ".github/workflows/ci.yml"))).toBe(true);
    const ci = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("ubuntu-latest");
    expect(ci).toContain("macos-latest");
    expect(ci).toContain("pnpm test");
    expect(ci).toContain("pnpm package");
  });

  it("declares heatmap setting and pure helper", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      contributes?: { configuration?: { properties?: Record<string, unknown> } };
    };
    expect(pkg.contributes?.configuration?.properties?.["gitspecs.blame.heatmap"]).toBeDefined();
    expect(existsSync(path.join(root, "src/modules/blame/heatmap.ts"))).toBe(true);
    const controller = readFileSync(
      path.join(root, "src/modules/blame/controller.ts"),
      "utf8",
    );
    expect(controller).toContain("heatmapColorForAuthorTime");
    expect(controller).toContain("overviewRulerColor");
  });
});
