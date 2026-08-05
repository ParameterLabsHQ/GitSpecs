# Contributing to GitSpecs

Thanks for helping improve **GitSpecs** (ParameterLabsHQ), an open-source GitLens-style extension for VS Code and Cursor.

## License

This project is **GPL-3.0-only**. Contributions are accepted under the same license.

## Development setup

Requirements:

- **Node.js 18+**
- **pnpm 9+**
- **Git 2.23+** on `PATH` (library tests use real `git`, not mocks)

```bash
pnpm install
pnpm build
pnpm test
pnpm package   # builds packages/extension/gitspecs.vsix
```

Debug the extension: open this monorepo in VS Code/Cursor → **Run and Debug** → **Launch Extension**  
(`--extensionDevelopmentPath=packages/extension`).

## Architecture (must-follow)

See [AGENTS.md](./AGENTS.md) and [docs/ROADMAP.md](./docs/ROADMAP.md).

Highlights:

1. All Git CLI goes through `@gitspecs/git-core` (no ad-hoc `spawn` in the extension).
2. `git-core` and `host-urls` must **not** import `vscode`.
3. Tree command handlers use `bindCommand` so TreeItem args are forwarded.
4. Branding is only **GitSpecs** / **ParameterLabsHQ** / `gitspecs.*`.
5. Tests that call Git must use real temp repos (no mocked git binary for ops under test).

## Pull requests

1. One focused change set (prefer one roadmap phase or one bugfix).
2. `pnpm test` and `pnpm package` green.
3. Update `docs/ROADMAP.md` Section 2 if you ship a phase.
4. Do not reintroduce retired names (`gitPlatform.*`, etc.).

## Reporting issues

Include OS, editor version (VS Code/Cursor), Git version (`git --version`), and steps to reproduce. Attach GitSpecs **Output** channel logs when relevant (`gitspecs.log.verbosity`).

## Non-goals

Cloud/GitKraken products (Launchpad, Cloud Patches, AI composer) and paid feature gates are out of open-source parity — see roadmap Section 5.
