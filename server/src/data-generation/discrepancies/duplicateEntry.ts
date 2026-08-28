// Duplicate entry: same underlying event logged twice in the ledger
// (data-entry / double-submit). Taxonomy id: duplicateEntry.
// Bank and settlement still have one row each; only ledger cardinality is 2.

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

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
export function generateDuplicateEntry(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const amount = event.amount;
  amountToPaise(amount);
  const date = event.baseDate;

  // Distinct business ID for the duplicate — must not collide with @unique ledgerEntryId.
  const duplicateLedgerEntryId = `${ids.ledgerEntryId}_dup`;

  const originalLedger = {
    ledgerEntryId: ids.ledgerEntryId,
    invoiceOrOrderId: ids.invoiceOrOrderId,
    amount,
    currency: event.currency,
    entryDate: date,
    entryType: "PAYMENT" as const,
    linkedBankTxnId: ids.bankTxnId,
    linkedSettlementId: ids.settlementId,
  };

  const duplicateLedger = {
    ledgerEntryId: duplicateLedgerEntryId,
    invoiceOrOrderId: `${ids.invoiceOrOrderId}_dup`,
    amount,
    currency: event.currency,
    entryDate: date,
    entryType: "PAYMENT" as const,
    linkedBankTxnId: ids.bankTxnId,
    linkedSettlementId: ids.settlementId,
  };

  return {
    bankRows: [
      {
        bankTxnId: ids.bankTxnId,
        amount,
        currency: event.currency,
        transactionDate: date,
        description: event.description,
        // Links to the ORIGINAL ledger only — not the _dup row.
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    ledgerRows: [originalLedger, duplicateLedger],
    settlementRows: [
      {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: amount,
        fee: paiseToAmount(0),
        tax: paiseToAmount(0),
        netAmount: amount,
        settlementDate: date,
        // Links to the ORIGINAL ledger only — not the _dup row.
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    discrepancyType: TAXONOMY_IDS.duplicateEntry,
  };
}
