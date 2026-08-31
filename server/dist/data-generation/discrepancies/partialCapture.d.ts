import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Capture ratio is deterministic from indexSeed: 40–90% inclusive
 * (40 + (abs(indexSeed) % 51)), never Math.random().
 *
 * entryType = PARTIAL_PAYMENT (not PAYMENT): Prisma EntryType is
 * PAYMENT | REFUND | PARTIAL_PAYMENT | PAYOUT. PAYMENT would imply a
 * full capture equal to the authorized amount; PARTIAL_PAYMENT is the
 * enum value that explicitly signals "authorized more than was settled,"
 * which is exactly this taxonomy case. REFUND/PAYOUT do not fit.
 *
 * No date lag — amount mismatch alone is the discrepancy signal.
 * Settlement fee/tax left at 0 so this type does not also encode feeDeduction.
 */
export declare function generatePartialCapture(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
