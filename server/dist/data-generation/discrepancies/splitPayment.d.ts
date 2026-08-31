import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Splits ledger amount across two bank transactions that sum EXACTLY to the
 * ledger amount in integer paise:
 *   part1Paise = floor(total * pct / 100)
 *   part2Paise = total - part1Paise
 * so part1 + part2 === total with zero leftover by construction (the remainder
 * lands entirely in part2 — never a float round that loses a paise).
 *
 * pct is deterministic from indexSeed in [30, 50] inclusive
 * (30 + abs(indexSeed) % 21) — not always 50/50.
 *
 * Both bank rows link to the same ledgerEntryId. Ledger.linkedBankTxnId is
 * null because there is no single bank counterpart; linkedSettlementId is
 * null because this taxonomy type has no settlement row.
 */
export declare function generateSplitPayment(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
