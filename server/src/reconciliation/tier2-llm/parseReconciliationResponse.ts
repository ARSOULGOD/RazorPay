// Parses and validates Tier-2 structured JSON into ReconciliationDecision fields.

import type {
  ReconciliationCandidate,
  ReconciliationDecision,
  ReconciliationStatusValue,
} from "../../types/reconciliation.types";

const STATUSES = new Set<ReconciliationStatusValue>([
  "MATCHED",
  "PARTIAL_MATCH",
  "EXCEPTION",
]);

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Best-effort repair for near-valid model JSON (trailing commas, extra braces). */
export function repairJsonText(raw: string): string {
  let text = stripFences(raw);
  // Prefer the outermost object if surrounded by junk.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1);
  }
  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, "$1");
  return text;
}

export function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const candidates = [stripFences(raw), repairJsonText(raw)];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Groq json_validate_failed errors often embed the near-valid payload in
 * `failed_generation`. Extract it from the error message/body string.
 */
export function extractFailedGeneration(errorMessage: string): string | null {
  const patterns = [
    /"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/,
  ];
  for (const re of patterns) {
    const m = re.exec(errorMessage);
    if (!m) continue;
    try {
      // The capture is a JSON string literal body (escaped). Re-quote and parse.
      return JSON.parse(`"${m[1]}"`);
    } catch {
      // Fallback: unescape common sequences manually
      return m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return null;
}

export function decisionFromParsedObject(
  obj: Record<string, unknown>,
  candidate: ReconciliationCandidate,
  rawFallback: string,
): ReconciliationDecision {
  const status = obj.status as ReconciliationStatusValue;
  const confidence = Number(obj.confidence);
  const reasoning =
    typeof obj.reasoning === "string" && obj.reasoning.trim()
      ? obj.reasoning.trim()
      : "Tier-2 returned no reasoning string.";
  const discrepancyType =
    obj.discrepancyType === null || obj.discrepancyType === undefined
      ? null
      : String(obj.discrepancyType);

  if (!STATUSES.has(status) || !Number.isFinite(confidence)) {
    return {
      status: "EXCEPTION",
      confidence: 0,
      discrepancyType: null,
      reasoning: `Tier-2 validation failure: invalid status/confidence. Raw (truncated): ${rawFallback.slice(0, 400)}`,
      bankTxnId: candidate.bank?.bankTxnId ?? null,
      ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
      settlementId: candidate.settlement?.settlementId ?? null,
      resolvedByLLM: true,
    };
  }

  return {
    status,
    confidence: Math.min(1, Math.max(0, confidence)),
    discrepancyType,
    reasoning,
    bankTxnId: candidate.bank?.bankTxnId ?? null,
    ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
    settlementId: candidate.settlement?.settlementId ?? null,
    resolvedByLLM: true,
  };
}

export function parseReconciliationResponse(
  rawText: string,
  candidate: ReconciliationCandidate,
): ReconciliationDecision {
  const obj = tryParseJsonObject(rawText);
  if (!obj) {
    return {
      status: "EXCEPTION",
      confidence: 0,
      discrepancyType: null,
      reasoning: `Tier-2 parse failure: model did not return valid JSON. Raw (truncated): ${rawText.slice(0, 400)}`,
      bankTxnId: candidate.bank?.bankTxnId ?? null,
      ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
      settlementId: candidate.settlement?.settlementId ?? null,
      resolvedByLLM: true,
    };
  }
  return decisionFromParsedObject(obj, candidate, rawText);
}

/** True when Groq rejected JSON mode output but may still have recoverable text. */
export function isJsonValidateFailedError(message: string): boolean {
  return (
    /json_validate_failed/i.test(message) ||
    /Failed to generate JSON/i.test(message)
  );
}
