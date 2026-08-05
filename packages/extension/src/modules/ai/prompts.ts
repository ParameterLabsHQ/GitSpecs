/**
 * Pure prompt assembly for optional BYO-key AI (P23).
 */

export const DEFAULT_MAX_DIFF_CHARS = 12_000;

export function truncateDiff(diff: string, maxChars = DEFAULT_MAX_DIFF_CHARS): string {
  if (diff.length <= maxChars) return diff;
  return (
    diff.slice(0, maxChars) +
    `\n\n…[truncated ${diff.length - maxChars} chars for prompt size cap]`
  );
}

export function buildCommitMessagePrompt(diff: string, options?: { maxChars?: number }): {
  system: string;
  user: string;
} {
  const body = truncateDiff(diff, options?.maxChars);
  return {
    system:
      "You are a git commit message assistant. Reply with only a concise commit message (subject ≤72 chars, optional body). No quotes or preamble.",
    user: `Write a commit message for this staged diff:\n\n${body}`,
  };
}

export function buildExplainCommitPrompt(
  subject: string,
  diff: string,
  options?: { maxChars?: number },
): { system: string; user: string } {
  const body = truncateDiff(diff, options?.maxChars);
  return {
    system:
      "You explain git commits clearly for developers. Be concise. Use bullet points when helpful.",
    user: `Explain this commit.\nSubject: ${subject}\n\nDiff:\n${body}`,
  };
}

/** Parse OpenAI-compatible chat completion JSON for the assistant message text. */
export function extractChatCompletionText(json: unknown): string {
  const root = json as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = root.choices?.[0]?.message?.content;
  return (text ?? "").trim();
}
