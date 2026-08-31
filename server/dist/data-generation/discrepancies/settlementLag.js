"use strict";
// Settlement lag: same amounts across all 3 sources, but bank (and settlement)
// dates sit at T+2 vs ledger T+0. Taxonomy id: settlementLag.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSettlementLag = generateSettlementLag;
const types_1 = require("./types");
/**
 * Ledger books the event on event.baseDate (T+0).
 * Bank transactionDate = baseDate + 2 days (T+2), per design-doc.
 *
 * Settlement date: same calendar instant as the bank credit.
 * Reasoning: in a typical PG cycle the settlement report day and the bank
 * credit for that settlement often align; putting settlement on bank day
 * isolates the lag as ledger-vs-(bank/settlement), not a three-way date spread.
 * Fee/tax left at 0 so this type only encodes lag, not fee deduction.
 */
function generateSettlementLag(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const amount = event.amount;
    (0, types_1.amountToPaise)(amount);
    const ledgerDate = event.baseDate;
    const bankDate = (0, types_1.addDaysIso)(event.baseDate, 2);
    const settlementDate = bankDate;
    return {
        bankRows: [
            {
                bankTxnId: ids.bankTxnId,
                amount,
                currency: event.currency,
                transactionDate: bankDate,
                description: event.description,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        ledgerRows: [
            {
                ledgerEntryId: ids.ledgerEntryId,
                invoiceOrOrderId: ids.invoiceOrOrderId,
                amount,
                currency: event.currency,
                entryDate: ledgerDate,
                entryType: "PAYMENT",
                linkedBankTxnId: ids.bankTxnId,
                linkedSettlementId: ids.settlementId,
            },
        ],
        settlementRows: [
            {
                settlementId: ids.settlementId,
                utr: ids.utr,
                grossAmount: amount,
                fee: (0, types_1.paiseToAmount)(0),
                tax: (0, types_1.paiseToAmount)(0),
                netAmount: amount,
                settlementDate,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        discrepancyType: "settlementLag",
    };
}
//# sourceMappingURL=settlementLag.js.map