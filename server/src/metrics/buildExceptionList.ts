// Builds the honest exception list with verbatim reasoning for unresolved records.

import type { ExceptionListItem } from "../types/reconciliation.types";

export interface ExceptionSourceRow {
  id: string;
  bankTxnId: string | null;
  ledgerEntryId: string | null;
  settlementId: string | null;
  discrepancyType: string | null;
  confidence: number;
  reasoning: string;
  resolvedByLLM: boolean;
  createdAt: Date | string;
  status: string;
}

/** Every EXCEPTION row with reasoning surfaced verbatim (not summarized). */
export function buildExceptionList(rows: ExceptionSourceRow[]): ExceptionListItem[] {
  return rows
    .filter((r) => r.status === "EXCEPTION")
    .map((r) => ({
      id: r.id,
      bankTxnId: r.bankTxnId,
      ledgerEntryId: r.ledgerEntryId,
      settlementId: r.settlementId,
      discrepancyType: r.discrepancyType,
      confidence: r.confidence,
      reasoning: r.reasoning,
      resolvedByLLM: r.resolvedByLLM,
      createdAt:
        typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString(),
    }));
}
