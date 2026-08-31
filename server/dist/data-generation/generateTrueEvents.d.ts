export interface TrueEvent {
    /** Stable, deterministic id: evt_0001 … evt_00NN (index-based, not UUID —
     *  UUIDs would break seed reproducibility). */
    eventId: string;
    /** INR amount as a 2-decimal string, e.g. "4847.50". */
    amount: string;
    currency: string;
    /** When the transaction truly occurred (ISO-8601), before any lag injection. */
    baseDate: string;
    description: string;
    merchantOrPayer: string;
}
/**
 * Generate `count` clean true events using `seed` for full reproducibility.
 * Does not assign discrepancy types — callers (seedDatabase.ts) own that.
 */
export declare function generateTrueEvents(count: number, seed: number): TrueEvent[];
