import type { TagInfo } from "@gitspecs/git-core";

export function formatTagTreeRow(tag: TagInfo): {
  label: string;
  description: string;
  tooltip: string;
} {
  const short = tag.sha.slice(0, 7);
  const kind = tag.annotated ? "annotated" : "lightweight";
  const desc = [short, kind, tag.message].filter(Boolean).join(" · ");
  return {
    label: tag.name,
    description: desc,
    tooltip: [tag.name, tag.sha, kind, tag.message].filter(Boolean).join("\n"),
  };
}
