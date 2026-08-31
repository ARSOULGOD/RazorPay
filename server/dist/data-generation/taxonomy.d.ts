export type SourceTableName = "BankTransaction" | "LedgerEntry" | "SettlementRecord";
export type DiscrepancyTaxonomyId = "exactMatch" | "settlementLag" | "feeDeduction" | "partialCapture" | "splitPayment" | "manyToOne" | "duplicateEntry" | "currencyRounding" | "trueOrphan";
export interface DiscrepancyTaxonomyEntry {
    id: DiscrepancyTaxonomyId;
    label: string;
    description: string;
    affectedTables: SourceTableName[];
    /** true only for trueOrphan — metrics treat orphans separately from resolvable mismatches. */
    isOrphan: boolean;
}
export declare const DISCREPANCY_TAXONOMY: readonly DiscrepancyTaxonomyEntry[];
/** Convenience lookup: taxonomy id → entry. Prefer iterating DISCREPANCY_TAXONOMY for seeding. */
export declare const DISCREPANCY_TAXONOMY_BY_ID: Record<DiscrepancyTaxonomyId, DiscrepancyTaxonomyEntry>;
