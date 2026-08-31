// Shared Gemini client for Tier-2 ambiguous reconciliation (decision-doc D4 REVISED).

import { GoogleGenerativeAI } from "@google/generative-ai";

let cached: GoogleGenerativeAI | null = null;

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export function getGeminiClient(): GoogleGenerativeAI {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing in server/.env — Tier 2 cannot call the LLM.",
    );
  }
  if (!cached) {
    cached = new GoogleGenerativeAI(key);
  }
  return cached;
}

/**
 * Default model for structured reconciliation JSON. Override via GEMINI_MODEL.
 * gemini-2.0-flash / gemini-2.5-flash: 404 for this account/new users.
 * gemini-3.6-flash: works but free tier ~5 RPM / 20 RPD (too tight for batch).
 * gemini-flash-latest: verified working on this key — preferred default.
 */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse "Please retry in 33.06s" (or RetryInfo) from a 429 message. */
export function parseRetryDelayMs(message: string): number {
  const match = /retry in (\d+(?:\.\d+)?)s/i.exec(message);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 500;
  }
  return 35_000;
}
