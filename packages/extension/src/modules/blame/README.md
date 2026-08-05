# Blame (Phases P1–P3)

Line-level authorship via `@gitspecs/git-core` `repo.blame`.

| Phase | Surface |
|-------|---------|
| **P1** | Toggle file decorations, show line blame, blame file to Output |
| **P2** | Status-bar current-line blame (`gitspecs.blame.statusBar`); click → detail (message / copy SHA / open commit URL) |
| **P3** | File-level CodeLens (`gitspecs.blame.codeLens`); richer hovers; shared blame cache |

Settings:

- `gitspecs.blame.statusBar` (default `true`)
- `gitspecs.blame.codeLens` (default `true`)

Commands:

- `gitspecs.blame.toggleFile`
- `gitspecs.blame.showLine`
- `gitspecs.blame.fileToOutput`
- `gitspecs.blame.statusBarDetails`
- `gitspecs.blame.codeLensDetail`

See `docs/ROADMAP.md` Phases P1–P3.
