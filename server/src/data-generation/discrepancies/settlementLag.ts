// Settlement lag: same amounts across all 3 sources, but bank (and settlement)
// dates sit at T+2 vs ledger T+0. Taxonomy id: settlementLag.

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  addDaysIso,
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

/**
 * Ledger books the event on event.baseDate (T+0).
 * Bank transactionDate = baseDate + 2 days (T+2), per design-doc.
 *
 * Settlement date: same calendar instant as the bank credit.
 * Reasoning: in a typical PG cycle the settlement report day and the bank
 * credit for that settlement often align; putting settlement on bank day
 * isolates the lag as ledger-vs-(bank/settlement), not a three-way date spread.
 * Fee/tax left at 0 so this type only encodes lag, not fee deduction.
 */
export function generateSettlementLag(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const amount = event.amount;
  amountToPaise(amount);

  const ledgerDate = event.baseDate;
  const bankDate = addDaysIso(event.baseDate, 2);
  const settlementDate = bankDate;

  return {
    bankRows: [
      {
        bankTxnId: ids.bankTxnId,
        amount,
        currency: event.currency,
        transactionDate: bankDate,
        description: event.description,
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    ledgerRows: [
      {
        ledgerEntryId: ids.ledgerEntryId,
        invoiceOrOrderId: ids.invoiceOrOrderId,
        amount,
        currency: event.currency,
        entryDate: ledgerDate,
        entryType: "PAYMENT",
        linkedBankTxnId: ids.bankTxnId,
        linkedSettlementId: ids.settlementId,
      },
    ],
    settlementRows: [
      {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: amount,
        fee: paiseToAmount(0),
        tax: paiseToAmount(0),
        netAmount: amount,
        settlementDate,
        linkedLedgerId: ids.ledgerEntryId,
      },
    ],
    discrepancyType: TAXONOMY_IDS.settlementLag,
  };
}
