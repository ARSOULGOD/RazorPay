// True orphan: a record in EXACTLY ONE source table, nothing in the other two.
// Taxonomy id: trueOrphan.
//
// IMPORTANT: two of bankRows / ledgerRows / settlementRows are intentionally
// empty on every call. Empty arrays here are NOT a bug — they ARE the orphan
// semantics (design-doc: exists in exactly one source, matches nothing).

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

/**
 * Which table gets the orphan is deterministic: indexSeed % 3
 *   0 → BankTransaction only
 *   1 → LedgerEntry only
 *   2 → SettlementRecord only
 *
 * All link fields on the single produced row are null — there is genuinely
 * nothing to link to (taxonomy comment: affectedTables means "any one of
 * these", never all three at once).
 */
export function generateTrueOrphan(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const amount = event.amount;
  amountToPaise(amount);
  const date = event.baseDate;
  const tableSelector = Math.abs(indexSeed) % 3;

  const empty: DiscrepancyGenerationResult = {
    bankRows: [],
    ledgerRows: [],
    settlementRows: [],
    discrepancyType: TAXONOMY_IDS.trueOrphan,
  };

  if (tableSelector === 0) {
    return {
      ...empty,
      bankRows: [
        {
          bankTxnId: ids.bankTxnId,
          amount,
          currency: event.currency,
          transactionDate: date,
          description: `${event.description} (orphan bank)`,
          linkedLedgerId: null,
        },
      ],
    };
  }

  if (tableSelector === 1) {
    return {
      ...empty,
      ledgerRows: [
        {
          ledgerEntryId: ids.ledgerEntryId,
          invoiceOrOrderId: ids.invoiceOrOrderId,
          amount,
          currency: event.currency,
          entryDate: date,
          entryType: "PAYMENT",
          linkedBankTxnId: null,
          linkedSettlementId: null,
        },
      ],
    };
  }

  // tableSelector === 2 — SettlementRecord only
  return {
    ...empty,
    settlementRows: [
      {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: amount,
        fee: paiseToAmount(0),
        tax: paiseToAmount(0),
        netAmount: amount,
        settlementDate: date,
        linkedLedgerId: null,
      },
    ],
  };
}
