# Commits (P7)

Activity-bar + SCM **Commits** browser: recent commits on the current branch.

- Library: `@gitspecs/git-core` → `repo.history.recent`
- Tree: `CommitsProvider` / `CommitItem` (`contextValue: commit`)
- Commands: `gitspecs.commits.refresh` / `copySha` / `checkout` / `createBranch` / `openRemote`
- Pure helpers: `format.ts` (row labels, host commit URL, action list)
