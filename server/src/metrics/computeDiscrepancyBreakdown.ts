// Aggregates reconciliation outcomes by discrepancyType taxonomy category.

import type { DiscrepancyBreakdownRow } from "../types/reconciliation.types";

export interface DiscrepancyRow {
  discrepancyType: string | null;
  status: string;
}

/**
 * Counts rows grouped by discrepancyType (null → "unclassified").
 * Includes all statuses — callers can filter if they only want MATCHED.
 */
export function computeDiscrepancyBreakdown(
  rows: DiscrepancyRow[],
): DiscrepancyBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.discrepancyType?.trim() || "unclassified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([discrepancyType, count]) => ({ discrepancyType, count }))
    .sort((a, b) => b.count - a.count || a.discrepancyType.localeCompare(b.discrepancyType));
}
