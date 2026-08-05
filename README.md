# Git Platform

Open-source **worktree** and **branch** management for **VS Code** and **Cursor** — a GitLens-style platform shell (GPL-3.0-only) focused on the workflows people often hit behind a paywall.

## Requirements

- **Git 2.23+** on your `PATH` (2.25+ recommended). System Git only; nothing is embedded.
- **Node.js 18+** and **pnpm** 9+ to build from source.
- VS Code **1.85+** or a current **Cursor** build.

## Features (v1)

### Worktrees

List, create (existing branch or new branch from ref), open in current/new window, reveal in OS, copy path, remove, prune.

### Branches

Local + remote listing with upstream ahead/behind, create/rename/delete (safe + force), checkout/switch, publish/push/pull/fetch, set upstream, delete remote branch, merge, rebase, cherry-pick, create from commit, compare summary, copy name, **Open on Remote** (URL-only for GitHub/GitLab/Bitbucket/Azure DevOps — no API tokens).

## Monorepo layout

| Package | Role |
|---------|------|
| `@gitplatform/git-core` | System `git` CLI ops (worktrees, branches) |
| `@gitplatform/host-urls` | Remote URL → browser links (no network) |
| `git-platform` (publisher `gitplatform`) | VS Code/Cursor extension |

## Run from source

```bash
pnpm install
pnpm build
pnpm test
```

### Library consumer smoke (outside vitest)

```bash
pnpm consumer
```

### Debug the extension

1. Open this repo in VS Code or Cursor.
2. `pnpm --filter git-platform run build`
3. Use **Run and Debug** → “Launch Extension” if you add a launch config, or press **F5** after adding `.vscode/launch.json` that points at `packages/extension`.

Minimal launch config (create `.vscode/launch.json` at repo root):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/extension"]
    }
  ]
}
```

## Package a VSIX (install in Cursor / VS Code)

```bash
pnpm package
```

This builds the extension and writes `packages/extension/git-platform.vsix`.

**Install in Cursor or VS Code:**

- Command Palette → **Extensions: Install from VSIX…** → select `packages/extension/git-platform.vsix`
- Or: `cursor --install-extension packages/extension/git-platform.vsix` / `code --install-extension …`

## License

[GPL-3.0-only](./LICENSE). Copyright holders may relicense future versions; contributions should use a DCO/CLA if the project accepts external patches.

## Design

See [docs/superpowers/specs/2026-08-04-git-platform-design.md](./docs/superpowers/specs/2026-08-04-git-platform-design.md).
