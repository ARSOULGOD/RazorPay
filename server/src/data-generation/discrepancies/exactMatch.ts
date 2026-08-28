// Exact-match baseline: one bank + one ledger + one settlement, same amount/dates,
// fully cross-linked. Taxonomy id: exactMatch.

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

/**
 * Clean 3-way match from a single TrueEvent.
 * Settlement fee/tax are zero here so net === gross === ledger/bank amount —
 * fee deduction is a separate taxonomy type.
 */
export function generateExactMatch(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const amount = event.amount;
  // Verify amount is a valid paise string (fails fast if TrueEvent convention breaks).
  amountToPaise(amount);
  const date = event.baseDate;

  const bankRow = {
    bankTxnId: ids.bankTxnId,
    amount,
    currency: event.currency,
    transactionDate: date,
    description: event.description,
    linkedLedgerId: ids.ledgerEntryId,
  };

  const ledgerRow = {
    ledgerEntryId: ids.ledgerEntryId,
    invoiceOrOrderId: ids.invoiceOrOrderId,
    amount,
    currency: event.currency,
    entryDate: date,
    entryType: "PAYMENT" as const,
    linkedBankTxnId: ids.bankTxnId,
    linkedSettlementId: ids.settlementId,
  };

  const settlementRow = {
    settlementId: ids.settlementId,
    utr: ids.utr,
    grossAmount: amount,
    fee: paiseToAmount(0),
    tax: paiseToAmount(0),
    netAmount: amount,
    settlementDate: date,
    linkedLedgerId: ids.ledgerEntryId,
  };

  return {
    bankRows: [bankRow],
    ledgerRows: [ledgerRow],
    settlementRows: [settlementRow],
    discrepancyType: TAXONOMY_IDS.exactMatch,
  };
}
