# Revision navigation (P15)

Read-only **`gitspecs:`** documents for file content at a revision, plus prev/next and diff commands.

## Library (`@gitspecs/git-core`)

- `repo.history.fileWithPaths` — `git log --follow --name-only` with `pathAtRev`
- `repo.history.revisionNeighbors(path, sha)` — previous (older) / next (newer) along that sequence
- `repo.history.showFile` — rename-aware blob load

## Extension

| Command | Role |
|---------|------|
| `gitspecs.revision.openAtRevision` | QuickPick file history → open `gitspecs:` doc |
| `gitspecs.revision.diffWithPrevious` | `vscode.diff` vs previous file revision |
| `gitspecs.revision.diffWithWorking` | `vscode.diff` vs working tree |
| `gitspecs.revision.previous` / `next` | Step along file history (editor title on `gitspecs:` docs) |

Context keys: `gitspecs.revision.hasPrevious`, `gitspecs.revision.hasNext`, `gitspecs.revision.isRevisionEditor`.

History “View File at Revision” uses this module (no untitled previews).
