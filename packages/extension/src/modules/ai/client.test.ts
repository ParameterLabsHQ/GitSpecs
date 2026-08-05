import { describe, it, expect, vi } from "vitest";
import { chatCompletion } from "./client.js";

describe("chatCompletion (stubbed)", () => {
  it("posts messages and extracts content", async () => {
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
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
  });
});
