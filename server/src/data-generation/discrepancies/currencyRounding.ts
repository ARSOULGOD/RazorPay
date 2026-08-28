// Currency rounding: same underlying event across all 3 sources, but with a
// 1–3 paise amount delta on bank and settlement vs exact ledger.
// Taxonomy id: currencyRounding. One row per source table.

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

/**
 * Rounding delta is deterministic from indexSeed:
 *   magnitude = 1 + (abs(indexSeed) % 3)  →  1, 2, or 3 paise
 *   sign      = indexSeed even → +delta, odd → −delta
 *
 * Which fields carry the delta (explicit for Tier 1 exact-matcher):
 *   - ledger.amount          → EXACT event.amount (no delta)
 *   - bank.amount            → event.amount ± deltaPaise
 *   - settlement.grossAmount → event.amount ± deltaPaise (same delta as bank)
 *   - settlement.netAmount   → same as gross (fee/tax = 0; delta is not a fee)
 *   - settlement.fee / tax   → "0.00" (no feeDeduction mixed in)
 *   - all dates              → identical (event.baseDate); this type isolates
 *     rounding only, so an amount mismatch of 1–3 paise must fail Tier 1
 *     exact amount+timestamp matching and route to Tier 2.
 */
export function generateCurrencyRounding(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const exactPaise = amountToPaise(event.amount);
  const deltaPaise = 1 + (Math.abs(indexSeed) % 3); // 1..3
  const signedDelta = indexSeed % 2 === 0 ? deltaPaise : -deltaPaise;
  const roundedPaise = exactPaise + signedDelta;

  if (roundedPaise <= 0) {
    throw new Error(
      `generateCurrencyRounding: non-positive rounded amount for ${event.eventId} ` +
        `(exact=${event.amount}, delta=${signedDelta})`,
    );
  }

  const exactAmount = paiseToAmount(exactPaise);
  const roundedAmount = paiseToAmount(roundedPaise);
  const date = event.baseDate;

  return {
    bankRows: [
      {
        bankTxnId: ids.bankTxnId,
        amount: roundedAmount,
        currency: event.currency,
        transactionDate: date,
        description: event.description,
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    ledgerRows: [
      {
        ledgerEntryId: ids.ledgerEntryId,
        invoiceOrOrderId: ids.invoiceOrOrderId,
        amount: exactAmount,
        currency: event.currency,
        entryDate: date,
        entryType: "PAYMENT",
        linkedBankTxnId: ids.bankTxnId,
        linkedSettlementId: ids.settlementId,
      },
    ],
    settlementRows: [
      {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: roundedAmount,
        fee: paiseToAmount(0),
        tax: paiseToAmount(0),
        netAmount: roundedAmount,
        settlementDate: date,
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    discrepancyType: TAXONOMY_IDS.currencyRounding,
  };
}
