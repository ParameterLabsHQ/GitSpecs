# GitSpecs

Open-source **GitLens-style** tooling for **VS Code** and **Cursor** (GPL-3.0-only): worktrees, branches, commits browser, blame, history, compare, and commit search today, with a phased path toward broader local feature parity.

**Roadmap (implementation order):** [docs/ROADMAP.md](./docs/ROADMAP.md) — phases P0–P14, status inventory, and what is deliberately *not* parity (cloud/AI).

## Requirements

- **Git 2.23+** on your `PATH` (2.25+ recommended). System Git only; nothing is embedded.
- **Node.js 18+** and **pnpm** 9+ to build from source.
- VS Code **1.85+** or a current **Cursor** build.

## Features (v1)

### Source Control tab (GitLens-style)

**Worktrees**, **Branches**, and **Commits** appear as title-bar tabs in a single **GitSpecs** panel under **Source Control** (alongside the built-in Changes list), with the same create/refresh actions and context menus as the dedicated sidebar.

### Dedicated activity bar

A **GitSpecs** icon in the activity bar hosts the same Worktrees, Branches, and Commits views full-height.

### Worktrees

List, create (existing branch or new branch from ref), open in current/new window, reveal in OS, copy path, remove, prune.

### Branches

Local + remote listing with upstream ahead/behind, create/rename/delete (safe + force), checkout/switch, publish/push/pull/fetch, set upstream, delete remote branch, merge, rebase, cherry-pick, create from commit, **Compare** (ahead/behind, shortstat, changed files, host URL), copy name, **Open on Remote** (URL-only for GitHub/GitLab/Bitbucket/Azure DevOps — no API tokens).

### File blame

- **GitSpecs: Toggle File Blame** — end-of-line annotations (author • date • sha • summary) with hover detail  
- **GitSpecs: Show Line Blame** — message for the current line  
- **GitSpecs: Blame File to Output** — full file dump in the GitSpecs output channel  
- Status-bar current-line blame and file-level CodeLens (settings to disable)

### Commits browser

- Activity-bar **Commits** view and SCM **Commits** tab — recent commits on the current branch  
- Context actions: copy SHA, checkout (detached, confirmed), create branch from commit, open on remote  

### History, compare & search

- **GitSpecs: File History** / **Line History** — QuickPick commits; copy SHA, open on remote, view file at revision  
- **GitSpecs: Compare References…** — two refs or ref vs working tree; file list + host compare URL  
- **GitSpecs: Search Commits…** — message and/or author; copy SHA / open on remote  

### What’s next

Local OSS parity phases **P0–P12** are shipped; **P13** hosting HTTP APIs are deferred (credentials); **P14** has a finite polish slice (blame heatmap option, CONTRIBUTING, CI). See **[docs/ROADMAP.md](./docs/ROADMAP.md)** and **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

## Monorepo layout

| Package | Role |
|---------|------|
| `@gitspecs/git-core` | System `git` CLI ops (worktrees, branches, blame, …) |
| `@gitspecs/host-urls` | Remote URL → browser links (no network) |
| `gitspecs` (publisher `ParameterLabsHQ`) | VS Code/Cursor extension |

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
2. `pnpm --filter gitspecs run build`
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

This builds the extension and writes `packages/extension/gitspecs.vsix`.

**Install in Cursor or VS Code:**

- Command Palette → **Extensions: Install from VSIX…** → select `packages/extension/gitspecs.vsix`
- Or: `cursor --install-extension packages/extension/gitspecs.vsix` / `code --install-extension …`

## License

[GPL-3.0-only](./LICENSE). Copyright holders may relicense future versions; contributions should use a DCO/CLA if the project accepts external patches.

## Design

See [docs/superpowers/specs/2026-08-04-gitspecs-design.md](./docs/superpowers/specs/2026-08-04-gitspecs-design.md).
