import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Clean 3-way match from a single TrueEvent.
 * Settlement fee/tax are zero here so net === gross === ledger/bank amount —
 * fee deduction is a separate taxonomy type.
 */
export declare function generateExactMatch(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
