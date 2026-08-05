/**
 * Structural checks for Tags & Remotes (P9).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("tags & remotes contributions (P9)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string }[];
      views?: Record<string, { id: string; name: string }[]>;
      menus?: { "view/item/context"?: { command: string; when: string }[] };
    };
  };

  it("declares tags and remotes views and commands", () => {
    const side = pkg.contributes?.views?.gitspecs ?? [];
    expect(side.some((v) => v.id === "gitspecs.tags")).toBe(true);
    expect(side.some((v) => v.id === "gitspecs.remotes")).toBe(true);
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of [
      "gitspecs.tags.create",
      "gitspecs.tags.delete",
      "gitspecs.tags.checkout",
      "gitspecs.remotes.fetch",
      "gitspecs.remotes.open",
      "gitspecs.remotes.copyUrl",
    ]) {
      expect(cmds).toContain(id);
    }
  });

  it("activates on tags/remotes views", () => {
    expect(pkg.activationEvents).toContain("onView:gitspecs.tags");
    expect(pkg.activationEvents).toContain("onView:gitspecs.remotes");
  });

  it("wires context menus with viewItem tags", () => {
    const items = pkg.contributes?.menus?.["view/item/context"] ?? [];
    const tagMenus = items.filter((m) => m.command.startsWith("gitspecs.tags."));
    const remMenus = items.filter((m) => m.command.startsWith("gitspecs.remotes."));
    expect(tagMenus.length).toBeGreaterThan(0);
    expect(remMenus.length).toBeGreaterThan(0);
    for (const m of tagMenus) {
      expect(m.when).toMatch(/viewItem == tag/);
    }
    for (const m of remMenus) {
      expect(m.when).toMatch(/viewItem == remote/);
    }
  });

  it("registers modules in extension entry with bindCommand", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerTagCommands");
    expect(src).toContain("registerRemoteCommands");
    expect(src).toContain('registerTreeDataProvider("gitspecs.tags"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.remotes"');
    const tagsCmd = readFileSync(path.join(root, "src/modules/tags/commands.ts"), "utf8");
    const remCmd = readFileSync(path.join(root, "src/modules/remotes/commands.ts"), "utf8");
    expect(tagsCmd).toContain("bindCommand");
    expect(remCmd).toContain("bindCommand");
    expect(tagsCmd).not.toMatch(/spawn\s*\(/);
    expect(remCmd).not.toMatch(/spawn\s*\(/);
  });

  it("git-core exposes tags and remotes APIs", () => {
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/tags.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/remotes.ts"))).toBe(true);
    const repo = readFileSync(path.join(repoRoot, "packages/git-core/src/repository.ts"), "utf8");
    expect(repo).toContain("tags");
    expect(repo).toContain("remotes");
  });
});
