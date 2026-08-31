// Reports how many results were resolved by Tier-1 vs Tier-2 (resolvedByLLM).

import type { TierSplitSummary } from "../types/reconciliation.types";

export interface TierRow {
  resolvedByLLM: boolean;
}

export function computeTierSplit(rows: TierRow[]): TierSplitSummary {
  const tier2 = rows.filter((r) => r.resolvedByLLM).length;
  const tier1 = rows.length - tier2;
  return { tier1, tier2, total: rows.length };
}
