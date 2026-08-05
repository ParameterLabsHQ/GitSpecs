# GitSpecs roadmap — GitLens-style feature parity

**Product:** GitSpecs · **Org:** ParameterLabsHQ · **Repo:** [ParameterLabsHQ/GitSpecs](https://github.com/ParameterLabsHQ/GitSpecs)  
**License:** GPL-3.0-only  
**Updated:** 2026-08-05  
**Audience:** maintainers and coding agents

This is the **single product contract** for how GitSpecs approaches open-source **GitLens-style** parity in VS Code/Cursor. It orders work into **shippable phases**, records honest **current status**, and separates **client-side parity** (in scope, including features GitLens gates behind paid plans) from **vendor-cloud non-goals**.

> **Scope expansion (2026-08-05):** the target is now **full GitLens feature parity, free** — not just local-git parity. Phases **P15–P23** cover editor depth, multi-repo, webview surfaces (Commit Graph canvas, rebase editor), hosting APIs, a work hub, and optional BYO-key AI. Evidence and tier data: [GitLens parity gap analysis](./superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md).

> **Do not implement every phase in one goal.** Each incomplete phase should become its own design note (if large) → implementation plan → PR. Keep Phase N green before starting N+1 unless the phase explicitly allows parallel polish.

---

## 1. Parity principles

1. **System `git` only** for repository truth (`@gitspecs/git-core`). No isomorphic-git, no embedded binary.
2. **Library before UI.** Porcelain parsers and ops live in pure packages; the extension binds TreeViews, commands, decorations, CodeLens, webviews.
3. **URL remotes before hosting APIs.** `host-urls` stays network-free; hosting HTTP APIs arrive only in **P21** and never block offline git.
4. **Multi-repo views with a single editor current repo.** Tree views list every discovered repository (grouped under per-repo roots when `allRepos.length > 1`). Editor-scoped features (blame, history, revision navigation, annotations) and palette actions without a tree item still use **one current repository** (`RepoContext.currentRepo` + Switch Repository). Tree command handlers resolve the repo from the item’s `repoRoot` when present.
5. **Branding:** `GitSpecs` / `ParameterLabsHQ` / `gitspecs.*` only (see `AGENTS.md`).
6. **Full-product parity, free.** Client-side GitLens features are in scope even when GitLens sells them (Commit Graph canvas, rich integrations, work hub, BYO-key AI). Vendor **cloud services** — Launchpad's backend, Cloud Patches, Code Suggest, hosted AI — and paywalls are **non-parity** (Section 5).
7. **Native-first UI.** TreeView/QuickPick/InputBox by default; custom webviews only via the shared webview platform introduced in **P18** — no ad-hoc webviews.
8. **Clean-room parity.** Never open, copy, or port code from `gitkraken/vscode-gitlens` (its `src/plus/` is proprietary; even the MIT core is reference-by-behavior only). See the [gap analysis](./superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md) Section 3.

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
| Interactive rebase / history rewrite UI | **Shipped** (guided, not full editor) | `rewrite.ts` status/abort/continue + guided rebase/cherry-pick | **P12** |
| Hosting provider HTTP APIs (PRs, issues) | **Deferred** | Needs PAT/OAuth secrets; offline git must not block — see P13 note | **P13** optional |
| Heatmaps / avatar CDN / always-on perf polish | **Shipped** (finite slice) | Blame heatmap setting; CONTRIBUTING; GitHub CI matrix; no avatar CDN | **P14** polish |
| Revision navigation (prev/next revision, diff with previous/working) | **Shipped** | `history.revisionNeighbors` / rename-aware `showFile`; `modules/revision` (`gitspecs:` provider + prev/next/diff) | **P15** |
| Changes annotations (working-tree / unpushed lines) | **Shipped** | `repo.changes.changedLines`; `modules/annotations` | **P16** |
| Symbol-level CodeLens | **Shipped** | `buildSymbolCodeLensSpecs` + `executeDocumentSymbolProvider` | **P16** |
| Terminal links (SHAs/branches/tags in terminal) | **Shipped** | `modules/terminalLinks` | **P16** |
| Autolinks (issue keys → URLs, config-driven) | **Shipped** | `modules/autolinks`; blame/history/graph wiring | **P16** |
| Multi-repo simultaneous views | **Shipped** | `RepoRootItem` grouping; item `repoRoot` + `resolveRepoForItem` | **P17** |
| Commit Graph webview (DAG canvas, search/filter, WIP row) | **Shipped** | webview platform + `gitspecs.graphView` / `graph.openView`; `logPage` | **P18** |
| Interactive rebase sequence editor | **Shipped** | `rebaseTodo` + `interactiveRebase`; webview sequence editor | **P19** |
| Visual File History (timeline chart) | **Shipped** | `history.fileChurn`; `gitspecs.history.visualFile` webview | **P20** |
| Dual-pane Search & Compare | **Shipped** | `gitspecs.compare.dualPane` webview | **P20** |
| Hosting APIs: PRs / issues / avatars | **Shipped** | `@gitspecs/host-api` (PR create/API, getIssue, cache, CI); branch PR badges; avatar URLs; platform auth + PAT sign-out | **P21** |
| Work hub (client-side Launchpad-style) | **Shipped** | `gitspecs.hub` (my PRs, review-requested, assigned issues, CI, checkout/worktree actions) | **P22** |
| AI assist (BYO key, optional, off by default) | **Shipped** | `modules/ai` (enablement when configured; OpenAI + Anthropic; consent; SecretStorage) | **P23** |

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

### Phase P12 — History rewrite UX (parity-target, optional order) *(done)*

**Depends on:** P0 branches (merge/rebase/cherry-pick already non-interactive)  
**Parity target:** GitLens interactive rebase editor / guided rewrite  

**Done means:**

- Safer guided flows for rebase/cherry-pick with conflict messaging (not a full custom mergetool)  
- Optional: sequence editor integration via `GIT_SEQUENCE_EDITOR` helper script  
- Explicitly **not** required for “daily driver” claim; schedule after P7–P11 unless users demand it earlier  

**Shipped:** `repo.rewrite` (status / abort / continue / guidedRebase / guidedCherryPick with clean-tree preflight); commands `gitspecs.rewrite.*` with conflict guidance and Abort action. Sequence editor intentionally deferred.  

### Phase P13 — Hosting APIs *(optional parity track)* — **deferred**

**Depends on:** P0 host-urls  
**Type:** optional — **not** required for local OSS parity  

**Done means (if pursued):**

- Optional PAT/OAuth settings for GitHub/GitLab  
- Create PR / view PR for branch when credentials exist  
- Never block offline git workflows  

**Deferred reason (2026-08-05):** Full Done means require stored credentials (PAT/OAuth). AGENTS.md forbids inventing token storage for v1; no secrets/network credentials are available in agent goals. URL-only remote open remains shipped via `host-urls`. Revisit when a deliberate secrets design + user-facing auth UX lands.

**Superseded (2026-08-05):** re-scoped as **P21**. The blocker is resolved without inventing storage: `vscode.authentication` (built-in GitHub provider) and `SecretStorage` for PATs. Do not implement under this phase number — see P21.

### Phase P14 — Polish *(continuous, after core daily-driver)* *(finite slice shipped)*

**Depends on:** P1+  
**Done means (incremental):**

- Blame heatmaps, avatar providers, animation/perf, accessibility  
- Windows/Linux CI matrix  
- CONTRIBUTING, release automation, Open VSX/Marketplace publish  

**Shipped (finite slice):** optional `gitspecs.blame.heatmap` overview-ruler age colors; [CONTRIBUTING.md](../CONTRIBUTING.md); GitHub Actions CI on `ubuntu-latest` + `macos-latest` (build/test/package/consumer). Avatar CDN, Open VSX publish automation, Windows CI matrix, Modes (Zen/Review setting profiles), and worktree `move` remain follow-ups.  

### Phase P15 — Revision navigation & revision diffs

**Depends on:** P4–P5 (history library)  
**Parity target:** GitLens revision navigation (step back/forward through a file's revisions) and "open changes with previous revision" — free-tier GitLens features GitSpecs lacks entirely

**Done means:**

- Read-only `gitspecs:` `TextDocumentContentProvider` serving file content at a revision (backed by `repo.history.showFile`); history/stash/commit flows stop rendering into untitled editors and use real revision documents
- Library: resolve previous/next revision for a `(path, sha)` pair from the `git log --follow` sequence (documented rename policy; reuse `repo.history.file` ordering)
- Commands: `gitspecs.revision.openAtRevision` (pick from file history), `gitspecs.revision.diffWithPrevious`, `gitspecs.revision.diffWithWorking`, `gitspecs.revision.previous` / `gitspecs.revision.next` (editor-title navigation icons with enablement context when viewing a revision)
- Existing history / commits / stashes "view" actions upgraded to `vscode.diff` against the resolved base where one exists
- Real-git tests for revision-sequence resolution (multi-commit fixtures incl. a rename); structural contrib tests for new commands/menus

**Shipped:** `repo.history.revisionNeighbors` / `fileWithPaths` / rename-aware `showFile`; extension `modules/revision` with `gitspecs:` `TextDocumentContentProvider`; commands `gitspecs.revision.openAtRevision` / `diffWithPrevious` / `diffWithWorking` / `previous` / `next` (editor-title enablement via context keys); history view-at-rev + diffs use revision documents/`vscode.diff` (no untitled previews).

**Out of P15:** annotations and link surfaces (P16), timeline webviews (P20).

### Phase P16 — Annotations & link surfaces

**Depends on:** P1–P3 (blame infra); P15 helpful (diff plumbing)  
**Parity target:** GitLens changes annotations, symbol-level CodeLens, terminal links, autolinks — all free-tier, all network-free

**Done means:**

- **Changes annotations:** toggleable decorations marking lines changed in the working tree and/or unpushed commits (`git diff` / `git diff @{upstream}` parsers in `git-core`); command `gitspecs.annotations.toggleChanges`; setting `gitspecs.annotations.changes`
- **Symbol-level CodeLens:** extend `modules/blame` CodeLens to top-level symbols via `vscode.executeDocumentSymbolProvider` (most-recent change + author count per symbol range); file-level lens kept; still honors `gitspecs.blame.codeLens`
- **Terminal links:** `TerminalLinkProvider` recognizing commit SHAs and branch/tag names in terminal output → actions (show commit, checkout, copy); setting `gitspecs.terminalLinks`
- **Autolinks:** setting `gitspecs.autolinks` — array of `{ prefix, url }` rules with `<num>` substitution; linkified in blame hovers, commit QuickPick details, and graph tooltips via a pure helper (`modules/autolinks/format.ts` or `host-urls`); **no network, no issue titles** (P21 enriches)
- Real-git tests for diff parsers; pure unit tests for autolink/terminal matchers; contrib structural tests

**Shipped:** `repo.changes.changedLines` + unified-diff hunk parser; `gitspecs.annotations.toggleChanges` / `gitspecs.annotations.changes`; symbol CodeLens via document symbols; terminal link provider (`gitspecs.terminalLinks`); config autolinks (`gitspecs.autolinks`) in blame hovers, history QuickPick detail, graph tooltips.

**Out of P16:** provider-fetched issue metadata (P21); Modes (P14 follow-up).

### Phase P17 — Multi-repo views

**Depends on:** P0 shell  
**Parity target:** GitLens multi-repo awareness — every repo visible at once instead of a single switched context

**Done means:**

- `RepoContext` exposes all discovered repos; when a workspace has >1 repo, tree views (worktrees, branches, commits, stashes, tags, remotes, contributors, graph) group under per-repository roots
- The single "current repo" concept remains for editor-scoped features (blame, history, revision navigation) and `gitspecs.switchRepository`
- Every TreeItem carries its repository; command handlers resolve the repo from the item, never from global current-repo state (audit all `bindCommand` call sites)
- Refresh stays per-repo where cheap (per-repo `fs.watch` already exists)
- Real-git tests with two temp repos; structural tests for grouped roots; single-repo workspaces render exactly as today
- Amend roadmap principle 4 in the same PR

**Shipped:** `RepoContext.isMultiRepo` / `repoByRoot`; all tree providers (worktrees, branches, commits, stashes, tags, remotes, contributors, graph) group under `RepoRootItem` when >1 repo; leaf items carry `repoRoot`; tree commands use `resolveRepoForItem`; single-repo stays flat; design note `docs/superpowers/specs/2026-08-05-p17-multi-repo-views.md`; principle 4 amended.

### Phase P18 — Webview platform + Commit Graph canvas

**Depends on:** P11 (graph model); P17 recommended first  
**Parity target:** GitLens Commit Graph webview (Pro on private repos) — **flagship differentiator**, free here

**Done means:**

- **Webview platform (one-time infra, own design note before implementation):** second esbuild target for webview bundles; shared host helper providing CSP + nonce, theme CSS variables, a typed `postMessage` protocol, and `getState`/`setState` persistence; documented in `docs/WEBVIEWS.md`; AGENTS.md native-UI rule amended to "webviews via the shared platform only" in the same PR
- **Graph canvas:** `gitspecs.graphView` webview — virtualized rows, lane/edge rendering from the existing `repo.graph.log` layout, ref badges, working-tree (WIP) row, search/filter by message/author/SHA, commit selection → details panel, context actions (checkout, create branch, compare, open remote, copy SHA) that reuse existing commands over the message protocol
- Incremental load past the current 500-commit cap (paged `git log`); performance bounds documented
- P11 high-density tree remains as the SCM-tab and fallback surface
- Tests: pure layout/message-protocol unit tests; contrib structural tests; CSP/nonce assertion test on generated HTML

**Shipped:** shared webview platform (`webviewHost` / `webviewHtml`, second esbuild browser target, `docs/WEBVIEWS.md`); `repo.graph.logPage` paging; Commit Graph canvas (`gitspecs.graph.openView`, protocol + virtualized-ish client, WIP row, filter, actions); P11 tree retained.

**Out of P18:** rewrite actions inside the graph (P19+); PR/issue rows (P21).

### Phase P19 — Interactive rebase sequence editor

**Depends on:** P12 (rewrite API); P18 (webview platform)  
**Parity target:** GitLens Interactive Rebase Editor — the last free-tier GitLens feature GitSpecs lacks

**Done means:**

- Library: `repo.rewrite.interactiveRebase(baseRef)` launches rebase with a `GIT_SEQUENCE_EDITOR` helper script that hands `git-rebase-todo` to the extension and blocks until the UI resolves (the P12 deferral, now due)
- Editor UI on the P18 platform (webview or `CustomTextEditor` for `git-rebase-todo`): reorder rows, per-row pick/reword/squash/fixup/drop/edit, commit metadata (subject, author, date) from a `repo.graph.log` slice, apply/abort
- Registers as editor for `git-rebase-todo` so a terminal-run `git rebase -i` (with VS Code as core.editor) opens the same UI
- Conflict handling remains the P12 guided flow (status / continue / abort)
- Real-git end-to-end test driving a scripted sequence edit through the helper (non-interactive); pure round-trip parser tests for the todo file

**Shipped:** `parseRebaseTodo` / `serializeRebaseTodo`; `repo.rewrite.interactiveRebase` with `GIT_SEQUENCE_EDITOR` helper; webview sequence editor (`gitspecs.rewrite.interactiveRebase` / `editTodo`); `git-rebase-todo` language contribution; real-git drop-tip e2e test.

### Phase P20 — Visual File History & dual-pane Search & Compare

**Depends on:** P18 (webview platform); P4 / P6 (data)  
**Parity target:** GitLens Visual File History (Pro on private repos) + Search & Compare dual-pane

**Done means:**

- Library: `--numstat` churn parse added to `repo.history` (per-commit additions/deletions for a path)
- **Visual File History:** webview timeline of a file's commits (time axis, churn-scaled marks, author color), hover details, click → P15 revision diff
- **Dual-pane compare:** persistent compare surface (webview or split tree) for two refs or ref-vs-working-tree — ahead/behind, shortstat, per-file open-diff actions; promotes the P6 QuickPick flow
- Tests: numstat parser real-git tests; message-protocol unit tests; contrib structural tests

**Shipped:** `repo.history.fileChurn` / `parseFileChurnLog`; Visual File History webview; dual-pane compare webview (`gitspecs.compare.dualPane`).

### Phase P21 — Hosting provider APIs *(supersedes P13)*

**Depends on:** P0 host-urls; P16 (autolinks are the enrichment target)  
**Parity target:** GitLens rich integrations — PR/issue details, PR-for-branch, avatars (Pro-gated for private/self-hosted repos in GitLens)

**Done means:**

- **Auth without inventing storage:** GitHub via built-in `vscode.authentication.getSession("github", …)` (no custom secret handling at all); GitLab / Bitbucket / Azure DevOps PATs via `context.secrets` (`SecretStorage`) with explicit sign-in/sign-out commands; everything remains fully functional offline/signed-out
- New package `@gitspecs/host-api`: provider clients (GitHub/GitLab first) taking injected `fetch` + token — no `vscode` import, unit-tested against stubbed fixtures, no live network in CI
- Features: PR-for-branch (branches view badge + status bar), PR/issue details in hovers and autolink tooltips, avatars in views (provider avatar URLs, cached; no third-party avatar CDN), create-PR flow (prefilled compare URL always; API create when a session exists)
- Settings: `gitspecs.hosting.enabled` (default true, inert until sign-in); per-host base URLs for self-hosted GitHub/GitLab
- Resilience: cached last-known data, rate-limit aware, never blocks or delays local git commands
- Update AGENTS.md token rule ("no invented token storage" → "platform auth APIs only") in the same PR

**Shipped:** `@gitspecs/host-api` (GitHub/GitLab, injected fetch, rate-limit + last-known cache, getIssue, createPullRequest, CI status, review-requested, assigned issues); default-branch-aware create-PR (API when session); branch-view PR badges; issue title enrichment in blame hovers; provider avatar URLs in contributors/hub; GitHub session + GitLab/Bitbucket/Azure PAT SecretStorage with sign-out; settings `hosting.enabled` / base URLs.

### Phase P22 — Work hub (client-side Launchpad-style)

**Depends on:** P21  
**Parity target:** GitLens Launchpad (Pro) — rebuilt entirely client-side; no vendor cloud, no account

**Done means:**

- Activity-bar **Hub** view aggregating across signed-in repos: your open PRs (review + CI state), PRs awaiting your review, assigned issues, and WIP branches (ahead/behind, uncommitted changes)
- Grouping by urgency (blocked / needs your action / waiting on others); actions: open PR/issue, checkout branch, create worktree for a PR branch
- Data via `@gitspecs/host-api` only; poll-on-refresh (RefreshBus + manual) — no push/webhook infrastructure
- Pure unit tests for aggregation/grouping over `host-api` fixtures; contrib structural tests

**Shipped:** Hub activity-bar view; pure `aggregateHub` (needs action / blocked / waiting / assigned issues / WIP); review-requested + my-open-PRs + CI; commands open/checkout/create-worktree; item menus.

### Phase P23 — AI assist *(optional, BYO key, off by default)*

**Depends on:** P0; P21 optional  
**Parity target:** GitLens AI features (Pro / BYO-key) — commit message generation, explain commit

**Done means:**

- Commands: generate commit message from the staged diff; explain a commit/diff — visible only once a provider is configured
- Providers: user-configured endpoint + model (Anthropic and OpenAI-compatible APIs); key stored in `SecretStorage`; nothing bundled, zero requests until configured
- Privacy: first-use consent dialog stating exactly what is sent (diff text, file names); prompt-size caps; no telemetry
- Explicit non-goals stay: hosted AI service, token quotas, accounts (Section 5)
- Pure unit tests for prompt assembly + diff truncation; stubbed-client tests for response handling

**Shipped:** Configure AI command always available; generate/explain use `enablement: gitspecs.ai.configured` (context set when key+endpoint present); OpenAI-compatible + native Anthropic Messages; first-use consent; SecretStorage key; prompt size caps.

---

## 4. Suggested milestone groups

| Milestone | Phases | User-visible outcome |
|-----------|--------|----------------------|
| **M0 Daily git ops** | P0 | Replace GitLens for worktrees/branches |
| **M1 Authorship** | P1–P3 | See who changed lines without leaving the editor |
| **M2 History** | P4–P5 | Walk file/line revision history — **done** |
| **M3 Explore & compare** | P6–P10 | Browse commits/stashes/tags; rich compare/search (P6–P7 shipped) |
| **M4 Graph** | P11 | Visual branch topology — **done** (high-density tree) |
| **M5 Advanced** | P12–P14 | Rewrite UX shipped; P13 deferred → superseded by P21; P14 finite polish shipped |
| **M6 Editor depth** | P15–P16 | **Done** (revision nav + annotations/links) |
| **M7 Scale** | P17 | **Done** — every repo visible under roots |
| **M8 Webview surfaces** | P18–P20 | **Done** (platform, graph canvas, rebase editor, visual history, dual-pane compare) |
| **M9 Connected** | P21–P22 | **Done** — PRs/issues via platform auth; work hub |
| **M10 Assist** | P23 | **Done** — optional BYO-key AI, off until configured |

**Next implementation goal:** **Parity ladder complete for P15–P23.** Ongoing P14 polish only.

Recommended default sequence for agents:

```
(P0–P12, P15–P23 done) (+ ongoing P14 polish)
```

Each phase: read this file + `AGENTS.md` → design note in `docs/superpowers/specs/` if the phase is large (P17, P18, P19, P21 are) → implementation plan → PR with tests → update Section 2 + changelog here. One phase per goal; keep phase N green before starting N+1.

---

## 5. Explicitly out of open-source parity (non-goals)

**Re-scoped 2026-08-05:** two former non-goals moved into scope as client-side equivalents — **Launchpad → work hub (P22)** and **AI commit composer → BYO-key AI assist (P23)**. What remains out is anything requiring us (or GitKraken) to operate a cloud backend, plus paywalls:

| Item | Why out |
|------|----------|
| Launchpad's **cloud service** (GitKraken account, cross-product sync) | P22 rebuilds the hub client-side; the vendor backend is not a target |
| Cloud Patches | SaaS collaboration backend; we run no server |
| Code Suggest | GitKraken cloud review service |
| Cloud Workspaces / gitkraken.dev deep links | Vendor cloud |
| Hosted AI service, token quotas, AI accounts | P23 is BYO-key only, off by default |
| GitLens+ paywall / paid feature gates | We stay fully free/OSS, permanently |
| Avatar CDN / identity services | Provider-API avatars ship in P21; no CDN of ours |
| Multi-org enterprise hosting matrices | Beyond per-host base URLs in P21 |
| Pixel-perfect GitLens UI clones | Functional parity first |

Interactive rebase **UI** is a local parity target (**P19**); the P12 note predates it.

---

## 6. Agent checklist for any new phase

1. Read this roadmap + `AGENTS.md` branding rules.  
2. **Clean-room rule:** never open/copy/port `gitkraken/vscode-gitlens` code (`src/plus/` is proprietary; MIT core is behavior-reference only).  
3. Add/adjust library ops in `@gitspecs/git-core` (or pure sibling package) with **real-git** tests.  
4. Wire extension contributions (`gitspecs.*` commands/views) via `bindCommand` for TreeItem args.  
5. Keep activity-bar / SCM dual placement consistent when adding views.  
6. Update **Section 2 status table** + **Section 8 changelog** in this file when a phase ships; keep `roadmapParity.test.ts` green.  
7. `pnpm test` and `pnpm package` green before claiming done.  

---

## 7. Related docs

| Doc | Role |
|-----|------|
| [AGENTS.md](../AGENTS.md) | Agent conventions, branding, architecture rules |
| [README.md](../README.md) | User-facing install and feature summary |
| [Design v1](./superpowers/specs/2026-08-04-gitspecs-design.md) | Original v1 design (worktrees/branches shell) |
| [GitLens parity gap analysis](./superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md) | Verified GitLens 18.3 feature/tier inventory, gap buckets behind P15–P23, clean-room licensing rule |

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
| 2026-08-05 | Marked **P12** guided rewrite UX shipped; next **P13?** / **P14** |
| 2026-08-05 | **P13 deferred** (no token storage); **P14** finite polish (heatmap + CONTRIBUTING + CI) |
| 2026-08-05 | **Scope expanded to full GitLens parity, free.** Added **P15–P23** (revision navigation, annotations/links, multi-repo, webview platform + graph canvas, rebase editor, visual history/compare, hosting APIs superseding P13, work hub, BYO-key AI); re-scoped Section 5 non-goals; added clean-room rule + [gap analysis](./superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md). Next slice: **P15** |
| 2026-08-05 | Marked **P15** Revision navigation shipped (`revisionNeighbors`, `gitspecs:` documents, prev/next/diff commands); next slice **P16** |
| 2026-08-05 | Marked **P16** Annotations & link surfaces shipped (changes decorations, symbol CodeLens, terminal links, autolinks); next slice **P17** |
| 2026-08-05 | Marked **P17** Multi-repo views shipped (per-repo tree roots, item repo resolution, principle 4 amended); next slice **P18** |
| 2026-08-05 | Marked **P18** Webview platform + Commit Graph canvas shipped (`docs/WEBVIEWS.md`, `logPage`, `gitspecs.graph.openView`); next slice **P19** |
| 2026-08-05 | Marked **P19** Interactive rebase sequence editor shipped (`interactiveRebase`, todo parser, webview editor); next slice **P20** |
| 2026-08-05 | Marked **P20** Visual File History + dual-pane compare shipped (`fileChurn`, webviews); next slice **P21** |
| 2026-08-05 | Marked **P21** Hosting APIs shipped (`@gitspecs/host-api`, vscode.authentication / SecretStorage); next **P22** |
| 2026-08-05 | Marked **P22** Work hub shipped (`gitspecs.hub`); next **P23** |
| 2026-08-05 | Marked **P23** BYO-key AI assist shipped (off until configured); parity ladder P15–P23 complete |
