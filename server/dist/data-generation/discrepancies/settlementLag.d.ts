import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
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
export declare function generateSettlementLag(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
