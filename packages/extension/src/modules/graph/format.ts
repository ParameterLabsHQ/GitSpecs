import type { GraphCommit } from "@gitspecs/git-core";
import { DEFAULT_GRAPH_LIMIT, MAX_GRAPH_LIMIT } from "@gitspecs/git-core";

export { DEFAULT_GRAPH_LIMIT, MAX_GRAPH_LIMIT };

export function formatGraphTreeRow(node: GraphCommit): {
  label: string;
  description: string;
  tooltip: string;
} {
  const short = node.sha.slice(0, 7);
  const subject = node.subject || "(no subject)";
  const refs = node.refs.length ? ` [${node.refs.join(", ")}]` : "";
  const when =
    node.authorTime > 0
      ? new Date(node.authorTime * 1000).toISOString().slice(0, 10)
      : "";
  return {
    label: `${node.graph}  ${short}  ${subject}${refs}`,
    description: [node.author, when].filter(Boolean).join(" · "),
    tooltip: [
      node.sha,
      subject,
      node.author,
      node.parents.length ? `parents: ${node.parents.map((p) => p.slice(0, 7)).join(" ")}` : undefined,
      node.refs.length ? `refs: ${node.refs.join(", ")}` : undefined,
      `lane ${node.lane}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
