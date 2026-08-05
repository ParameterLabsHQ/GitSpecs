# True Clone fidelity program — design

**Date:** 2026-08-05 · **Status:** adopted  
**Product:** GitSpecs · **Org:** ParameterLabsHQ  
**Audience:** maintainers and coding agents  
**Supersedes for “next work”:** ROADMAP “parity ladder complete; P14 polish only” → **P24+ True Clone** (active program)

## 1. Product decision

GitSpecs has shipped the **capability ladder** (P0–P12, P15–P23): features exist as modules and commands. Users still report it **does not feel like GitLens**. The product goal is now:

> **True clone of GitLens free/client-side UX** — same containers, ambient density, defaults, keybindings, and action surfaces — under clean-room rules, fully free, **GitSpecs branding**.

| Decision | Choice |
|----------|--------|
| Fidelity bar | **UI chrome clone** — layout + density + defaults + bindings; not near-pixel trademark mimicry |
| Activity-bar architecture | **Mirror GitLens** — Home / Inspect / Graph (+ SCM integration) |
| Delivery model | **Parallel tracks** with a living **fidelity matrix** as the contract |
| Keybindings | **Match GitLens public defaults** where VS Code allows (no hijack of core chords without care) |
| Defaults | **Match GitLens free defaults** + ship **Modes** (Zen / Review / Inspect) early |
| Branding | `GitSpecs` / `ParameterLabsHQ` / `gitspecs.*` command & config IDs only |
| Evidence | Public docs, Marketplace behavior, screenshots — **never** `gitkraken/vscode-gitlens` source |

### 1.1 Hard constraints (binding)

1. **Clean-room** — see [gap analysis §3](./2026-08-05-gitlens-parity-gap-analysis.md). No open/copy/port of GitLens code (MIT core or `src/plus/`).
2. **System git only** via `@gitspecs/git-core`; no `vscode` in pure packages.
3. **No vendor cloud** — Cloud Patches, Code Suggest, Cloud Workspaces, hosted AI accounts remain non-goals ([ROADMAP §5](../../ROADMAP.md)).
4. **No `gitlens.*` command ID collision** — we may use similar *titles* and *key chords*; IDs stay `gitspecs.*`.
5. **GPL-3.0-only** — independent implementation.

### 1.2 Success definition (“true clone enough”)

A GitLens daily driver can switch to GitSpecs and, within one day of coding:

1. Find **Home / Inspect / Graph** in the activity bar with the expected view families.
2. See **current-line blame** (EOL) + **status bar** + **CodeLens** without enabling anything.
3. **Alt+B** (or platform equivalent) toggles **file blame** with **gutter age/heatmap** feel and rich hovers.
4. **File History** and **Line History** are **persistent views** that follow the active editor (pin supported).
5. **Hover / status-bar / CodeLens** expose the same *class* of actions (copy SHA, open remote, history, diff previous, compare).
6. **Zen / Review** modes quiet or amplify chrome in one toggle.
7. Key muscle-memory chords from public GitLens docs work for the mapped commands.
8. Fidelity matrix rows for **P24a–P24e** are green (or explicitly deferred with reason).

Pixel-identical icons, GitLens wordmark, and GitKraken account chrome are **not** required.

---

## 2. Program architecture

```
True Clone (P24+)
├── Fidelity matrix (living inventory)     ← contract for “clone-done”
├── P24a  Inspect shell + File/Line History views
├── P24b  Editor ambient chrome (gutter, current-line, hovers, heatmap, defaults)
├── P24c  Home container + Graph prominence + SCM view placement
├── P24d  Modes (Zen / Review / Inspect profiles)
├── P24e  GitLens-compatible keybindings
└── P24f+ Follow-ups (Commit Details panel, Git Command Palette density,
         deep Settings UI, multi-diff folder ops, view format tokens, …)
```

**Rules**

1. A surface is **clone-done** only when its matrix row is green (behavior + chrome + default + binding if applicable).
2. Tracks may ship as **independent PRs** in parallel; share only pure helpers and shell primitives.
3. Every track updates: fidelity matrix, `docs/ROADMAP.md` §2/§4/§8, structural tests, `AGENTS.md` “next slice” line.
4. Prefer **shared pure action builders** (commit actions, hover markdown, format tokens) over per-module copies.

---

## 3. Target chrome map (from public GitLens docs)

Sources (public, 2025–2026): [GitLens Features](https://help.gitkraken.com/gitlens/gitlens-features/), [Side Bar](https://help.gitkraken.com/gitlens/side-bar/), [Settings](https://help.gitkraken.com/gitlens/gitlens-settings/).

### 3.1 Activity bar containers

| Container ID | Title | Role (GitLens analogue) | Views (target) |
|--------------|-------|-------------------------|----------------|
| `gitspecs.home` | GitSpecs | GitLens Home sidebar | Hub (Launchpad-like), optional “Home” overview (repo/branch/PR status); hosting account/sign-in entry |
| `gitspecs.inspect` | GitSpecs Inspect | GitLens Inspect | File History, Line History, Visual File History, Search & Compare (tree or dual-pane entry), Commit Details (P24f) |
| `gitspecs.graph` | GitSpecs Graph | Commit Graph entry | High-density graph tree; title action **Open Commit Graph** (canvas) |

Icons: keep / evolve `media/gitspecs.svg`; distinct monochrome variants per container if needed (still GitSpecs identity, not GitLens logo).

### 3.2 Source Control placement

Mirror GitLens SCM contribution pattern:

- Contribute **individual** views under `scm` (or keep consolidated `gitspecs.scm` **plus** detachable individual views): Worktrees, Branches, Commits, Stashes, Tags, Remotes, Contributors.
- **Minimum for P24c:** document and implement placement so SCM is the primary home for “git object browsers,” while Home/Inspect/Graph own workflow + context + topology.
- Existing consolidated `gitspecs.scm` tabs may remain as a compact option (`gitspecs.scm.grouped` setting, default aligned with “feels familiar”).

### 3.3 Editor ambient (GitLens free defaults)

| Surface | GitLens public default | GitSpecs target |
|---------|------------------------|-----------------|
| Current-line blame (EOL) | On (`currentLine.enabled`) | **On** — new always-on decoration path (not only status bar) |
| Status bar blame | On | **On** (already) |
| CodeLens (recent + authors) | On | **On** (already); authors click → toggle file blame |
| File blame | Toggle (Alt+B); gutter + message/date | Toggle; **gutter-first** age bar + optional EOL message |
| File heatmap | Toggle with blame ecosystem | Gutter edge heat; cold after ~90 days; median-based brightness (documented) |
| File changes annotations | Toggle | Keep toggle; align gutter styling |
| Hovers (details + changes) | On | Multi-action details hover + previous-line/hunk changes hover |
| Escape dismisses annotation modes | Yes | Yes (when file blame / heatmap / changes active) |

### 3.4 Modes (P24d)

| Mode | Intent | Typical effect |
|------|--------|----------------|
| **Zen** | Quiet | Off: current-line EOL, CodeLens, hovers noise, heatmap; keep status bar optional |
| **Review** | Reviewing code | On: changes annotations, heatmap, richer CodeLens; blame easy to toggle |
| **Inspect** | Deep history | Emphasize Inspect views; ensure File/Line history visible; CodeLens on |

Implementation: named profiles as **setting patches** applied via `gitspecs.mode` + `gitspecs.modes.<name>` objects; status-bar mode indicator (default on). Commands: `gitspecs.mode.switch`, `gitspecs.mode.toggleZen`, `gitspecs.mode.toggleReview`.

Do **not** permanently overwrite user settings without storing previous values for restore.

---

## 4. Track definitions

### P24a — Inspect shell + File / Line History views

**Depends on:** P4–P5 history library, P15 revision docs, P20 visual history (reuse).  
**Done means:**

1. Activity bar container `gitspecs.inspect` registered with:
   - `gitspecs.fileHistory` — TreeDataProvider; follows active editor file; pin toggle; open revision / diff previous / copy SHA / open remote.
   - `gitspecs.lineHistory` — follows selection/line; same actions; hidden-by-default optional (`visibility`).
   - `gitspecs.visualFileHistory` view entry or title command that opens existing webview.
   - `gitspecs.searchAndCompare` view or clear entry points to dual-pane + commit search.
2. Selection changes refresh history (debounced); multi-repo uses `RepoContext` current repo + path.
3. Structural tests for container + view IDs + menus.
4. QuickPick history commands remain for palette users.

**Out of P24a:** full Commit Details webview/tree (P24f); pixel polish of tree icons.

### P24b — Editor ambient chrome

**Depends on:** P1–P3 blame, P16 annotations.  
**Done means:**

1. **Current-line EOL blame** always on when `gitspecs.currentLine.enabled` (default `true`), independent of full-file blame toggle.
2. **File blame** presentation:
   - Gutter heat/age indicator (decoration types).
   - Per-line commit message/date in gutter or after-content per settings (`gitspecs.blame.file.format` style keys — keep small closed set).
3. **Heatmap** as gutter edge (not only overview ruler); toggle command; default with file blame or independent setting matching “available and easy”).
4. **Rich hovers** for current line + annotation lines:
   - Markdown details (author, date, message, autolinks, optional PR/issue enrichment when signed in).
   - Action links: Open Changes, Diff with Previous, File History, Copy SHA, Open on Remote, Toggle File Blame (subset OK if complete core set ships).
   - Changes hover: previous line content or hunk (`git show` / blame parent via git-core).
5. Defaults flipped to GitLens-like free defaults (see §5).
6. Escape cancels active file annotation mode(s).
7. Pure tests for hover markdown builders and formatters; structural tests for new settings keys.

**Out of P24b:** avatar images in hovers if hosting not signed in (graceful omit); Live Share invite.

### P24c — Home container + Graph prominence + SCM placement

**Depends on:** P22 hub, P18 graph canvas, existing tree modules.  
**Done means:**

1. Split activity bar:
   - `gitspecs.home` — Hub (+ optional compact repo/branch header).
   - `gitspecs.graph` — graph tree + **Open Graph** prominent.
   - Move object browsers per §3.2 (SCM-first).
2. Remove single mega-container that dumps every view together (or leave empty legacy id only if required for migration — prefer clean break with reset-view-locations note in README).
3. Graph: WIP row + filter already exist; ensure open-canvas is one click from Graph container title.
4. Structural tests for all container/view IDs; update `scmViews.test.ts` / roadmap parity tests.

**Out of P24c:** GitKraken Workspaces / Account cloud UI; Cloud Patches view.

### P24d — Modes

**Depends on:** P24b settings keys exist (can land after or with b).  
**Done means:**

1. `gitspecs.mode` + profile definitions for Zen / Review / Inspect.
2. Switch/toggle commands; optional status-bar mode item.
3. Profiles only touch known `gitspecs.*` keys; restore prior snapshot on leave.
4. Unit tests for apply/restore profile; structural contrib tests.

### P24e — Keybindings

**Depends on:** commands exist for each binding target.  
**Done means:**

1. `contributes.keybindings` matching public GitLens defaults where safe, e.g.:
   - Toggle file blame — `alt+b` (`gitspecs.blame.toggleFile`)
   - Toggle CodeLens — `shift+alt+b` (`gitspecs.blame.toggleCodeLens` if added)
   - Document other public chords used for history/diff when we have 1:1 commands
2. Platform-specific `when` clauses; document conflicts in README.
3. Structural test: expected keybinding list present.
4. **No** rebinding of core VS Code git commands.

### P24f+ — Follow-ups (matrix rows, not blocking first “daily driver” claim)

- Commit Details inspect panel (cursor-follow)
- Git Command Palette (`gitspecs.gitCommands`) guided flows beyond rewrite
- Folder multi-diff / open all changes density
- Interactive settings webview (“Open Settings”)
- View item format tokens (`views.formats.commits.label`, etc.)
- Line-level diff with previous/working commands
- Deep link / share URLs (vscode URI handlers)

---

## 5. Default settings target (free GitLens-like)

| Setting (proposed `gitspecs.*`) | Default | Notes |
|---------------------------------|---------|--------|
| `currentLine.enabled` | `true` | EOL current-line blame |
| `blame.statusBar` | `true` | Existing |
| `blame.codeLens` | `true` | Existing |
| `hovers.enabled` | `true` | Master hover switch |
| `hovers.currentLine.details` | `true` | |
| `hovers.currentLine.changes` | `true` | |
| `hovers.annotations.details` | `true` | When file blame on |
| `hovers.annotations.changes` | `true` | |
| `blame.heatmap` | `false` until file blame on; or follow toggle | Align UX: heatmap on with file blame session |
| `annotations.changes` | `false` | Toggle; Review mode turns on |
| `terminalLinks` | `true` | Existing |
| `mode` | `""` / normal | No mode until user picks |
| `mode.statusBar` | `true` | Show active mode |

Exact key names may nest under existing `gitspecs.blame.*` if that reduces churn — matrix records final keys.

---

## 6. Keybinding target (initial)

| Chord | Command | GitLens public analogue |
|-------|---------|-------------------------|
| `Alt+B` | `gitspecs.blame.toggleFile` | `gitlens.toggleFileBlame` |
| `Shift+Alt+B` | `gitspecs.blame.toggleCodeLens` | `gitlens.toggleCodeLens` |
| `Escape` | `gitspecs.annotations.dismiss` (when annotation mode) | Dismiss file annotations |

Expand matrix as commands gain 1:1 pairs (file history, etc.). Prefer documenting “recommended” chords in README when VS Code default conflicts force a different default.

---

## 7. Shared implementation building blocks

Avoid re-solving “commit actions” per view:

| Module (proposed) | Responsibility |
|-------------------|----------------|
| `shell/commitActions.ts` | Pure list of actions for a commit/file context → command + args |
| `modules/blame/hoverMarkdown.ts` | Details + changes hover markdown + command URIs |
| `modules/blame/gutter.ts` | Decoration for file blame / heatmap gutter |
| `modules/history/fileHistoryProvider.ts` | Tree provider + pin + follow-editor |
| `modules/history/lineHistoryProvider.ts` | Selection-follow tree |
| `shell/modes.ts` | Profile apply/restore |
| `docs/FIDELITY_MATRIX.md` | Living matrix (or section in this doc until large) |

Library gaps (add only when a track needs them):

- Blame parent line / hunk text for changes hover (`git-core`)
- Any missing `revisionNeighbors` edge cases for line-level diff commands

---

## 8. Fidelity matrix (seed)

Status: **Missing** | **Partial** | **Shipped** | **N/A (non-goal)**

| ID | Surface | GitLens free/client | GitSpecs now | Target track |
|----|---------|---------------------|--------------|--------------|
| M01 | Activity Home container | Yes | Single mega container | P24c |
| M02 | Activity Inspect container | Yes | Missing | P24a |
| M03 | Activity Graph container | Yes (graph entry) | Graph inside mega | P24c |
| M04 | SCM object browsers | Yes | Consolidated SCM + activity dump | P24c |
| M05 | File History **view** | Yes | QuickPick only | P24a |
| M06 | Line History **view** | Yes | QuickPick only | P24a |
| M07 | Visual File History | Yes (FREE-PUB) | Webview command | P24a wire-in |
| M08 | Search & Compare view | Yes | QuickPick + dual-pane | P24a |
| M09 | Current-line EOL blame | Default on | Status bar + optional file blame EOL | P24b |
| M10 | File blame gutter | Toggle Alt+B | EOL annotations, toggle | P24b |
| M11 | File heatmap gutter | Toggle | Overview ruler optional | P24b |
| M12 | Changes annotations | Toggle | Exists, off default | P24b polish |
| M13 | Details hover + actions | Default on | Enriched string hover | P24b |
| M14 | Changes (diff) hover | Default on | Missing | P24b |
| M15 | CodeLens authors→blame | Default on | CodeLens exists | P24b |
| M16 | Status bar blame | Default on | Shipped | — |
| M17 | Modes Zen/Review | Yes | Missing | P24d |
| M18 | Keybinding Alt+B etc. | Yes | Missing contrib | P24e |
| M19 | Commit Graph canvas | FREE-PUB | Shipped | P24c prominence |
| M20 | Hub / Launchpad-like | PRO (client rebuild free) | Hub shipped | P24c placement |
| M21 | Hosting PRs/issues | Basic free / rich pro | P21 shipped | polish |
| M22 | AI BYO | Pro/BYO | P23 shipped | — |
| M23 | Cloud Patches / Code Suggest | PRO cloud | **N/A** | non-goal |
| M24 | Git Command Palette | Free | Partial rewrite only | P24f |
| M25 | Commit Details inspect | Free | Missing | P24f |
| M26 | Interactive settings UI | Free | package.json only | P24f |

Update this table whenever a track lands.

---

## 9. Testing strategy

| Layer | Expectation |
|-------|-------------|
| Pure formatters / hover markdown / mode profiles | Unit tests (deterministic clocks) |
| git-core blame parent / hunk helpers | Real-git temp repos |
| Containers, views, keybindings, default values | Structural `*.test.ts` / package.json assertions |
| roadmap honesty | Extend `roadmapParity.test.ts` for P24 next-slice language |
| Manual | Launch Extension: open file → ambient blame; Alt+B; Inspect history follows; Zen quiets |

No test theater: tests call shipped helpers, not reimplemented oracles.

---

## 10. Documentation / agent updates (same program)

When the first track merges:

1. `docs/ROADMAP.md` — Section 2 rows for True Clone; Section 3 P24a–e; Section 4 next goal; Section 8 changelog.
2. `AGENTS.md` — Next implementation slice → P24; monorepo layout if new modules; product identity unchanged.
3. `README.md` — User-facing “GitLens-like chrome” + keybinding table + Modes.
4. Optional `docs/FIDELITY_MATRIX.md` if matrix outgrows this spec.

---

## 11. Recommended implementation order (first plan)

Even with parallel tracks, **first implementation plan** should be:

1. **P24b skeleton** — current-line EOL + hover action markdown + defaults (highest “feel” per hour).  
2. **P24a** — Inspect container + File History view (highest “looks like GitLens” sidebar).  
3. **P24e** — Alt+B / Shift+Alt+B (cheap win once commands exist).  
4. **P24d** — Modes once settings keys stable.  
5. **P24c** — Container split last among P24a–e if it thrashs manifests — **or** first if agents can isolate package.json carefully.

**Agent default if unspecified:** start **P24b** (editor ambient), then **P24a**, then **P24e**, **P24d**, **P24c**.

Each track: design already here → task plan → TDD → structural tests → matrix + roadmap update → `pnpm test` + `pnpm package`.

---

## 12. PR plan (high level)

| PR | Track | Risk |
|----|-------|------|
| PR1 | P24b current-line + hovers + defaults | Medium (editor performance) |
| PR2 | P24b gutter blame + heatmap | Medium |
| PR3 | P24a Inspect + File/Line History views | Medium |
| PR4 | P24e keybindings | Low |
| PR5 | P24d Modes | Medium (settings restore) |
| PR6 | P24c Home/Inspect/Graph + SCM placement | High (manifest / UX migration) |

PRs 1–3 may parallelize after shared hover/action helpers land in PR1.

---

## 13. Non-goals (explicit)

- Copying GitLens source, assets, or proprietary `plus` UI code  
- GitKraken account, Cloud Patches, Code Suggest, Cloud Workspaces  
- Hosted AI quotas / accounts (BYO-key remains)  
- Trademark-confusing naming (`GitLens` in product name)  
- Claiming Marketplace “compatible with gitlens.* settings” import (optional future converter only)

---

## 14. Open points (resolved by recommendation)

| Topic | Resolution |
|-------|------------|
| Consolidated SCM vs many SCM views | Prefer GitLens-like individual SCM views in P24c; keep grouped mode as setting |
| Heatmap with blame | Heatmap engages with file-blame session; independent toggle retained |
| Commit Details | Deferred P24f; cursor-follow later |
| Settings interactive webview | Deferred P24f |

---

## 15. Changelog

| Date | Change |
|------|--------|
| 2026-08-05 | Initial True Clone fidelity design from product workshop (UI chrome, Home/Inspect/Graph, parallel tracks, keybindings match, defaults+Modes). |
