import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Duplicate is injected on the LEDGER, not bank or settlement.
 * Reasoning: a common real pattern is a merchant system retry / double-submit
 * that posts the same sale twice into internal books, while the payment
 * processor and bank still see a single capture/credit. Duplicating the bank
 * statement line or the PG settlement report is less typical for a pure
 * "data-entry error" story.
 *
 * The duplicate ledger row gets a distinct ledgerEntryId (schema @unique)
 * with a clear `_dup` suffix derived from (eventId, indexSeed). Amount,
 * date, and description match the original ledger row.
 *
 * Cross-links: bank.linkedLedgerId and settlement.linkedLedgerId point at
 * the ORIGINAL (non-_dup) ledgerEntryId only. Reasoning: processor and bank
 * correspond to the one real economic event; the _dup row is the erroneous
 * extra books entry and should remain the unresolved / mismatched side for
 * Tier 2 to reason about. The original ledger row links to bank + settlement
 * as usual; the duplicate's linkedBankTxnId / linkedSettlementId are also set
 * to those same IDs (it "claims" the same links) so the ambiguity is visible.
 */
export declare function generateDuplicateEntry(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
