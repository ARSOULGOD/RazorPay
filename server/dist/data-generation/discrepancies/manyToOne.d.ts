import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
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
export declare function generateManyToOne(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
