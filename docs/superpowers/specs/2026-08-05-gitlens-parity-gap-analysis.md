# GitLens parity gap analysis — GitSpecs vs GitLens 18.3

**Date:** 2026-08-05 · **Status:** adopted (drives roadmap phases P15–P23)
**Audience:** maintainers and coding agents planning parity phases

GitSpecs' goal is **full GitLens feature parity, free and open source** — including the
client-side features GitKraken gates behind paid plans. This document records the
verified GitLens 18.3 surface (July 2026), where GitSpecs stands, and the resulting
gap buckets. `docs/ROADMAP.md` Section 3 turns these buckets into phases.

## 1. Scope decision (2026-08-05)

Earlier roadmap revisions targeted "local OSS parity" only and listed Launchpad and AI
as non-goals. The product goal is now broader:

- **In scope:** everything client-side, including GitLens Pro-tier features rebuilt
  clean-room — Commit Graph webview, Visual File History, rich hosting integrations
  (PRs/issues/avatars), a client-side Launchpad-style work hub, BYO-key AI assist.
- **Still out of scope:** features that require operating a vendor cloud backend
  (Cloud Patches, Code Suggest, Cloud Workspaces, hosted AI with quotas/accounts) and
  any paywall. See `docs/ROADMAP.md` Section 5.

## 2. GitLens 18.3 surface and tiers (verified 2026-08-05)

Tier legend: **FREE** = free for everyone · **FREE-PUB** = free on public/local repos,
Pro on privately-hosted repos · **PRO/ADV** = paid plans (Community → Pro → Advanced →
Business → Enterprise ladder as of mid-2026).

| GitLens feature | Tier | GitSpecs status (2026-08-05) |
|---|---|---|
| Inline / status-bar / file blame | FREE | Shipped (P1–P2; end-of-line decorations vs gutter) |
| Blame heatmap | FREE | Shipped (P14 slice) |
| Rich hovers | FREE | Shipped (enriched blame hovers, P3) |
| Git CodeLens (file + symbol level) | FREE | Partial — file-level only (P3); symbol-level → **P16** |
| File changes annotations (working tree / unpushed) | FREE | Missing → **P16** |
| Revision navigation (step prev/next, diff with previous) | FREE | Missing — one-shot view-at-revision only → **P15** |
| File / Line History | FREE | Shipped (P4–P5, QuickPick) |
| Search & Compare | FREE | Shipped as QuickPick (P6); dual-pane → **P20** |
| Sidebar views (commits/stashes/tags/remotes/contributors/worktrees) | FREE | Shipped (P0, P7–P10) |
| Multi-repo simultaneous views | FREE | Missing — single current repo → **P17** |
| Commit Graph (DAG webview, search/filter, WIP rows, inline rewrite) | FREE-PUB | Partial — high-density tree (P11) → canvas in **P18** |
| Visual File History (timeline chart) | FREE-PUB | Missing → **P20** |
| Worktrees | FREE-PUB | Shipped (P0; `move` deferred) |
| Interactive Rebase Editor | FREE | Missing — guided conflict flows only (P12) → **P19** |
| Git Command Palette (guided ops) | FREE | Partial (guided rebase/cherry-pick) |
| Terminal links | FREE | Missing → **P16** |
| Autolinks (issue keys → URLs) | FREE | Missing → **P16** |
| Modes (Zen/Review setting profiles) | FREE | Missing → P14 polish follow-up |
| Rich integrations: PR/issue details, PR-for-branch, avatars | FREE basic / PRO rich + self-hosted | Missing — URL-only `host-urls` → **P21** |
| Launchpad (PR/issue action hub) | PRO | Missing → client-side work hub **P22** |
| Cloud Patches / Code Suggest / Cloud Workspaces | PRO | Non-goal (vendor cloud backend) |
| AI: commit messages, explain, review/resolve modes | PRO / BYO-key | Missing → BYO-key assist **P23** |

Sources (fetched 2026-08-05): GitLens README + LICENSE/LICENSE.plus
(github.com/gitkraken/vscode-gitlens), help.gitkraken.com GitLens feature docs and
release notes 17.2–18.3, gitkraken.com/gitlens/pricing, VS Code Marketplace listing.

## 3. Licensing constraint — clean-room rule (binding)

GitLens is MIT **except everything under `src/plus/`**, which is proprietary
(GitKraken EULA; subscription required). The `plus` tree contains exactly the features
we most want to rebuild: Commit Graph, Launchpad, rich integrations, AI.

**Binding rule for all contributors and agents:**

1. **Never open, copy, or port code from `gitkraken/vscode-gitlens`** — neither
   `src/plus/**` (proprietary) nor the MIT core (avoids license-mixing and
   derivative-work questions in a GPL-3.0-only codebase).
2. Parity is implemented **clean-room**: from documented behavior, public docs,
   screenshots, and independent design. Naming, protocols, and file formats may match
   where interop requires (e.g. `git-rebase-todo`).
3. Citing GitLens *documentation* for behavior is fine; cite it in design notes.

## 4. Gap buckets → phases

1. **Native-UI editor depth** (no new infra): revision navigation + revision diffs
   (**P15**); changes annotations, symbol CodeLens, terminal links, autolinks (**P16**).
2. **Multi-repo** (architectural, native UI): all repos visible at once (**P17**).
3. **Webview surfaces** (one-time platform investment, then flagship features):
   webview platform + Commit Graph canvas (**P18**), interactive rebase editor
   (**P19**), Visual File History + dual-pane compare (**P20**).
4. **Hosting APIs** (auth unblocked): the P13 deferral cited "no token storage", but
   VS Code provides `vscode.authentication` (built-in GitHub provider — zero custom
   secret handling) and `SecretStorage` for PATs. Rich integrations (**P21**),
   then the client-side work hub (**P22**).
5. **AI assist**: optional, BYO-key, off by default (**P23**). Hosted AI stays a
   non-goal.

## 5. Differentiation thesis

Everything GitKraken charges for that is client-side code can be rebuilt free. Because
`src/plus/` cannot be forked, a GPL clean-room implementation of the paid surface
(graph canvas, work hub, integrations) is both the largest user value and the part of
GitSpecs that cannot be commoditized back into the upstream product.
