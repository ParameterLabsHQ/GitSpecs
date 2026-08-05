# History module (P4–P5)

| Phase | Surface |
|-------|---------|
| **P4** | File history (`gitspecs.history.file`) via `repo.history.file` → QuickPick |
| **P5** | Line / selection history (`gitspecs.history.line`) via `repo.history.line` (`git log -L`, file-history fallback on failure) |

## Commands

- `gitspecs.history.file` — history for the active editor file
- `gitspecs.history.line` — history for the current selection or cursor line

## Actions (per commit)

- Copy SHA
- View File at Revision (`gitspecs:` revision document via `repo.history.showFile`)
- Open Changes with Previous Revision / Working Tree (`vscode.diff` + revision documents)
- Open Commit on Remote (URL-only via `@gitspecs/host-urls` when `origin` parses)

## Library

All git CLI goes through `@gitspecs/git-core` (`HistoryApi`). Pure action helpers live in `actions.ts` for unit tests without the extension host.
