import type { TrueEvent } from "../generateTrueEvents";
import { type DiscrepancyGenerationResult } from "./types";
/**
 * Which table gets the orphan is deterministic: indexSeed % 3
 *   0 → BankTransaction only
 *   1 → LedgerEntry only
 *   2 → SettlementRecord only
 *
 * All link fields on the single produced row are null — there is genuinely
 * nothing to link to (taxonomy comment: affectedTables means "any one of
 * these", never all three at once).
 */
export declare function generateTrueOrphan(event: TrueEvent, indexSeed: number): DiscrepancyGenerationResult;
