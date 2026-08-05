# GitSpecs product roadmap — GitLens-clone must-haves

**Product:** GitSpecs (ParameterLabsHQ)  
**Date:** 2026-08-04  
**License:** GPL-3.0-only  
**Audience:** maintainers and coding agents

This roadmap defines **must-have** feature areas for an open-source GitLens-style experience in VS Code/Cursor, maps what GitSpecs already ships, and orders remaining work. It is **not** full GitLens parity.

## Must-have feature map

| Area | GitLens role | GitSpecs status | Roadmap phase |
|------|----------------|-----------------|---------------|
| **Worktree management** | Create/switch/remove worktrees | **Shipped** (library + activity bar + SCM views + commands) | Phase 0 (done) |
| **Branch management** | Local/remote toolkit, publish, merge/rebase | **Shipped** (full toolkit in `git-core` + Branches UI) | Phase 0 (done) |
| **Comparison** | Compare refs / revisions | **Partial** — `branches.compare` + command summary in Output; no dedicated compare UI | Phase 0 partial → polish in Phase 3 |
| **Authorship / blame** | Inline blame, hover/context, CodeLens-class line history of authorship | **Shipped** (`repo.blame`, toggle decorations, line/file commands) | Phase 1 (done) |
| **File / line history** | Navigate commits that touched a file or line | **Not shipped** (module stub only) | **Phase 2 (next)** |
| **Commit graph** | Visual DAG of branches/commits | **Not shipped** (module stub only) | Phase 4 |

### Explicitly deferred (not must-haves for this clone track)

- Launchpad / work-item hubs  
- AI commit messages / Code Suggest  
- Cloud Patches  
- Hosting HTTP APIs, PR creation, multi-account auth beyond URL-open  
- Interactive rebase editor UI / custom merge-conflict UI  
- Marketplace/Open VSX marketing polish (packaging already works locally)  
- Heatmaps, avatars-as-service, Pro paywalls  

## Phase 0 — Worktrees & branches platform (done)

**Done means:** Users manage worktrees and branches from GitSpecs without GitLens; system-git library ops tested; dual UI (activity bar + Source Control).

| Deliverable | Status |
|-------------|--------|
| `@gitspecs/git-core` worktrees + branches | Done |
| `@gitspecs/host-urls` open-on-remote (URL-only) | Done |
| Extension shell, settings, refresh | Done |
| SCM + sidebar views/commands | Done |
| Compare summary (ahead/behind + shortstat) | Done (basic) |

## Phase 1 — Authorship / blame (done)

**Goal:** Line-level authorship context from system git, usable from the editor.

**Done means (met):**

- Library: `repo.blame.blame` / `blameLine` via real `git blame --line-porcelain`; structured rows with `sha`, `author`, `authorTime`, `summary`, `lineNumber`, content.
- Extension: `gitspecs.blame.toggleFile` (end-of-line decorations + hover), `showLine`, `fileToOutput`; editor context/title menus.
- Tests: real-git fixtures + consumer smoke on shipped dist.

**Out of Phase 1:** Full GitLens-style always-on heatmaps, avatar CDN, blame-on-every-keystroke performance tuning beyond debounce.

## Phase 2 — File & line history

**Done means:** For a path (and optionally a line range), list commits newest-first with sha/subject/author/date; command or view to open/compare a historical revision; library uses `git log`/`git log -L` as appropriate with real-git tests.

## Phase 3 — Comparison polish

**Done means:** Beyond Output summary: pick two refs (or working tree vs ref), show ahead/behind + shortstat in a dedicated panel or tree; optional open host compare URL via `host-urls`. Reuses `branches.compare`.

## Phase 4 — Commit graph

**Done means:** Visual or structured graph of recent commits/branches (native tree or webview); navigate checkout/create-branch-from-commit. Large UI investment — after history/blame are useful daily.

## Implementation order (agents)

1. Keep Phase 0–1 green (`pnpm test`, `pnpm package`).  
2. **Ship Phase 2 file/line history** next.  
3. New phases get a short design note under `docs/superpowers/specs/` when they grow beyond a single PR.  
4. Branding stays **GitSpecs** / **ParameterLabsHQ** / `gitspecs.*` (see `AGENTS.md`).

## Success criteria for “must-have clone” (long term)

A user can, without GitLens Pro:

1. Manage worktrees and branches (Phase 0)  
2. See who last changed a line and when (Phase 1)  
3. Walk file/line history (Phase 2)  
4. Compare revisions clearly (Phase 3)  
5. Orient in branch topology via a graph (Phase 4)  

Roadmap + Phase 1 implementation are complete; next agent work should start at **Phase 2**.
