import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
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
export declare function generateCurrencyRounding(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
