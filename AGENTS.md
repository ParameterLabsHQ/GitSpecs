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
| **View ids** | `gitspecs.worktrees`, `gitspecs.branches`, `gitspecs.scm.worktrees`, `gitspecs.scm.branches` |
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

Open-source **GitLens-style** shell focused on **worktrees** and **branches** so users are not forced to pay for those workflows. v1 is a daily-driver extension for Cursor/VS Code, not a full GitLens clone.

**In scope (v1):**

- Worktrees: list, create (existing or new branch), open current/new window, reveal, copy path, remove, prune
- Branches: full local/remote toolkit (CRUD, checkout, upstream, push/pull/fetch, delete remote, merge/rebase/cherry-pick, create from commit, compare summary, copy name, open on remote)
- Hosting links: **URL-only** (GitHub/GitLab/Bitbucket/Azure DevOps); no PATs/APIs
- UI: dedicated activity-bar container **and** GitLens-style sections in the **Source Control** tab
- System `git` only (2.23+, prefer 2.25+)

**Out of scope (v1):**

- Blame, CodeLens, heatmaps, commit graph, file/line history webviews
- Hosting provider HTTP APIs / create-PR flows
- Marketplace/Open VSX publish (local VSIX is enough)
- Interactive rebase UI / custom merge conflict UI
- Embedding Git or isomorphic-git

Design source of truth: `docs/superpowers/specs/2026-08-04-gitspecs-design.md`.

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
8. **SCM placement** — Contribute `gitspecs.scm.worktrees` / `gitspecs.scm.branches` under the `scm` view container; same providers + menus as the sidebar.
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
│           │   ├── history/     # stub only
│           │   ├── blame/       # stub only
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
6. **Future modules** stay as stubs until designed; do not half-implement blame/graph.

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
- **Source Control tab:** same data under `gitspecs.scm.*` views (GitLens-style sections next to Changes).
- Menus `when` clauses must include **both** sidebar and SCM view ids.
- Output channel name: **GitSpecs**.
- Settings namespace: `gitspecs.git.path`, `gitspecs.worktrees.*`, `gitspecs.confirmDelete`, `gitspecs.log.verbosity`.

## Product roadmap

See **[docs/ROADMAP.md](./docs/ROADMAP.md)** for must-have GitLens-clone phases:

| Phase | Focus | Status |
|-------|--------|--------|
| 0 | Worktrees + branches (+ basic compare) | Done |
| 1 | Authorship / **blame** | **Shipped** (`repo.blame`, `gitspecs.blame.*`) |
| 2 | File / line history | Next incomplete must-have after blame |
| 3 | Comparison polish | Partial |
| 4 | Commit graph | Later |

### Blame module notes

- Library: `@gitspecs/git-core` → `repo.blame.blame` / `blameLine` (`git blame --line-porcelain`).
- Extension: `BlameController` decorations + commands `gitspecs.blame.toggleFile` / `showLine` / `fileToOutput`.
- Format via shipped `formatBlameAnnotation` (do not reimplement in tests).

## Implementation phases (historical)

1. ~~Scaffold + license + empty activate~~
2. ~~git-core exec + discovery + worktrees~~
3. ~~branch toolkit~~
4. ~~host-urls~~
5. ~~extension shell + modules + SCM~~
6. ~~Phase 1 blame~~
7. Polish: refresh edge cases, multi-root UX, Windows/Linux verification
8. Phase 2+ history / compare polish / graph (roadmap first)
9. Public launch: CONTRIBUTING, CI, Open VSX / Marketplace under GPL-3.0

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
- [ ] SCM + activity bar view ids stay registered and menu-wired
- [ ] `repository.url` in extension `package.json` points at `https://github.com/ParameterLabsHQ/GitSpecs.git`
- [ ] `pnpm test` and `pnpm package` stay green
