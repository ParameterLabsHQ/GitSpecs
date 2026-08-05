import { describe, it, expect, vi } from "vitest";
import { chatCompletion, detectProvider, anthropicMessages } from "./client.js";

describe("chatCompletion / Anthropic (stubbed)", () => {
  it("detects anthropic endpoints", () => {
    expect(detectProvider("https://api.anthropic.com")).toBe("anthropic");
    expect(detectProvider("https://api.openai.com/v1")).toBe("openai-compatible");
  });

  it("posts OpenAI-compatible messages", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "feat: hello" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const text = await chatCompletion(
      {
        endpoint: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "k",
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
      "system",
      "user",
    );
    expect(text).toBe("feat: hello");
    expect(fetch).toHaveBeenCalled();
  });

  it("posts native Anthropic messages API", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ak");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(String(init?.body));
      expect(body.system).toBe("sys");
      expect(body.messages[0].content).toBe("usr");
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "Anthropic says hi" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const text = await anthropicMessages(
      {
        endpoint: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-latest",
        apiKey: "ak",
        provider: "anthropic",
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
      "sys",
      "usr",
    );
    expect(text).toBe("Anthropic says hi");
  });

  it("routes anthropic endpoint through chatCompletion", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "via route" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const text = await chatCompletion(
      {
        endpoint: "https://api.anthropic.com",
        model: "claude",
        apiKey: "k",
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
      "s",
      "u",
    );
    expect(text).toBe("via route");
  });
});
