import type { ContributorInfo } from "@gitspecs/git-core";

export const DEFAULT_CONTRIBUTORS_LIMIT = 100;

export function formatContributorTreeRow(c: ContributorInfo): {
  label: string;
  description: string;
  tooltip: string;
} {
  const commitsLabel = c.commits === 1 ? "1 commit" : `${c.commits} commits`;
  return {
    label: c.name,
    description: [commitsLabel, c.email].filter(Boolean).join(" · "),
    tooltip: [c.name, c.email, commitsLabel].filter(Boolean).join("\n"),
  };
}
