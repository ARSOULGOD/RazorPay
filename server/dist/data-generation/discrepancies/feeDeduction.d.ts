import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Illustrative fee model — NOT claimed as Razorpay's live schedule.
 * Razorpay fees vary by payment method, volume tier, and merchant plan; I am
 * not certain of a single current public rate, so this simulation uses a
 * clearly labeled stand-in: 2% of gross + ₹2 fixed fee (200 paise).
 *
 * Tax: 18% of fee labeled as GST for the simulation. I am not certain that
 * 18% GST always applies specifically to payment-processing fees for every
 * Indian merchant/context — treat this as a demo convention, not tax advice.
 *
 * All money math is integer paise (floor for % components), never float.
 *
 * Dating: ledger = baseDate (books the sale); settlement = T+1; bank = same
 * day as settlement and amount = net only (what actually lands).
 */
export declare function generateFeeDeduction(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
