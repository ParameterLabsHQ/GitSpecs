# AGENTS.md — GitSpecs

Guidance for AI coding agents and humans working in this repository.

## Product identity (current)

| Item | Value |
|------|--------|
| **Product name** | **GitSpecs** |
| **Publisher / org** | **ParameterLabsHQ** |
| **Public repo** | [ParameterLabsHQ/GitSpecs](https://github.com/ParameterLabsHQ/GitSpecs) |
| **Extension package name** | `gitspecs` (full id: `ParameterLabsHQ.gitspecs`) |
| **Settings / commands prefix** | `gitspecs.*` |
| **View ids** | Activity bar: `gitspecs.worktrees`, `gitspecs.branches`, `gitspecs.commits`, `gitspecs.stashes`, `gitspecs.tags`, `gitspecs.remotes`, `gitspecs.contributors`, `gitspecs.graph`; SCM: single consolidated `gitspecs.scm` (tabs via `gitspecs.scm.tab`) |
| **Libraries** | `@gitspecs/git-core`, `@gitspecs/host-urls` |
| **License** | GPL-3.0-only |
| **Editors** | VS Code 1.85+ and Cursor (VS Code Extension API) |

### Rebrand (do not reintroduce old names)

**Latest product identity commit:** `6559e9f` — *Rebrand the project to GitSpecs under ParameterLabsHQ.*

That commit aligned package names, command/config IDs, docs, media, and the repository URL with `ParameterLabsHQ/GitSpecs`.

**Retired names (never use in new code or docs):**

- Product: “Git Platform”
- Publisher: `gitplatform`
- Packages: `@gitplatform/*`, extension name `git-platform`
- Commands / settings / views: `gitPlatform.*`
- Design doc path: `…/2026-08-04-git-platform-design.md` → now `docs/superpowers/specs/2026-08-04-gitspecs-design.md`
- Icon: `media/git-platform.svg` → `media/gitspecs.svg`

Local clone folder may still be named `gitlens-clone`; that is incidental filesystem layout, not product branding.

## What this project is

Open-source **GitLens-style** extension for VS Code/Cursor. The product goal (set 2026-08-05) is **full GitLens feature parity, offered free** — including client-side features GitLens gates behind paid plans — while excluding vendor-cloud backends and paywalls.

**Shipped today (high level, P0–P12 + P14–P23):**

- Worktrees + branches + commits browser (library + activity bar + SCM)
- File blame (decorations, status bar, CodeLens, heatmap), file + line history
- Compare + commit search (QuickPick); stashes, tags, remotes, contributors views
- Commit Graph (lane-layout high-density tree); guided rebase/cherry-pick conflict UX
- Revision documents (`gitspecs:`), prev/next revision, diff with previous/working tree
- Changes annotations, symbol CodeLens, terminal links, config-driven autolinks
- Multi-repo tree roots (all views) with per-item repo resolution
- Webview platform + Commit Graph canvas (`gitspecs.graph.openView`)
- Interactive rebase sequence editor (`gitspecs.rewrite.interactiveRebase`)
- Visual File History + dual-pane compare webviews
- Hosting APIs (platform auth) + work hub + optional BYO-key AI
- Hosting links: **URL-only** (`host-urls`); system `git` only (2.23+)

**Product roadmap (order of implementation):**  
→ **[docs/ROADMAP.md](./docs/ROADMAP.md)** — phases **P0–P23**, status inventory, milestones, and non-goals. P0–P12 + **P15–P23** shipped; remaining is the ladder to full parity (P13 superseded by P21). Evidence: [GitLens parity gap analysis](./docs/superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md).

**Next implementation slice (per roadmap):** **none (P15–P23 parity ladder complete; P14 polish ongoing).**

Design origin (v1 shell): `docs/superpowers/specs/2026-08-04-gitspecs-design.md`.

## Session history (foundation work)

Work done in the initial build/rebrand session, in rough order:

1. **Design** — Spec for layered monorepo shell; worktrees (daily workflow) + full branch toolkit; GPL-3.0-only; URL-only hosting.
2. **Scaffold** — pnpm workspaces, TypeScript strict, three packages, root LICENSE + README.
3. **`@gitspecs/git-core`** — `findGit`, repo discovery, `execGit` (real system git), worktrees API, branches API; vitest against **real temp repos** (including local bare remotes for push/fetch/delete-remote). No mocked git binary for ops under test.
4. **`@gitspecs/host-urls`** — Pure parse/build of branch/commit/compare URLs; table tests.
5. **Extension shell** — `RepoContext`, `RefreshBus`, error presenter, output channel (`GitSpecs`), settings (`gitspecs.*`).
6. **Worktrees / Branches modules** — TreeDataProviders + commands; dual registration on activity bar and SCM.
7. **Bugfixes** (keep these patterns):
   - Command handlers must use `bindCommand` so TreeView context items are forwarded (never `async () => fn()` with zero args).
   - Worktree “existing branch” pick must include slashy local names (`feature/foo`) and **all** remotes, not only `origin/*`.
   - Publish with multiple remotes: cancel must **not** fall back to `origin` (`resolvePublishRemote`).
8. **SCM placement** — Contribute one consolidated `gitspecs.scm` panel under Source Control with Worktrees/Branches/Commits title-bar tabs (`gitspecs.scm.showWorktrees` / `showBranches` / `showCommits`); activity-bar keeps dedicated views.
9. **Packaging** — `pnpm package` → `packages/extension/gitspecs.vsix` (or current vsix name from package script); `repository` field required so vsce does not warn.
10. **Rebrand** — `6559e9f` to GitSpecs / ParameterLabsHQ (see above).

## Monorepo layout

```
/
├── packages/
│   ├── git-core/       # @gitspecs/git-core — pure TS, no vscode; system git
│   ├── host-urls/      # @gitspecs/host-urls — pure TS URL helpers
│   └── extension/      # gitspecs — VS Code/Cursor extension (VSIX root)
│       └── src/
│           ├── shell/           # RepoContext, RefreshBus, log, errors, bindCommand
│           ├── modules/
│           │   ├── worktrees/
│           │   ├── branches/
│           │   ├── commits/     # commits browser (P7)
│           │   ├── history/     # file + line history (P4–P5)
│           │   ├── revision/    # revision documents, prev/next/diff (P15)
│           │   ├── annotations/ # working-tree / unpushed line decorations (P16)
│           │   ├── autolinks/   # config-driven issue key → URL (P16)
│           │   ├── terminalLinks/ # terminal SHA/ref links (P16)
│           │   ├── compare/     # two-ref / working-tree compare (P6)
│           │   ├── search/      # commit message/author search (P6)
│           │   ├── blame/       # file blame, status bar, CodeLens, heatmap (P1–P3, P14)
│           │   ├── stashes/     # stashes view + actions (P8)
│           │   ├── tags/        # tags view (P9)
│           │   ├── remotes/     # remotes view (P9)
│           │   ├── contributors/# contributors view (P10)
│           │   ├── graph/       # commit graph, high-density tree (P11)
│           │   └── rewrite/     # guided rebase/cherry-pick UX (P12)
│           └── extension.ts
├── docs/superpowers/specs/2026-08-04-gitspecs-design.md
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── LICENSE                      # GPL-3.0-only
├── README.md
└── AGENTS.md                    # this file
```

### Architecture rules

1. **All Git CLI goes through `@gitspecs/git-core`.** Extension code must not spawn `git` ad hoc.
2. **`git-core` and `host-urls` must not import `vscode`.**
3. **Modules own UX** (commands, tree providers); shell owns repo context + refresh + errors.
4. **Multi-repo tree views** when multiple repos are open (per-repo roots); **one current repository** for editor-scoped features and Switch Repository (`RepoContext`).
5. **Native-first UI.** TreeView, QuickPick, InputBox, confirms by default. Custom webviews only via the shared platform (`shell/webviewHost.ts`, `docs/WEBVIEWS.md`) — CSP + nonce, theme CSS variables, typed message protocol; never ad-hoc `createWebviewPanel`.
6. **Future modules** stay unbuilt until their roadmap phase is designed; do not half-implement a later phase's UI.
7. **Clean-room parity (binding).** Never open, copy, or port code from `gitkraken/vscode-gitlens`: `src/plus/**` is proprietary (GitKraken EULA), and even its MIT core is behavior-reference only in this GPL-3.0-only codebase. Implement from documented behavior and public docs; interop formats (e.g. `git-rebase-todo`) may match. See the [gap analysis](./docs/superpowers/specs/2026-08-05-gitlens-parity-gap-analysis.md) Section 3.

## Commands for agents

```bash
pnpm install
pnpm build          # all packages
pnpm test           # git-core + host-urls + extension unit/structural tests
pnpm consumer       # outside-vitest smoke of shipped git-core (+ host-urls)
pnpm package        # build extension VSIX
pnpm watch          # extension esbuild watch
```

Debug: root `.vscode/launch.json` → **Launch Extension** with  
`--extensionDevelopmentPath=${workspaceFolder}/packages/extension`.

Install VSIX: Command Palette → **Extensions: Install from VSIX…**

## Testing expectations

| Package | How |
|---------|-----|
| `git-core` | vitest + real `git` on temp dirs; worktrees re-list / FS checks; bare remote fixture for publish/push/pull/fetch/delete-remote; conflicts assert on real failure |
| `host-urls` | Table-driven parse/URL tests; unparseable → `undefined`, no throw |
| `extension` | Pure helpers (`bindCommand`, branch pick, publish remote) + structural tests for SCM/manifest (`scmViews.test.ts`). Full Electron smoke optional; not required if unavailable |

**No test theater:** library tests must call shipped APIs, not reimplement git or hardcode oracle answers independent of the code path.

**macOS path note:** `/var` vs `/private/var` — normalize with `realpath` when comparing worktree paths (list/add/consumer).

## Extension UX notes

- **Activity bar:** container `gitspecs` — Worktrees + Branches + Commits.
- **Source Control tab:** one collapsible **GitSpecs** panel (`gitspecs.scm`) with title-bar tabs for Worktrees/Branches/Commits (not dual accordion sections).
- Menus `when` clauses must include activity-bar view ids and, for SCM, `view == gitspecs.scm` plus `gitspecs.scm.tab == worktrees|branches|commits`.
- Output channel name: **GitSpecs**.
- Settings namespace: `gitspecs.git.path`, `gitspecs.worktrees.*`, `gitspecs.confirmDelete`, `gitspecs.log.verbosity`.

## Product roadmap

**Canonical:** [docs/ROADMAP.md](./docs/ROADMAP.md)

| Milestone | Phases | Status (summary) |
|-----------|--------|------------------|
| M0 Daily git ops | P0 | Done |
| M1 Authorship | P1–P3 | **Done** (file blame, status-bar, CodeLens) |
| M2 History | P4–P5 | **Done** (file + line history) |
| M3 Explore & compare | P6–P10 | **Done** (compare/search, commits, stashes, tags/remotes, contributors) |
| M4 Graph | P11 | **Done** (lane-layout high-density tree) |
| M5 Advanced | P12–P14 | P12 done; P13 superseded by P21; P14 ongoing polish |
| M6 Editor depth | P15–P16 | **Done** (revision nav + annotations/links) |
| M7 Scale | P17 | **Done** — multi-repo tree roots |
| M8 Webview surfaces | P18–P20 | P18–P20 done |
| M9 Connected | P21–P22 | **Done** — hosting APIs + work hub |
| M10 Assist | P23 | **Done** — BYO-key AI, off until configured |

### Picking up the next phase (coding agents — Claude Code, Grok Build, etc.)

1. Read `docs/ROADMAP.md` Section 4 for the current **next slice** and the phase's **Done means**.
2. Large phases (P17, P18, P19, P21) get a design note in `docs/superpowers/specs/` first; all phases get an implementation plan before code.
3. Implement one phase per goal: library ops in `git-core`/pure packages with **real-git tests** → module UI → manifest contributions → structural `*Contrib.test.ts`.
4. Before claiming done: update ROADMAP Section 2 status table + Section 8 changelog + the "Next implementation slice" line in this file; `pnpm test` and `pnpm package` green (`roadmapParity.test.ts` enforces doc honesty).

### Blame module notes (P1–P3)

- Library: `@gitspecs/git-core` → `repo.blame.blame` / `blameLine` (`git blame --line-porcelain`).
- Extension: `BlameController` (decorations + status bar), `BlameCodeLensProvider`, shared `BlameCache`.
- Commands: `gitspecs.blame.toggleFile` / `showLine` / `fileToOutput` / `statusBarDetails` / `codeLensDetail`.
- Settings: `gitspecs.blame.statusBar`, `gitspecs.blame.codeLens` (both default true).
- Format via shipped `formatBlameAnnotation` + pure helpers in `modules/blame/format.ts` / `detail.ts` (do not reimplement in tests).

### History module notes (P4–P5)

- Library: `@gitspecs/git-core` → `repo.history.file` (`git log --follow`), `repo.history.line` (`git log -L` with file-history fallback), `repo.history.showFile`.
- Extension: `modules/history` QuickPick UX; pure helpers in `actions.ts`.
- Commands: `gitspecs.history.file` / `gitspecs.history.line`.
- Actions: copy SHA, open commit URL (`@gitspecs/host-urls`), view file at revision / diffs via P15 revision documents.

### Revision navigation notes (P15)

- Library: `repo.history.revisionNeighbors` / `fileWithPaths` / rename-aware `showFile` (`git log --follow` + `--name-only`).
- Extension: `modules/revision` — `gitspecs:` `TextDocumentContentProvider`, prev/next/diff commands, editor-title context keys.
- Commands: `gitspecs.revision.openAtRevision` / `diffWithPrevious` / `diffWithWorking` / `previous` / `next`.

### Compare & search notes (P6)

- Library: `repo.branches.compare` → ahead/behind + shortstat + `files` (`git diff --name-status -z`); optional `againstWorkingTree`. `repo.history.search` → `git log --grep` / `--author`.
- Extension: `modules/compare` + `modules/search`; pure helpers in `format.ts`.
- Commands: `gitspecs.compare`, upgraded `gitspecs.branches.compare`, `gitspecs.search.commits`.
- Host compare URL via `@gitspecs/host-urls` `compareUrl` when origin remote parses.

### Commits browser notes (P7)

- Library: `@gitspecs/git-core` → `repo.history.recent` (`git log` on HEAD ancestry; optional `rev`; clamped limit).
- Extension: `modules/commits` TreeDataProvider + commands; pure helpers in `format.ts`.
- Views: activity-bar `gitspecs.commits`; SCM tab via `gitspecs.scm.showCommits` / `gitspecs.scm.tab == commits`.
- Commands: `gitspecs.commits.refresh` / `copySha` / `checkout` / `createBranch` / `openRemote` (all `bindCommand`).
- Create branch reuses `repo.branches.createFromCommit`; open remote uses `@gitspecs/host-urls` `commitUrl`.

## Coding conventions

- TypeScript strict; Node 18+; **pnpm** workspaces.
- Extension bundle: **esbuild** (`packages/extension/esbuild.mjs`), `vscode` external, CJS outfile `dist/extension.js`.
- Prefer small pure helpers next to commands when logic needs unit tests without the extension host.
- Destructive actions: confirm when `gitspecs.confirmDelete` is true (default).
- Log git argv + exit/stderr to the output channel; hosting auth uses **platform APIs only**: `vscode.authentication` (GitHub) and `context.secrets` / `SecretStorage` (PATs, AI keys). No tokens in settings, files, or globalState.

## License / contributions

GPL-3.0-only. Relicensing future versions is only possible for code under copyright-holder control; prefer DCO/CLA if external contributors appear.

## Quick “don’t break these” checklist

- [ ] Branding remains **GitSpecs** / **ParameterLabsHQ** / `gitspecs.*`
- [ ] No code copied/ported from `gitkraken/vscode-gitlens` (clean-room rule; `src/plus/` is proprietary)
- [ ] No `vscode` imports in `git-core` or `host-urls`
- [ ] Tree commands use `bindCommand` (args forwarded)
- [ ] Worktree branch pick keeps `feature/*` and non-`origin` remotes
- [ ] Multi-remote publish cancel does not push to `origin`
- [ ] SCM single panel (`gitspecs.scm`) + activity-bar Worktrees/Branches/Commits views stay registered and menu-wired
- [ ] `repository.url` in extension `package.json` points at `https://github.com/ParameterLabsHQ/GitSpecs.git`
- [ ] `pnpm test` and `pnpm package` stay green
