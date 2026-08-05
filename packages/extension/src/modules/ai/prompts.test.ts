import { describe, it, expect } from "vitest";
import {
  truncateDiff,
  buildCommitMessagePrompt,
  buildExplainCommitPrompt,
  extractChatCompletionText,
  DEFAULT_MAX_DIFF_CHARS,
} from "./prompts.js";

describe("AI prompts (P23)", () => {
  it("truncates large diffs", () => {
    const big = "x".repeat(DEFAULT_MAX_DIFF_CHARS + 100);
    const t = truncateDiff(big);
    expect(t.length).toBeLessThan(big.length);
    expect(t).toContain("truncated");
  });

  it("builds commit message prompt from staged diff", () => {
    const p = buildCommitMessagePrompt("diff --git a/f b/f\n+hello");
    expect(p.user).toContain("+hello");
    expect(p.system.toLowerCase()).toContain("commit message");
  });

  it("builds explain prompt", () => {
    const p = buildExplainCommitPrompt("fix bug", "diff");
    expect(p.user).toContain("fix bug");
    expect(p.user).toContain("diff");
  });

  it("extracts chat completion text from OpenAI-shaped JSON", () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: "  feat: add x  " } }],
      }),
    ).toBe("feat: add x");
    expect(extractChatCompletionText({})).toBe("");
  });
});
