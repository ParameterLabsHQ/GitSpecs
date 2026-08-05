# Git Platform — Design Spec (v1)

**Date:** 2026-08-04  
**Status:** Draft for implementation planning  
**License:** GPL-3.0-only  
**Working product name:** Git Platform (repo: `gitlens-clone`; branding can change without affecting architecture)

## 1. Intent

Build an open-source VS Code / Cursor extension that replaces the **paid GitLens** workflows the author actually needs: full **worktree** and **branch** management. Structure the codebase as a **GitLens-style platform shell** so later modules (blame, history, graph) can land without rewrites, but **do not implement those modules in v1**.

### Success criteria (v1 “done”)

- Installable and usable as a **daily driver in Cursor** (and VS Code) from a local VSIX or `F5` dev host.
- **Worktrees** and **Branches** sidebars are reliable on real multi-root and single-root repos.
- All v1 actions listed below work end-to-end against system Git.
- Failures are understandable (notifications + output channel); no silent breakage on refresh.
- README covers run-from-source, packaging a VSIX, and required Git version.
- Marketplace / Open VSX publish is **out of scope** for v1.

### Non-goals (v1)

- Inline blame, CodeLens, heatmaps, commit graph UI, file/line history webviews.
- Hosting provider APIs, PATs, PR creation, issue integration.
- Interactive rebase editor UI; custom merge conflict UI beyond surfacing Git errors and status.
- isomorphic-git or embedding a Git binary; **system `git` only**.

## 2. Product decisions (locked)

| Topic | Decision |
|-------|----------|
| Product shape | Platform shell; v1 modules = Worktrees + Branches only |
| Worktrees depth | Core lifecycle + daily workflow (see §5.1) |
| Branches depth | Full local/remote toolkit including merge/rebase/cherry-pick/compare (see §5.2) |
| Hosting links | URL-only from remote parse; no network auth |
| License | GPL-3.0-only (future relicense possible only for code under copyright-holder control; prefer DCO/CLA if contributors join) |
| Architecture | Layered monorepo: `git-core`, `host-urls`, `extension` |
| Editors | VS Code Extension API → works in VS Code and Cursor |

## 3. Architecture

### 3.1 Runtime

```
Cursor / VS Code
└── Extension Host (packages/extension)
    ├── modules/worktrees  (TreeView, commands)
    ├── modules/branches   (TreeView, commands)
    ├── shell              (RepoContext, RefreshBus, errors, settings)
    ├── git-core           (spawn git, typed ops)
    └── host-urls          (remote → browser URL)
            │
            ▼
      system git CLI
```

### 3.2 Monorepo layout

```
/
├── packages/
│   ├── git-core/           # pure TS; no vscode
│   ├── host-urls/          # pure TS; no vscode
│   └── extension/          # VS Code extension package (VSIX root)
│       └── src/
│           ├── shell/
│           ├── modules/
│           │   ├── worktrees/
│           │   ├── branches/
│           │   ├── history/    # stub only
│           │   ├── blame/      # stub only
│           │   └── graph/      # stub only
│           └── extension.ts
├── docs/
│   └── superpowers/
│       └── specs/
├── package.json            # pnpm/npm workspaces root
├── LICENSE                 # GPL-3.0-only
└── README.md
```

**Package manager:** `pnpm` workspaces (required for v1 scripts/docs; switch only if a hard blocker appears).

### 3.3 Principles

1. **`git-core` owns every Git invocation.** The extension never calls `child_process` for git except through `git-core`.
2. **Modules own UX.** Each feature module registers commands, views, and menus; the shell provides repo context and refresh only.
3. **One current repository context.** Multi-root: current repo defaults to the git root of the active editor’s workspace folder, else the first discovered root; user can switch via command/status affordance.
4. **System Git required.** Configurable `gitPlatform.git.path` (fallback: `git` on `PATH`). Document minimum Git version: **2.23+** (for `git switch` / modern worktree flows); prefer 2.25+ where needed.
5. **Native IDE UI for v1.** TreeView + QuickPick + InputBox + native confirms; no custom webview sidebars in v1 (compare results may use OutputChannel or a simple readonly webview/markdown panel if TreeView is insufficient).

### 3.4 Tech stack (recommended defaults)

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict) |
| Extension engine | VS Code API compatible with VS Code 1.85+ / current Cursor |
| Build | esbuild bundle for extension entry; `tsc` project references for `git-core` and `host-urls` |
| Test | vitest for `git-core` and `host-urls`; extension smoke via `@vscode/test-electron` optional in v1 if timeboxed |
| Lint/format | ESLint + Prettier |
| CI | deferred until public launch bar; local `pnpm test` / `pnpm package` scripts in v1 |

## 4. Components

### 4.1 `packages/git-core`

**Discovery**

- `findGit(pathOverride?: string): Promise<GitBinary>`
- `discoverRepos(paths: string[]): Promise<RepoRoot[]>`
- `openRepository(root: string, git: GitBinary): GitRepository`

**`GitRepository` capabilities**

Worktrees:

- `worktrees.list()`
- `worktrees.add({ path, branch?, startPoint?, createBranch?: boolean })`
- `worktrees.remove({ path, force?: boolean })`
- `worktrees.prune()`
- `worktrees.lock(path)` / `worktrees.unlock(path)` when supported (implement if CLI surface is straightforward; otherwise defer without blocking v1)

Branches:

- `branches.list({ includeRemotes?: boolean })` → name, current, remote, upstream, ahead, behind, detached
- `branches.create({ name, startPoint? })`
- `branches.rename({ oldName, newName })`
- `branches.delete({ name, force?: boolean })`
- `branches.checkout({ name | commit, create?: boolean })` / prefer `switch` when available
- `branches.setUpstream({ branch, remote, remoteBranch })`
- `branches.publish({ branch, remote? })` — push `-u`
- `branches.push` / `pull` / `fetch` (repo or branch scoped as appropriate)
- `branches.deleteRemote({ remote, name })`
- `branches.merge({ ref })`
- `branches.rebase({ onto })`
- `branches.cherryPick({ commits: string[] })`
- `branches.createFromCommit({ name, commit })`
- `branches.compare({ base, head })` → ahead/behind counts + `--shortstat` summary

**Execution layer**

- `exec(repoRoot, args, opts): ExecResult` with timeout, `GIT_TERMINAL_PROMPT=0`, consistent env
- Typed errors: `GitNotFoundError`, `NotAGitRepositoryError`, `GitCommandError` (code, stderr), `GitConflictError`, `DirtyWorktreeError` (when detected)
- Prefer null-delimited porcelain (`-z`) where Git supports it

**Caching:** none required in core. Extension may debounce list calls; core remains pure.

### 4.2 `packages/host-urls`

Pure functions:

- `parseRemoteUrl(url: string): RemoteIdentity | undefined`  
  Providers: GitHub, GitLab (incl. self-hosted heuristic via path shape when `web` base known from remote), Bitbucket, Azure DevOps.
- `branchUrl(identity, branch): string`
- `commitUrl(identity, sha): string`
- `compareUrl(identity, base, head): string`

No HTTP. Unknown remotes → command shows a clear “can’t open remote for this URL” message.

Self-hosted GitLab/GitHub Enterprise: support when remote host is non-github.com but path matches `org/repo` and scheme is http(s)/ssh — build URLs from the remote host as the web base (best-effort).

### 4.3 Extension shell

| Piece | Responsibility |
|-------|----------------|
| Activation | Find git, discover repos, construct `RepoContext`, register modules |
| `RepoContext` | `repos[]`, `current`, `setCurrent`, `onDidChange` |
| `RefreshBus` | Coalesce SCM + `.git` fs watches + manual refresh into view refresh |
| Error presenter | Map typed errors → `window.showErrorMessage` / warning; “Show Output” action |
| Output channel | Name: `Git Platform`; log argv + exit code + stderr (never tokens; we don’t store tokens in v1) |
| Settings | See §6 |
| Activity bar | Container **Git Platform** with views **Worktrees** and **Branches** |

### 4.4 Module: Worktrees

**Tree**

- Nodes: worktree path (label), description = branch or detached SHA short, icon distinguishes **current** worktree
- Show prunable/locked in description or icon tooltip when known

**Commands**

| Command | Behavior |
|---------|----------|
| Create worktree… | QuickPick: existing branch vs new branch from ref; path input with default template; then `worktree add`; prompt open current vs new window |
| Open in current window | `vscode.openFolder(uri, false)` |
| Open in new window | `vscode.openFolder(uri, true)` |
| Reveal in File Explorer | `revealFileInOS` |
| Copy path | clipboard |
| Remove worktree… | confirm; optional force if Git requires |
| Prune worktrees | confirm if any prunable; run prune |
| Refresh | emit RefreshBus |

**Default path template (setting):** sibling directory pattern  
`${repoName}-${branch}` under parent of repo root, overridable via `gitPlatform.worktrees.defaultLocation`.

### 4.5 Module: Branches

**Tree groups**

1. **Current** — HEAD (branch or detached)
2. **Local** — non-current locals; description shows upstream + ahead/behind (`↑2 ↓1`)
3. **Remote** — nested by remote name

**Commands**

| Command | Behavior |
|---------|----------|
| Create branch… | name + optional start point |
| Rename… | local only |
| Delete… / Delete (force)… | confirm; force separate command or modal option |
| Checkout / Switch | |
| Publish… / Push / Pull / Fetch | |
| Set upstream… | pick remote + branch |
| Delete remote branch… | confirm |
| Merge into current… | pick ref; handle conflicts via error + status |
| Rebase current onto… | pick ref |
| Cherry-pick… | pick commit(s) via QuickPick from recent log (last 50 commits) |
| Create branch from commit… | pick commit + name |
| Compare with… | pick other ref; show ahead/behind + shortstat in Output channel and/or informational message |
| Copy branch name | |
| Open on Remote | `host-urls` + `env.openExternal` |
| Refresh | |

Destructive and history-rewriting operations always confirm. Merge/rebase/cherry-pick refuse or warn when index/worktree dirty if Git would fail; surface stderr when Git fails mid-operation.

### 4.6 Future module stubs

`history`, `blame`, `graph` directories contain only a one-line README: “Reserved for post-v1.” Not registered in `package.json` contributes.

## 5. Feature acceptance lists

### 5.1 Worktrees (must)

- [ ] List all worktrees for current repo with branch/HEAD
- [ ] Create from existing branch
- [ ] Create with new branch from ref
- [ ] Open in current window
- [ ] Open in new window
- [ ] Reveal in OS
- [ ] Copy path
- [ ] Remove worktree (with confirm)
- [ ] Prune
- [ ] Refresh on manual + after successful mutations

### 5.2 Branches (must)

- [ ] List local + remote with current indicator
- [ ] Ahead/behind vs upstream when upstream set
- [ ] Create, rename, delete (safe + force)
- [ ] Checkout/switch
- [ ] Set upstream, publish, push, pull, fetch
- [ ] Delete remote branch
- [ ] Merge, rebase, cherry-pick (non-interactive)
- [ ] Create branch from commit
- [ ] Compare two refs (summary)
- [ ] Copy name
- [ ] Open branch on remote host (URL-only) when remote parseable
- [ ] Confirmations on destructive actions

## 6. Settings (v1)

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `gitPlatform.git.path` | string | `""` | Git binary override |
| `gitPlatform.worktrees.defaultLocation` | string | `""` | Base dir for new worktrees; empty = parent of repo |
| `gitPlatform.worktrees.pathTemplate` | string | `${repoName}-${branch}` | Path leaf template |
| `gitPlatform.worktrees.openInNewWindow` | boolean | `true` | Default after create |
| `gitPlatform.confirmDelete` | boolean | `true` | Confirm deletes |
| `gitPlatform.log.verbosity` | enum | `info` | Output channel detail |

## 7. Data flow and refresh

### 7.1 Startup

1. Activate extension (on startup or on view visible — prefer **view-visible + on command** to stay light; also `workspaceContains` `.git` if needed).
2. Resolve git binary → discover repos from `workspace.workspaceFolders`.
3. Set `current` repo.
4. Modules bind TreeDataProviders to `RepoContext.current`.
5. Subscribe RefreshBus.

### 7.2 Mutation flow

```
User command
  → QuickPick / Input / Confirm
  → git-core operation
  → on success: RefreshBus.fire(repo)
  → on failure: ErrorPresenter + log
  → TreeDataProvider.getChildren re-queries git-core.list*
```

### 7.3 External change flow

- `vscode.scm` / repository state changes when available
- `fs.watch` on `<root>/.git/HEAD`, `refs/**`, `worktrees/**` (debounced 200–500ms)
- Window focus gain → soft refresh (debounced)

### 7.4 Multi-root

- Command: **Git Platform: Switch Repository…**
- Views’ title or description shows current repo name
- Worktree “open” may open a folder that is already another workspace root — still call `openFolder` per user choice

## 8. Error handling

| Situation | UX |
|-----------|-----|
| Git not found | Sticky error on activate with settings link |
| Not a git repo | Views show empty state message: “No Git repository” |
| Command non-zero | Error toast with first meaningful stderr line; full detail in Output |
| Merge/rebase conflict | Error explaining conflict; leave repo state to Git; suggest Source Control view |
| User cancel QuickPick | Silent no-op |
| Unknown remote for Open | Info message; no throw |

Never block the extension host with unbounded git; default timeout (e.g. 60s) on exec; longer optional for fetch/pull.

## 9. Testing strategy

### 9.1 `git-core` (primary)

- Unit tests with **temporary real git repos** (vitest + `fs.mkdtemp` + actual `git` on CI agent/dev machine).
- Cover: worktree add/list/remove/prune; branch CRUD; ahead/behind; compare; merge/rebase happy path; conflict produces typed/detectable failure.
- Host-urls: table-driven URL parse/build for each provider + SSH forms.

### 9.2 Extension

- Manual checklist (§5) in Cursor against a multi-worktree fixture repo.
- Optional: `@vscode/test-electron` smoke (activate + open fixture) if cost is low; not a v1 gate.

### 9.3 Quality bar before calling v1 done

- `pnpm test` green for libraries
- Manual checklist complete on macOS (author’s platform); note Linux/Windows as best-effort until contributors verify

## 10. Packaging and developer UX

- Extension package id: `gitplatform.git-platform` (publisher `gitplatform` until a real marketplace identity exists)
- Display name: **Git Platform**
- Scripts: `build`, `test`, `watch`, `package` (`vsce package` / `@vscode/vsce`)
- README: features, requirements (Git), run from source, install VSIX in Cursor, license
- `LICENSE` GPL-3.0-only text at root; each package `"license": "GPL-3.0-only"`

## 11. Security and safety

- No secrets storage in v1.
- Confirm before delete worktree, delete branch, delete remote branch, force delete.
- Log git args but not file contents.
- All operations use the user’s existing Git credentials/ssh-agent via normal Git — we do not reimplement auth.

## 12. Implementation phases (for planning skill)

Suggested build order (not a full task plan):

1. Monorepo scaffold, GPL license, strict TS, empty extension activates
2. `git-core` exec + repo discovery + tests
3. Worktrees API + tests → Worktrees view + commands
4. Branches API + tests → Branches view + commands (local first, then remote, then merge/rebase/compare)
5. `host-urls` + Open on Remote
6. RefreshBus polish, multi-root switcher, settings
7. README + VSIX package path + manual Cursor checklist

## 13. Open points (intentionally fixed by recommendation)

| Item | Resolution |
|------|------------|
| Webviews for compare | Prefer Output channel + message first; add simple panel only if unusable |
| worktree lock/move | Implement lock/unlock if cheap; move deferred |
| Cherry-pick commit picker | Recent log QuickPick (e.g. 50 commits), not full graph |
| Activation events | `onView` for both views + `onCommand` prefix |
| Branch name / product name | **Git Platform** until deliberate rename |

## 14. Relicensing note

GPL-3.0-only applies to this project as published. Copyright holders may offer future versions under a different license. Contributions should be accepted under clear terms (Developer Certificate of Origin or CLA) so relicensing remains feasible.
