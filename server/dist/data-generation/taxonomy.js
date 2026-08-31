"use strict";
// Canonical discrepancy taxonomy labels and metadata used across generation and metrics.
//
// Shape choice: a const array (not an id-keyed object). Discrepancy generators need to
// walk every taxonomy entry once when seeding — iteration is the hot path; keyed lookup
// is rare and can use DISCREPANCY_TAXONOMY_BY_ID when needed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCREPANCY_TAXONOMY_BY_ID = exports.DISCREPANCY_TAXONOMY = void 0;
exports.DISCREPANCY_TAXONOMY = [
    {
        id: "exactMatch",
        label: "Exact match",
        description: "Baseline — same ID/amount/date across all 3 sources.",
        affectedTables: ["BankTransaction", "LedgerEntry", "SettlementRecord"],
        isOrphan: false,
    },
    {
        id: "settlementLag",
        label: "Settlement lag",
        description: "Bank shows T+2, ledger shows T+0 (date mismatch between bank and ledger).",
        affectedTables: ["BankTransaction", "LedgerEntry"],
        isOrphan: false,
    },
    {
        id: "feeDeduction",
        label: "Fee deduction",
        description: "Settlement net = gross − fee − tax; ledger shows gross (amount mismatch).",
        affectedTables: ["SettlementRecord", "LedgerEntry"],
        isOrphan: false,
    },
    {
        id: "partialCapture",
        label: "Partial capture",
        description: "Only part of an amount is captured or refunded (ledger entryType / amount mismatch).",
        affectedTables: ["LedgerEntry"],
        isOrphan: false,
    },
    {
        id: "splitPayment",
        label: "Split payment",
        description: "One ledger entry corresponds to two bank transactions (ledger:bank = 1:2).",
        affectedTables: ["LedgerEntry", "BankTransaction"],
        isOrphan: false,
    },
    {
        id: "manyToOne",
        label: "Many-to-one",
        description: "Two or more ledger entries correspond to one bank transaction (batched payout).",
        affectedTables: ["LedgerEntry", "BankTransaction", "SettlementRecord"],
        isOrphan: false,
    },
    {
        id: "duplicateEntry",
        label: "Duplicate entry",
        description: "Same transaction logged twice in one source (data-entry-error simulation).",
        affectedTables: ["BankTransaction", "LedgerEntry", "SettlementRecord"],
        isOrphan: false,
    },
    {
        id: "currencyRounding",
        label: "Currency rounding",
        description: "Small paise-level rounding difference in amount across sources.",
        affectedTables: ["BankTransaction", "LedgerEntry", "SettlementRecord"],
        isOrphan: false,
    },
    // affectedTables here means "any one of these", not "all three at once" —
    // each generated orphan instance must be written to exactly one table,
    // chosen per-instance by the generator, never all three.
    {
        id: "trueOrphan",
        label: "True orphan",
        description: "Exists in exactly one source and matches nothing in the others.",
        affectedTables: ["BankTransaction", "LedgerEntry", "SettlementRecord"],
        isOrphan: true,
    },
];
/** Convenience lookup: taxonomy id → entry. Prefer iterating DISCREPANCY_TAXONOMY for seeding. */
exports.DISCREPANCY_TAXONOMY_BY_ID = Object.fromEntries(exports.DISCREPANCY_TAXONOMY.map((entry) => [entry.id, entry]));
//# sourceMappingURL=taxonomy.js.map