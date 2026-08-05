import { extractChatCompletionText } from "./prompts.js";

export interface AiClientConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  fetch?: typeof fetch;
}

/**
 * OpenAI-compatible chat completions client (Anthropic-compatible adapters
 * can use the same shape when pointed at a proxy). Inject fetch for tests.
 */
export async function chatCompletion(
  config: AiClientConfig,
  system: string,
  user: string,
): Promise<string> {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(config.endpoint.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI provider ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return extractChatCompletionText(json);
}
