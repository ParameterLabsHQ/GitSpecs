/**
 * Pure SCM consolidated-panel tab state (GitLens-style single panel, multi-tab).
 * No vscode imports — unit-testable without the extension host.
 */

export type ScmTab = "worktrees" | "branches" | "commits" | "stashes";

/** Single SCM view contributed under the Source Control container. */
export const SCM_CONSOLIDATED_VIEW_ID = "gitspecs.scm";

/** Context key set via `setContext` for menu `when` clauses on the active tab. */
export const SCM_TAB_CONTEXT_KEY = "gitspecs.scm.tab";

/**
 * Context key: true when at least one Git repository is open.
 * Used by consolidated SCM `viewsWelcome` `when` clauses so empty tabs
 * (e.g. no stashes) do not show the “No Git repository open” message.
 */
export const HAS_REPOSITORY_CONTEXT_KEY = "gitspecs.hasRepository";

export const DEFAULT_SCM_TAB: ScmTab = "worktrees";

const SCM_TABS: readonly ScmTab[] = ["worktrees", "branches", "commits", "stashes"];

export function isScmTab(value: string): value is ScmTab {
  return (SCM_TABS as readonly string[]).includes(value);
}

export function resolveScmTab(value: string | undefined): ScmTab {
  return value !== undefined && isScmTab(value) ? value : DEFAULT_SCM_TAB;
}

/**
 * Mutable active-tab holder for the consolidated SCM view.
 * Listeners fire only when the tab actually changes.
 */
export class ScmTabState {
  private tab: ScmTab = DEFAULT_SCM_TAB;
  private readonly listeners = new Set<(tab: ScmTab) => void>();

  get active(): ScmTab {
    return this.tab;
  }

  /** Returns true if the active tab changed. */
  setActive(tab: ScmTab): boolean {
    if (this.tab === tab) return false;
    this.tab = tab;
    for (const listener of this.listeners) {
      listener(tab);
    }
    return true;
  }

  onDidChange(listener: (tab: ScmTab) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
