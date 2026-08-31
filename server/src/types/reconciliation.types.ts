// Shared TypeScript types for reconciliation decisions, metrics, and API payloads.

import type { DiscrepancyTaxonomyId } from "../data-generation/taxonomy";

/** Prisma / API status enum values. */
export type ReconciliationStatusValue =
  | "MATCHED"
  | "PARTIAL_MATCH"
  | "EXCEPTION";

/**
 * Structured decision every Tier 1 / Tier 2 path must produce
 * (cursorrules + design-doc Section 4).
 */
export interface ReconciliationDecision {
  status: ReconciliationStatusValue;
  confidence: number; // 0–1
  discrepancyType: DiscrepancyTaxonomyId | string | null;
  reasoning: string;
  bankTxnId: string | null;
  ledgerEntryId: string | null;
  settlementId: string | null;
  resolvedByLLM: boolean;
}

/** Candidate triple (or partial) passed to Tier 2 when Tier 1 cannot resolve. */
export interface ReconciliationCandidate {
  bank: BankTxnView | null;
  ledger: LedgerView | null;
  settlement: SettlementView | null;
  /** Why Tier 1 deferred this case (for the prompt). */
  deferralReason: string;
}

export interface BankTxnView {
  bankTxnId: string;
  amount: string;
  currency: string;
  transactionDate: string; // ISO
  description: string;
  linkedLedgerId: string | null;
}

export interface LedgerView {
  ledgerEntryId: string;
  invoiceOrOrderId: string | null;
  amount: string;
  currency: string;
  entryDate: string;
  entryType: string;
  linkedBankTxnId: string | null;
  linkedSettlementId: string | null;
}

export interface SettlementView {
  settlementId: string;
  utr: string | null;
  grossAmount: string;
  fee: string;
  tax: string;
  netAmount: string;
  settlementDate: string;
  linkedLedgerId: string | null;
}

export interface MatchRateSummary {
  total: number;
  matched: number;
  partial: number;
  exception: number;
  /** (matched + partial) / total, or 0 if total === 0 */
  matchRate: number;
  plainStatement: string;
}

export interface TierSplitSummary {
  tier1: number;
  tier2: number;
  total: number;
}

export interface DiscrepancyBreakdownRow {
  discrepancyType: string;
  count: number;
}

export interface ExceptionListItem {
  id: string;
  bankTxnId: string | null;
  ledgerEntryId: string | null;
  settlementId: string | null;
  discrepancyType: string | null;
  confidence: number;
  reasoning: string;
  resolvedByLLM: boolean;
  createdAt: string;
}

export interface GroundTruthValidationSummary {
  eventsChecked: number;
  exactMatchEventsFullyMatched: number;
  orphanEventsMarkedException: number;
  orphanEventsNotException: number;
  notes: string[];
}
