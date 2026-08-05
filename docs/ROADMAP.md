# GitSpecs roadmap — GitLens-style feature parity

**Product:** GitSpecs · **Org:** ParameterLabsHQ · **Repo:** [ParameterLabsHQ/GitSpecs](https://github.com/ParameterLabsHQ/GitSpecs)  
**License:** GPL-3.0-only  
**Updated:** 2026-08-05  
**Audience:** maintainers and coding agents

This is the **single product contract** for how GitSpecs approaches open-source **GitLens-style** parity in VS Code/Cursor. It orders work into **shippable phases**, records honest **current status**, and separates **local system-git parity** from **cloud/Pro non-goals**.

> **Do not implement every phase in one goal.** Each incomplete phase should become its own design note (if large) → implementation plan → PR. Keep Phase N green before starting N+1 unless the phase explicitly allows parallel polish.

---

## 1. Parity principles

1. **System `git` only** for repository truth (`@gitspecs/git-core`). No isomorphic-git, no embedded binary.
2. **Library before UI.** Porcelain parsers and ops live in pure packages; the extension binds TreeViews, commands, decorations, CodeLens, webviews.
3. **URL remotes before hosting APIs.** `host-urls` stays network-free until a late optional phase.
4. **One current repo context** (multi-root switcher) for all views/commands.
5. **Branding:** `GitSpecs` / `ParameterLabsHQ` / `gitspecs.*` only (see `AGENTS.md`).
6. **Open-source local parity ≠ GitKraken cloud.** Launchpad, Cloud Patches, AI Commit Composer, Code Suggest, paywalls are **non-parity** (Section 5).

---

## 2. Current status vs GitLens surface (inventory)

Status is grounded in the monorepo as of this revision.

| GitLens-style area | GitSpecs status | Evidence (code) | Phase |
|--------------------|-----------------|-----------------|-------|
| Platform shell (activation, settings, refresh, multi-root) | **Shipped** | `packages/extension/src/shell/*` | P0 |
| Worktree management | **Shipped** | `git-core` `worktrees.ts`; module `modules/worktrees` | P0 |
| Branch management (local/remote toolkit) | **Shipped** | `git-core` `branches.ts`; module `modules/branches` | P0 |
| Open / copy remote URLs | **Shipped** (URL-only) | `packages/host-urls`; `gitspecs.branches.openRemote` | P0 |
| Compare (ahead/behind + shortstat + name-status + host URL) | **Shipped** | `branches.compare` (+ files); `modules/compare`; `gitspecs.compare` / `gitspecs.branches.compare` | **P6** |
| Activity-bar Worktrees + Branches | **Shipped** | `views.gitspecs` | P0 |
| SCM integration | **Shipped** (consolidated panel + tabs) | `gitspecs.scm`, `scmTabs.ts`, `scmGroupedProvider.ts` | P0 |
| File blame (toggle decorations, line, output) | **Shipped** | `git-core` `blame.ts`; `modules/blame` | P1 |
| Status-bar blame (current line) | **Shipped** | `modules/blame` status bar + `gitspecs.blame.statusBar` | **P2** |
| CodeLens (recent change / authors on symbols) | **Shipped** (file-level) | `modules/blame/codeLens.ts` + `gitspecs.blame.codeLens` | **P3** |
| Hover / rich authorship peek | **Shipped** (enriched) | Enriched decoration hover + shared blame cache | P1 / **P3** |
| File history | **Shipped** | `git-core` `history.ts` `repo.history.file`; `modules/history` (`gitspecs.history.file`) | **P4** |
| Line history | **Shipped** | `repo.history.line` (`git log -L` + file-history fallback); `gitspecs.history.line` | **P5** |
| Search & compare UI (commits, files) | **Shipped** (QuickPick; no dual-pane webview) | `history.search`; `modules/search` (`gitspecs.search.commits`); compare file list | **P6** |
| Commits sidebar / SCM commits browser | **Shipped** | `history.recent`; `modules/commits`; activity-bar `gitspecs.commits` + SCM tab | **P7** |
| Stashes view + actions | **Shipped** | `stashes.ts`; `modules/stashes`; activity-bar + SCM tab | **P8** |
| Tags / remotes browser views | **Shipped** | `tags.ts` / `remotes.ts`; `modules/tags` + `modules/remotes` | **P9** |
| Contributors view | **Shipped** | `contributors.ts` shortlog; `modules/contributors` | **P10** |
| Commit Graph (visual DAG) | **Shipped** (high-density tree) | `graph.ts` parents+lanes; `modules/graph` (default 200 / max 500) | **P11** |
| Interactive rebase / history rewrite UI | **Not started** | — | **P12** (parity-target, hard) |
| Hosting provider HTTP APIs (PRs, issues) | **Not started** | Explicitly late / optional | **P13** optional |
| Heatmaps / avatar CDN / always-on perf polish | **Not started** | Deferred polish | **P14** polish |

---

## 3. Implementation order (phases)

Phases are **sequential dependencies** unless noted. Each phase is a slice a future agent can plan and ship alone.

### Phase P0 — Foundation: worktrees, branches, shell, remotes URLs *(done)*

**Depends on:** nothing  
**Done means:**

- `git-core` worktree + branch ops with real-git tests  
- Extension shell: `RepoContext`, `RefreshBus`, errors, settings  
- Worktrees + Branches UI (activity bar + SCM)  
- Open on remote via `host-urls` (no network I/O)  
- Basic `branches.compare` available to commands  

### Phase P1 — Authorship: file blame *(done)*

**Depends on:** P0  
**Done means:**

- `repo.blame` / `blameLine` via `git blame --line-porcelain`  
- Toggle file annotations, show line blame, blame file to Output  
- Real-git tests + consumer smoke  

**Out of P1:** status-bar line blame, CodeLens, heatmaps (see P2–P3, P14).

### Phase P2 — Authorship: status-bar & current-line blame *(done)*

**Depends on:** P1  
**Parity target:** GitLens current-line blame in the status bar  

**Done means:**

- Status bar item shows annotation for the line under the cursor (author • relative/absolute date • short sha)  
- Click opens detail (message / copy sha / open commit URL when remote parseable)  
- Debounced refresh on cursor move; respects enabled setting `gitspecs.blame.statusBar`  
- Unit tests for pure formatters; structural tests for status-bar contribution if declared in package.json  

### Phase P3 — Authorship: CodeLens & richer hovers *(done)*

**Depends on:** P1 (P2 optional but preferred first)  
**Parity target:** GitLens CodeLens recent change / authors on code  

**Done means:**

- CodeLens provider on text documents: at least “N authors” or “last change: subject (author, date)” for current file or top-level symbols (start with **file-level** CodeLens, then symbol-range if cheap)  
- Command from CodeLens → file history (P4) or blame detail  
- Hover enrichment reuses blame/history data without blocking the extension host (cache + debounce)  
- Setting to disable CodeLens  

### Phase P4 — Revision navigation: file history *(done)*

**Depends on:** P0; benefits from P1  
**Parity target:** GitLens File History  

**Done means:**

- Library: `repo.history.file(path, { limit })` → ordered commits (`sha`, `subject`, `author`, `authorTime`) via `git log --follow` (or documented follow policy)  
- Tree view or QuickPick: history for active file  
- Actions: copy sha, open commit on remote (URL), compare with working tree / parent (hooks P6), checkout file at revision (optional show content in editor)  
- Real-git tests on multi-commit fixtures  

### Phase P5 — Revision navigation: line history *(done)*

**Depends on:** P4  
**Parity target:** GitLens Line History  

**Done means:**

- Library: line-range history via `git log -L` (or equivalent documented fallback when `-L` fails on renames)  
- Command: history for selection / current line  
- Results list with same actions as file history  
- Real-git tests with known line evolution  

### Phase P6 — Compare & search *(done)*

**Depends on:** P0 (`branches.compare`); P4 recommended for file-level compare  
**Parity target:** GitLens Compare / Search & Compare  

**Done means:**

- UI beyond Output: QuickPick or tree to pick **two refs** (or ref vs working tree)  
- Show ahead/behind + shortstat; list changed files (`git diff --name-status`)  
- Open host compare URL via `host-urls.compareUrl` when remotes known  
- Search commits by message/author (library `git log --grep` / `--author`) from a command palette entry  
- Real-git tests for compare file list + search  

**Shipped:** `repo.branches.compare` returns `files` (name-status) + working-tree mode; `repo.history.search`; extension `gitspecs.compare` / upgraded `gitspecs.branches.compare` QuickPick (actions + file list + host URL); `gitspecs.search.commits` pick-and-act (copy SHA / open remote).  

### Phase P7 — Sidebar: Commits browser *(done)*

**Depends on:** P0  
**Parity target:** GitLens Commits view  

**Done means:**

- Library helpers for recent commits on current branch (`git log`)  
- Activity-bar and/or SCM section: Commits tree (graph-lite list is fine)  
- Actions: copy sha, checkout, create branch from commit (reuse branches API), open on remote  
- Refresh via existing `RefreshBus`  

**Shipped:** `repo.history.recent` (`git log` HEAD ancestry, clamped limit); extension `modules/commits` TreeDataProvider; activity-bar `gitspecs.commits` + SCM consolidated tab (`gitspecs.scm.tab == commits`); commands `gitspecs.commits.copySha` / `checkout` / `createBranch` / `openRemote` / `refresh` via `bindCommand`.  

### Phase P8 — Sidebar: Stashes *(done)*

**Depends on:** P0  
**Parity target:** GitLens Stashes  

**Done means:**

- Library: list / push / apply / pop / drop / show stash (`git stash`)  
- Stashes tree view + commands with confirms on destructive ops  
- Real-git tests  

**Shipped:** `repo.stashes` (`list` / `push` / `apply` / `pop` / `drop` / `show`); extension `modules/stashes`; activity-bar `gitspecs.stashes` + SCM tab; pop/drop honor `gitspecs.confirmDelete`.  

### Phase P9 — Sidebar: Tags & remotes browser *(done)*

**Depends on:** P0  
**Parity target:** GitLens Tags / Remotes views  

**Done means:**

- Library: list tags; create/delete tag; list remotes; fetch remote (push/delete remote branch already partial via branches)  
- Tags view + Remotes view (or grouped under GitSpecs container)  
- Open remote URL remains URL-only unless P13 lands  

**Shipped:** `repo.tags` (list/create/delete) + `repo.remotes` (list/fetch/getUrl); activity-bar Tags & Remotes views; create/delete/checkout tag; fetch/copy/open remote (URL-only via host-urls).  

### Phase P10 — Sidebar: Contributors *(done)*

**Depends on:** P0  
**Parity target:** GitLens Contributors  

**Done means:**

- Library: shortlog / contribution counts (`git shortlog` or log aggregation)  
- Contributors tree with commit counts; optional “open file history by author” later  
- Real-git tests on multi-author fixtures  

**Shipped:** `repo.contributors.list` via `git shortlog -sne`; activity-bar Contributors tree; copy name/email; RefreshBus.  

### Phase P11 — Commit Graph *(done)*

**Depends on:** P7 (commits data); P0 branches  
**Parity target:** GitLens Commit Graph (often Pro) — still a **clone must-have**, last large local UI slice  

**Done means:**

- Data: enough graph model for recent N commits + branch tips (library parse of `git log --graph` **or** structured parent list + layout)  
- UI: webview or high-density tree showing topology; select commit → details  
- Actions: checkout, create branch, compare, open remote  
- Performance bounds documented (e.g. last 200–500 commits default)  

**Shipped:** `repo.graph.log` (parents + `%D` refs + lane layout; default 200 / max 500); activity-bar high-density `gitspecs.graph` tree; checkout / create branch / compare / open remote / copy SHA.  

### Phase P12 — History rewrite UX (parity-target, optional order)

**Depends on:** P0 branches (merge/rebase/cherry-pick already non-interactive)  
**Parity target:** GitLens interactive rebase editor / guided rewrite  

**Done means:**

- Safer guided flows for rebase/cherry-pick with conflict messaging (not a full custom mergetool)  
- Optional: sequence editor integration via `GIT_SEQUENCE_EDITOR` helper script  
- Explicitly **not** required for “daily driver” claim; schedule after P7–P11 unless users demand it earlier  

### Phase P13 — Hosting APIs *(optional parity track)*

**Depends on:** P0 host-urls  
**Type:** optional — **not** required for local OSS parity  

**Done means (if pursued):**

- Optional PAT/OAuth settings for GitHub/GitLab  
- Create PR / view PR for branch when credentials exist  
- Never block offline git workflows  

### Phase P14 — Polish *(continuous, after core daily-driver)*

**Depends on:** P1+  
**Done means (incremental):**

- Blame heatmaps, avatar providers, animation/perf, accessibility  
- Windows/Linux CI matrix  
- CONTRIBUTING, release automation, Open VSX/Marketplace publish  

---

## 4. Suggested milestone groups

| Milestone | Phases | User-visible outcome |
|-----------|--------|----------------------|
| **M0 Daily git ops** | P0 | Replace GitLens for worktrees/branches |
| **M1 Authorship** | P1–P3 | See who changed lines without leaving the editor |
| **M2 History** | P4–P5 | Walk file/line revision history — **done** |
| **M3 Explore & compare** | P6–P10 | Browse commits/stashes/tags; rich compare/search (P6–P7 shipped) |
| **M4 Graph** | P11 | Visual branch topology — **done** (high-density tree) |
| **M5 Advanced** | P12–P14 | Rewrite UX, optional APIs, polish/publish |

**Next implementation goal after this roadmap:** **P12** (History rewrite UX), building on shipped P0–P11.

Recommended default sequence for agents (P0–P11 shipped):

```
P12 → (P13?) → P14
```

Rationale: rewrite UX then optional hosting APIs / polish.

---

## 5. Explicitly out of open-source parity (non-goals)

These GitKraken/GitLens **cloud or Pro-adjacent** products are **not** success criteria for GitSpecs OSS parity:

| Item | Why deferred |
|------|----------------|
| Launchpad / work-item hub | Cloud product surface |
| Cloud Patches | SaaS collaboration |
| Code Suggest / AI commit composer | Vendor AI services |
| GitLens+ paywall / paid feature gates | We stay fully free/OSS |
| Avatar CDN / identity services | Optional polish only (P14) |
| Multi-org enterprise hosting matrices | Beyond URL + optional P13 |
| Pixel-perfect GitLens UI clones | Functional parity first |

Interactive rebase **UI** is listed as **P12 parity-target** (local), not cloud—still optional ordering.

---

## 6. Agent checklist for any new phase

1. Read this roadmap + `AGENTS.md` branding rules.  
2. Add/adjust library ops in `@gitspecs/git-core` (or pure sibling package) with **real-git** tests.  
3. Wire extension contributions (`gitspecs.*` commands/views) via `bindCommand` for TreeItem args.  
4. Keep activity-bar / SCM dual placement consistent when adding views.  
5. Update **Section 2 status table** in this file when a phase ships.  
6. `pnpm test` and `pnpm package` green before claiming done.  

---

## 7. Related docs

| Doc | Role |
|-----|------|
| [AGENTS.md](../AGENTS.md) | Agent conventions, branding, architecture rules |
| [README.md](../README.md) | User-facing install and feature summary |
| [Design v1](./superpowers/specs/2026-08-04-gitspecs-design.md) | Original v1 design (worktrees/branches shell) |

---

## 8. Changelog of this roadmap

| Date | Change |
|------|--------|
| 2026-08-04 | Initial must-have Phases 0–4 sketch |
| 2026-08-04 | Expanded to full GitLens-style parity order **P0–P14**, status inventory, milestones, non-parity deferrals; next slice **P2** |
| 2026-08-05 | Marked **P7** Commits sidebar shipped (`history.recent` + activity-bar/SCM commits browser); next slice **P8** |
| 2026-08-05 | Marked **P8** Stashes shipped (`repo.stashes` + activity-bar/SCM); next slice **P9** |
| 2026-08-05 | Marked **P9** Tags & Remotes shipped; next slice **P10** |
| 2026-08-05 | Marked **P10** Contributors shipped; next slice **P11** |
| 2026-08-05 | Marked **P11** Commit Graph shipped (lane layout + high-density tree); next slice **P12** |
