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
| **View ids** | Activity bar: `gitspecs.worktrees`, `gitspecs.branches`; SCM: single consolidated `gitspecs.scm` (Worktrees/Branches tabs via `gitspecs.scm.tab`) |
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

Open-source **GitLens-style** extension for VS Code/Cursor. **Worktrees, branches, and file blame** ship today; the long-term path to broader GitLens-style parity is the phased roadmap (not full GitKraken cloud parity).

**Shipped today (high level):**

- Worktrees + branches (library + activity bar + SCM)
- File blame (toggle decorations, line, output, status bar, CodeLens)
- File + line history (QuickPick; copy SHA / open remote / view at rev)
- Hosting links: **URL-only** (`host-urls`); system `git` only (2.23+)

**Product roadmap (order of implementation):**  
→ **[docs/ROADMAP.md](./docs/ROADMAP.md)** — complete phases **P0–P14**, status inventory, milestones, and non-parity deferrals (Launchpad, AI, Cloud Patches, etc.).

**Next implementation slice (per roadmap):** **P7** Commits sidebar (P6 compare & search is shipped; see recommended sequence in the roadmap).

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
8. **SCM placement** — Contribute one consolidated `gitspecs.scm` panel under Source Control with Worktrees/Branches title-bar tabs (`gitspecs.scm.showWorktrees` / `showBranches`); activity-bar keeps dual views.
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
│           │   ├── history/     # file + line history (P4–P5)
│           │   ├── compare/     # two-ref / working-tree compare (P6)
│           │   ├── search/      # commit message/author search (P6)
│           │   ├── blame/       # file blame, status bar, CodeLens (P1–P3)
│           │   └── graph/       # stub only
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
4. **One current repository** in multi-root workspaces (`RepoContext` + Switch Repository command).
5. **Native UI** for v1: TreeView, QuickPick, InputBox, confirms — no custom webview sidebars.
6. **Future modules** stay as stubs until designed; do not half-implement graph/compare sidebars.

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

- **Activity bar:** container `gitspecs` — Worktrees + Branches.
- **Source Control tab:** one collapsible **GitSpecs** panel (`gitspecs.scm`) with title-bar tabs for Worktrees/Branches (not dual accordion sections).
- Menus `when` clauses must include activity-bar view ids and, for SCM, `view == gitspecs.scm` plus `gitspecs.scm.tab == worktrees|branches`.
- Output channel name: **GitSpecs**.
- Settings namespace: `gitspecs.git.path`, `gitspecs.worktrees.*`, `gitspecs.confirmDelete`, `gitspecs.log.verbosity`.

## Product roadmap

**Canonical:** [docs/ROADMAP.md](./docs/ROADMAP.md)

| Milestone | Phases | Status (summary) |
|-----------|--------|------------------|
| M0 Daily git ops | P0 | Done |
| M1 Authorship | P1–P3 | **Done** (file blame, status-bar, CodeLens) |
| M2 History | P4–P5 | **Done** (file + line history) |
| M3 Explore & compare | P6–P10 | P6 compare/search done; P7–P10 views not started |
| M4 Graph | P11 | Not started (stub) |
| M5 Advanced | P12–P14 | Optional / polish / non-cloud |

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
- Actions: copy SHA, open commit URL (`@gitspecs/host-urls`), view file at revision (untitled editor).

### Compare & search notes (P6)

- Library: `repo.branches.compare` → ahead/behind + shortstat + `files` (`git diff --name-status -z`); optional `againstWorkingTree`. `repo.history.search` → `git log --grep` / `--author`.
- Extension: `modules/compare` + `modules/search`; pure helpers in `format.ts`.
- Commands: `gitspecs.compare`, upgraded `gitspecs.branches.compare`, `gitspecs.search.commits`.
- Host compare URL via `@gitspecs/host-urls` `compareUrl` when origin remote parses.

## Coding conventions

- TypeScript strict; Node 18+; **pnpm** workspaces.
- Extension bundle: **esbuild** (`packages/extension/esbuild.mjs`), `vscode` external, CJS outfile `dist/extension.js`.
- Prefer small pure helpers next to commands when logic needs unit tests without the extension host.
- Destructive actions: confirm when `gitspecs.confirmDelete` is true (default).
- Log git argv + exit/stderr to the output channel; never invent token storage (v1 has no secrets).

## License / contributions

GPL-3.0-only. Relicensing future versions is only possible for code under copyright-holder control; prefer DCO/CLA if external contributors appear.

## Quick “don’t break these” checklist

- [ ] Branding remains **GitSpecs** / **ParameterLabsHQ** / `gitspecs.*`
- [ ] No `vscode` imports in `git-core` or `host-urls`
- [ ] Tree commands use `bindCommand` (args forwarded)
- [ ] Worktree branch pick keeps `feature/*` and non-`origin` remotes
- [ ] Multi-remote publish cancel does not push to `origin`
- [ ] SCM single panel (`gitspecs.scm`) + activity-bar dual views stay registered and menu-wired
- [ ] `repository.url` in extension `package.json` points at `https://github.com/ParameterLabsHQ/GitSpecs.git`
- [ ] `pnpm test` and `pnpm package` stay green
