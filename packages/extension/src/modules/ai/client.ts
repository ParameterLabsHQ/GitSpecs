import { extractChatCompletionText } from "./prompts.js";

export type AiProviderKind = "openai-compatible" | "anthropic";

export interface AiClientConfig {
  /** openai-compatible base URL, or Anthropic API base. */
  endpoint: string;
  model: string;
  apiKey: string;
  provider?: AiProviderKind;
  fetch?: typeof fetch;
}

/**
 * Chat completion for OpenAI-compatible or native Anthropic Messages API.
 * Inject fetch for tests.
 */
export async function chatCompletion(
  config: AiClientConfig,
  system: string,
  user: string,
): Promise<string> {
  const provider = config.provider ?? detectProvider(config.endpoint);
  if (provider === "anthropic") {
    return anthropicMessages(config, system, user);
  }
  return openAiChatCompletions(config, system, user);
}

export function detectProvider(endpoint: string): AiProviderKind {
  const e = endpoint.toLowerCase();
  if (e.includes("anthropic.com") || e.includes("api.anthropic")) {
    return "anthropic";
  }
  return "openai-compatible";
}

async function openAiChatCompletions(
  config: AiClientConfig,
  system: string,
  user: string,
): Promise<string> {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  const base = config.endpoint.replace(/\/+$/, "");
  const url = base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/chat/completions`;
  const res = await fetchFn(url, {
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

/**
 * Native Anthropic Messages API:
 * POST /v1/messages with x-api-key + anthropic-version.
 */
export async function anthropicMessages(
  config: AiClientConfig,
  system: string,
  user: string,
): Promise<string> {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  let base = config.endpoint.replace(/\/+$/, "");
  if (!base.includes("/v1")) {
    base = `${base}/v1`;
  }
  const url = base.endsWith("/messages") ? base : `${base}/messages`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (json.content ?? [])
    .filter((c) => c.type === "text" || c.text)
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  return text;
}
