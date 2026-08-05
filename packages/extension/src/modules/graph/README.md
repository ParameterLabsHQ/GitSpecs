# Commit Graph (P11)

High-density **Commit Graph** tree (not a webview DAG).

- Library: `@gitspecs/git-core` → `repo.graph.log` (parents + refs + lane layout)
- Bounds: default **200**, max **500** commits (`DEFAULT_GRAPH_LIMIT` / `MAX_GRAPH_LIMIT`)
- View: `gitspecs.graph`
- Actions: copy SHA, checkout, create branch, compare, open remote
