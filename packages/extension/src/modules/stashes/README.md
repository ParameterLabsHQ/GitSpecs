# Stashes (P8)

Activity-bar + SCM **Stashes** browser.

- Library: `@gitspecs/git-core` → `repo.stashes` (list / push / apply / pop / drop / show)
- Tree: `StashesProvider` / `StashItem` (`contextValue: stash`)
- Commands: `gitspecs.stashes.refresh` / `push` / `apply` / `pop` / `drop` / `show`
- Destructive pop/drop honor `gitspecs.confirmDelete`
