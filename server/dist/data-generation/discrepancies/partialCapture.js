"use strict";
// Partial capture: ledger books the full authorized amount; bank + settlement
// reflect only the captured portion. Taxonomy id: partialCapture.
// Still one row per source table (no split/many-to-one cardinality change).
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePartialCapture = generatePartialCapture;
const types_1 = require("./types");
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
function generatePartialCapture(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const authorizedPaise = (0, types_1.amountToPaise)(event.amount);
    const capturePercent = 40 + (Math.abs(indexSeed) % 51); // 40..90
    const capturedPaise = Math.floor((authorizedPaise * capturePercent) / 100);
    if (capturedPaise <= 0 || capturedPaise >= authorizedPaise) {
        throw new Error(`generatePartialCapture: invalid capture for ${event.eventId} ` +
            `(authorized=${event.amount}, pct=${capturePercent})`);
    }
    const authorizedAmount = (0, types_1.paiseToAmount)(authorizedPaise);
    const capturedAmount = (0, types_1.paiseToAmount)(capturedPaise);
    const date = event.baseDate;
    return {
        bankRows: [
            {
                bankTxnId: ids.bankTxnId,
                amount: capturedAmount,
                currency: event.currency,
                transactionDate: date,
                description: event.description,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        ledgerRows: [
            {
                ledgerEntryId: ids.ledgerEntryId,
                invoiceOrOrderId: ids.invoiceOrOrderId,
                amount: authorizedAmount,
                currency: event.currency,
                entryDate: date,
                entryType: "PARTIAL_PAYMENT",
                linkedBankTxnId: ids.bankTxnId,
                linkedSettlementId: ids.settlementId,
            },
        ],
        settlementRows: [
            {
                settlementId: ids.settlementId,
                utr: ids.utr,
                grossAmount: capturedAmount,
                fee: (0, types_1.paiseToAmount)(0),
                tax: (0, types_1.paiseToAmount)(0),
                netAmount: capturedAmount,
                settlementDate: date,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        discrepancyType: "partialCapture",
    };
}
//# sourceMappingURL=partialCapture.js.map