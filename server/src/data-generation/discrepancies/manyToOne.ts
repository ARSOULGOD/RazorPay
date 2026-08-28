// Many-to-one (batched payout): 2 ledger ↔ 1 bank + 1 settlement (ledger:bank = 2:1).
// Taxonomy id: manyToOne. taxonomy.ts affectedTables includes SettlementRecord.

import type { TrueEvent } from "../generateTrueEvents";
import { TAXONOMY_IDS } from "../taxonomy";
import {
  amountToPaise,
  deterministicIds,
  paiseToAmount,
  type DiscrepancyGenerationResult,
} from "./types";

/**
 * Signature choice: KEEP (event: TrueEvent, indexSeed: number) — option (b).
 *
 * Reasoning: every other discrepancy generator consumes exactly one TrueEvent.
 * Changing the signature to accept a second event (option a) would force
 * seedDatabase.ts to special-case pairing for this type alone. Instead we
 * derive TWO ledger amounts from the single event by an exact paise split of
 * event.amount (same invariant as splitPayment, inverted cardinality):
 *   ledgerAPaise = floor(total * pct / 100)
 *   ledgerBPaise = total - ledgerAPaise
 *   bank + settlement.gross = total (= A + B exactly)
 *
 * pct deterministic: 30 + abs(indexSeed) % 21 → [30, 50].
 * seedDatabase.ts therefore still calls this like every other generator —
 * no two-event pairing required.
 *
 * Bank.linkedLedgerId and settlement.linkedLedgerId point at ledger A only
 * (the "primary" of the batch); both ledgers link to the shared bank and
 * settlement IDs. Fee/tax = 0 so this type isolates batching, not feeDeduction.
 */
export function generateManyToOne(
  event: TrueEvent,
  indexSeed: number,
): DiscrepancyGenerationResult {
  const ids = deterministicIds(event.eventId, indexSeed);
  const totalPaise = amountToPaise(event.amount);
  const pct = 30 + (Math.abs(indexSeed) % 21); // 30..50
  const ledgerAPaise = Math.floor((totalPaise * pct) / 100);
  const ledgerBPaise = totalPaise - ledgerAPaise; // exact complement

  if (ledgerAPaise <= 0 || ledgerBPaise <= 0) {
    throw new Error(
      `generateManyToOne: non-positive ledger split for ${event.eventId} ` +
        `(total=${event.amount}, pct=${pct})`,
    );
  }
  if (ledgerAPaise + ledgerBPaise !== totalPaise) {
    throw new Error(
      `generateManyToOne: paise sum invariant broken for ${event.eventId}`,
    );
  }

  const totalAmount = paiseToAmount(totalPaise);
  const ledgerAAmount = paiseToAmount(ledgerAPaise);
  const ledgerBAmount = paiseToAmount(ledgerBPaise);
  const date = event.baseDate;

  const ledgerEntryIdA = `${ids.ledgerEntryId}_a`;
  const ledgerEntryIdB = `${ids.ledgerEntryId}_b`;
  const invoiceA = `${ids.invoiceOrOrderId}_a`;
  const invoiceB = `${ids.invoiceOrOrderId}_b`;

  return {
    bankRows: [
      {
        bankTxnId: ids.bankTxnId,
        amount: totalAmount,
        currency: event.currency,
        transactionDate: date,
        description: `${event.description} (batched payout)`,
        linkedLedgerId: ledgerEntryIdA,
      },
    ],
    ledgerRows: [
      {
        ledgerEntryId: ledgerEntryIdA,
        invoiceOrOrderId: invoiceA,
        amount: ledgerAAmount,
        currency: event.currency,
        entryDate: date,
        entryType: "PAYOUT",
        linkedBankTxnId: ids.bankTxnId,
        linkedSettlementId: ids.settlementId,
      },
      {
        ledgerEntryId: ledgerEntryIdB,
        invoiceOrOrderId: invoiceB,
        amount: ledgerBAmount,
        currency: event.currency,
        entryDate: date,
        entryType: "PAYOUT",
        linkedBankTxnId: ids.bankTxnId,
        linkedSettlementId: ids.settlementId,
      },
    ],
    settlementRows: [
      {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: totalAmount,
        fee: paiseToAmount(0),
        tax: paiseToAmount(0),
        netAmount: totalAmount,
        settlementDate: date,
        linkedLedgerId: ledgerEntryIdA,
      },
    ],
    discrepancyType: TAXONOMY_IDS.manyToOne,
  };
}
