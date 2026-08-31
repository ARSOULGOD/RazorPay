// Builds the structured Gemini prompt for ambiguous multi-source reconciliation cases.

import type { ReconciliationCandidate } from "../../types/reconciliation.types";
import { DISCREPANCY_TAXONOMY } from "../../data-generation/taxonomy";

export function buildReconciliationPrompt(
  candidate: ReconciliationCandidate,
): string {
  const taxonomyLines = DISCREPANCY_TAXONOMY.map(
    (t) => `- ${t.id}: ${t.description}`,
  ).join("\n");

  return `You are a finance-operations reconciliation agent. You must decide whether the candidate records below refer to the same underlying financial event.

You MUST respond with a single JSON object only (no markdown fences), exactly matching this shape:
{
  "status": "MATCHED" | "PARTIAL_MATCH" | "EXCEPTION",
  "confidence": number between 0 and 1,
  "discrepancyType": string | null,
  "reasoning": string
}

Rules:
- Prefer EXCEPTION with a clear reasoning string when you cannot confidently resolve the case. You are explicitly permitted — and expected — to return EXCEPTION rather than force a match.
- Do not invent IDs, amounts, or dates that are not present in the candidate payload.
- discrepancyType, when set, should be one of the taxonomy ids listed below when applicable.
- PARTIAL_MATCH means related but not fully reconciled (e.g. fee/net vs gross, lag, split remainder).
- MATCHED means you believe the records describe the same event despite discrepancies Tier-1 could not accept.

Known discrepancy taxonomy:
${taxonomyLines}

Tier-1 deferral reason:
${candidate.deferralReason}

Candidate bank record (JSON or null):
${JSON.stringify(candidate.bank, null, 2)}

Candidate ledger record (JSON or null):
${JSON.stringify(candidate.ledger, null, 2)}

Candidate settlement record (JSON or null):
${JSON.stringify(candidate.settlement, null, 2)}
`;
}
