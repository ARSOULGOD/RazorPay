// Groq primary Tier-2 client (Gemini is failover only — see router.ts).

import Groq from "groq-sdk";

let cached: Groq | null = null;

export function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim();
  return key ? key : null;
}

export function getGroqClient(): Groq {
  const key = getGroqApiKey();
  if (!key) {
    throw new Error(
      "GROQ_API_KEY is missing in server/.env — Gemini quota fallback unavailable.",
    );
  }
  if (!cached) {
    cached = new Groq({ apiKey: key });
  }
  return cached;
}

/**
 * Default Groq chat model. Override via GROQ_MODEL.
 * Account-available free chat models vary; `openai/gpt-oss-20b` was verified
 * on this project's Groq key (llama-3.1-8b-instant returned model_not_found).
 */
export function getGroqModelName(): string {
  return process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
}

/**
 * Errors that should trigger provider failover (and limited retries).
 * Includes free-tier quota/429, transient capacity (503), and bad/retired
 * model IDs (404 model_not_found) so the other provider can still run.
 */
export function isQuotaOrRateLimitError(message: string): boolean {
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("404") ||
    /Too Many Requests/i.test(message) ||
    /Service Unavailable/i.test(message) ||
    /high demand/i.test(message) ||
    /try again later/i.test(message) ||
    /quota/i.test(message) ||
    /rate.?limit/i.test(message) ||
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /UNAVAILABLE/i.test(message) ||
    /overloaded/i.test(message) ||
    /model_not_found/i.test(message) ||
    /does not exist or you do not have access/i.test(message) ||
    /json_validate_failed/i.test(message) ||
    /Failed to generate JSON/i.test(message)
  );
}

/** Prefer shorter waits for 503 capacity spikes; honor RetryInfo for 429. */
export function failoverRetryDelayMs(message: string): number {
  if (message.includes("503") || /high demand|Service Unavailable/i.test(message)) {
    return 5_000;
  }
  return parseRetryDelayMsFromMessage(message);
}

function parseRetryDelayMsFromMessage(message: string): number {
  const match = /retry in (\d+(?:\.\d+)?)s/i.exec(message);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 500;
  }
  return 35_000;
}
