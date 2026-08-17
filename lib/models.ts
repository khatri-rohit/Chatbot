import { createOllama } from "ollama-ai-provider-v2";

export const OLLAMA_BASE = process.env.OLLAMA_BASE_URL;

type OllamaClient = ReturnType<typeof createOllama>;

let ollamaSingleton: OllamaClient | null = null;

export function initializeOllama(): OllamaClient {
  if (ollamaSingleton) {
    return ollamaSingleton;
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is missing or empty. Set it before running generation.",
    );
  }

  ollamaSingleton = createOllama({
    baseURL: OLLAMA_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return ollamaSingleton;
}
