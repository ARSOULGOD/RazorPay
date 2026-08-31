import type { DiscrepancyTaxonomyId } from "../taxonomy";
export interface GeneratedBankRow {
    bankTxnId: string;
    amount: string;
    currency: string;
    transactionDate: string;
    description: string;
    linkedLedgerId: string | null;
}
export interface GeneratedLedgerRow {
    ledgerEntryId: string;
    invoiceOrOrderId: string | null;
    amount: string;
    currency: string;
    entryDate: string;
    entryType: "PAYMENT" | "REFUND" | "PARTIAL_PAYMENT" | "PAYOUT";
    linkedBankTxnId: string | null;
    linkedSettlementId: string | null;
}
export interface GeneratedSettlementRow {
    settlementId: string;
    utr: string | null;
    grossAmount: string;
    fee: string;
    tax: string;
    netAmount: string;
    settlementDate: string;
    linkedLedgerId: string | null;
}
export interface DiscrepancyGenerationResult {
    bankRows: GeneratedBankRow[];
    ledgerRows: GeneratedLedgerRow[];
    settlementRows: GeneratedSettlementRow[];
    /** Which taxonomy id this result was generated as — always set by the
     *  generator itself, never left for the caller to infer. */
    discrepancyType: DiscrepancyTaxonomyId;
}
/** Deterministic business IDs from (eventId, indexSeed) — no Math.random / UUID. */
export declare function deterministicIds(eventId: string, indexSeed: number): {
    bankTxnId: string;
    ledgerEntryId: string;
    settlementId: string;
    utr: string;
    invoiceOrOrderId: string;
};
/** Parse "4847.50" → paise integer. Throws on malformed input. */
export declare function amountToPaise(amount: string): number;
export declare function paiseToAmount(paise: number): string;
export declare function addDaysIso(iso: string, days: number): string;
