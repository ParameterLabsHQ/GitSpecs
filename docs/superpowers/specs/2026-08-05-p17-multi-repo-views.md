# P17 — Multi-repo views (design note)

**Date:** 2026-08-05  
**Status:** implementation companion for roadmap P17

## Goal

When a multi-root workspace contains more than one Git repository, GitSpecs tree views (worktrees, branches, commits, stashes, tags, remotes, contributors, graph) show **per-repository root groups**. Single-repo workspaces keep today’s flat lists.

Editor-scoped features (blame, history, revision navigation, annotations) continue to use **current repo** (`RepoContext.currentRepo` + Switch Repository).

## Data model

- `RepoContext.allRepos` already lists every discovered root.
- Tree leaf items carry `repoRoot: string` (absolute).
- Command handlers resolve with `repos.repoByRoot(item.repoRoot) ?? repos.currentRepo` — never only global current for tree actions when an item is present.

## Tree shape

| Workspace | Root children |
|-----------|----------------|
| 0 repos | empty |
| 1 repo | same as today (leaf items, no repo folder) |
| N>1 repos | one collapsible `RepoRootItem` per repo → leaves for that repo |

## Out of scope

- Merging multi-repo into a single mixed leaf list
- Changing editor/blame current-repo semantics
- Webview multi-repo (P18+)

## Principle 4

Roadmap principle 4 is amended: multi-repo views group under roots; single current repo remains for editor-scoped commands.
