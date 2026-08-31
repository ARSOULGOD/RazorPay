"use strict";
// True orphan: a record in EXACTLY ONE source table, nothing in the other two.
// Taxonomy id: trueOrphan.
//
// IMPORTANT: two of bankRows / ledgerRows / settlementRows are intentionally
// empty on every call. Empty arrays here are NOT a bug — they ARE the orphan
// semantics (design-doc: exists in exactly one source, matches nothing).
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTrueOrphan = generateTrueOrphan;
const types_1 = require("./types");
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
function generateTrueOrphan(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const amount = event.amount;
    (0, types_1.amountToPaise)(amount);
    const date = event.baseDate;
    const tableSelector = Math.abs(indexSeed) % 3;
    const empty = {
        bankRows: [],
        ledgerRows: [],
        settlementRows: [],
        discrepancyType: "trueOrphan",
    };
    if (tableSelector === 0) {
        return {
            ...empty,
            bankRows: [
                {
                    bankTxnId: ids.bankTxnId,
                    amount,
                    currency: event.currency,
                    transactionDate: date,
                    description: `${event.description} (orphan bank)`,
                    linkedLedgerId: null,
                },
            ],
        };
    }
    if (tableSelector === 1) {
        return {
            ...empty,
            ledgerRows: [
                {
                    ledgerEntryId: ids.ledgerEntryId,
                    invoiceOrOrderId: ids.invoiceOrOrderId,
                    amount,
                    currency: event.currency,
                    entryDate: date,
                    entryType: "PAYMENT",
                    linkedBankTxnId: null,
                    linkedSettlementId: null,
                },
            ],
        };
    }
    // tableSelector === 2 — SettlementRecord only
    return {
        ...empty,
        settlementRows: [
            {
                settlementId: ids.settlementId,
                utr: ids.utr,
                grossAmount: amount,
                fee: (0, types_1.paiseToAmount)(0),
                tax: (0, types_1.paiseToAmount)(0),
                netAmount: amount,
                settlementDate: date,
                linkedLedgerId: null,
            },
        ],
    };
}
//# sourceMappingURL=trueOrphan.js.map