// Computes overall match/partial/exception rates from ReconciliationResult rows.

import type { MatchRateSummary } from "../types/reconciliation.types";

export interface StatusRow {
  status: string;
}

export function computeMatchRate(rows: StatusRow[]): MatchRateSummary {
  const total = rows.length;
  const matched = rows.filter((r) => r.status === "MATCHED").length;
  const partial = rows.filter((r) => r.status === "PARTIAL_MATCH").length;
  const exception = rows.filter((r) => r.status === "EXCEPTION").length;
  const matchRate = total === 0 ? 0 : (matched + partial) / total;

  return {
    total,
    matched,
    partial,
    exception,
    matchRate,
    plainStatement: `${matched}/${total} fully matched, ${partial} partial, ${exception} genuine exceptions (match+partial rate=${(matchRate * 100).toFixed(1)}%)`,
  };
}
