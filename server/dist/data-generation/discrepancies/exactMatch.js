"use strict";
// Exact-match baseline: one bank + one ledger + one settlement, same amount/dates,
// fully cross-linked. Taxonomy id: exactMatch.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateExactMatch = generateExactMatch;
const types_1 = require("./types");
/**
 * Clean 3-way match from a single TrueEvent.
 * Settlement fee/tax are zero here so net === gross === ledger/bank amount —
 * fee deduction is a separate taxonomy type.
 */
function generateExactMatch(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const amount = event.amount;
    // Verify amount is a valid paise string (fails fast if TrueEvent convention breaks).
    (0, types_1.amountToPaise)(amount);
    const date = event.baseDate;
    const bankRow = {
        bankTxnId: ids.bankTxnId,
        amount,
        currency: event.currency,
        transactionDate: date,
        description: event.description,
        linkedLedgerId: ids.ledgerEntryId,
    };
    const ledgerRow = {
        ledgerEntryId: ids.ledgerEntryId,
        invoiceOrOrderId: ids.invoiceOrOrderId,
        amount,
        currency: event.currency,
        entryDate: date,
        entryType: "PAYMENT",
        linkedBankTxnId: ids.bankTxnId,
        linkedSettlementId: ids.settlementId,
    };
    const settlementRow = {
        settlementId: ids.settlementId,
        utr: ids.utr,
        grossAmount: amount,
        fee: (0, types_1.paiseToAmount)(0),
        tax: (0, types_1.paiseToAmount)(0),
        netAmount: amount,
        settlementDate: date,
        linkedLedgerId: ids.ledgerEntryId,
    };
    return {
        bankRows: [bankRow],
        ledgerRows: [ledgerRow],
        settlementRows: [settlementRow],
        discrepancyType: "exactMatch",
    };
}
//# sourceMappingURL=exactMatch.js.map