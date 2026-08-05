# P21 — Hosting provider APIs (design note)

**Auth:** GitHub via `vscode.authentication.getSession("github", …)`; GitLab/Bitbucket/Azure PATs via `context.secrets`. Never settings/files/globalState.

**Package:** `@gitspecs/host-api` — pure clients, injected `fetch`, stubbed in tests.

**Features (v1):** PR-for-branch status bar + command; create-PR prefilled URL; issue/PR details enrichment hooks for autolinks; provider avatar URLs (no CDN).

**Offline:** all features degrade silently when signed out.
