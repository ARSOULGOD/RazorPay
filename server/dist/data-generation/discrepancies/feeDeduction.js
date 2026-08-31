"use strict";
// Fee deduction: ledger books gross; settlement shows gross/fee/tax/net;
// bank only ever receives net. Taxonomy id: feeDeduction.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFeeDeduction = generateFeeDeduction;
const types_1 = require("./types");
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
function generateFeeDeduction(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const grossPaise = (0, types_1.amountToPaise)(event.amount);
    const percentFeePaise = Math.floor((grossPaise * 2) / 100);
    const fixedFeePaise = 200; // ₹2.00 illustrative fixed component
    const feePaise = percentFeePaise + fixedFeePaise;
    const taxPaise = Math.floor((feePaise * 18) / 100);
    const netPaise = grossPaise - feePaise - taxPaise;
    if (netPaise <= 0) {
        throw new Error(`generateFeeDeduction: net non-positive for ${event.eventId} (gross=${event.amount})`);
    }
    const grossAmount = (0, types_1.paiseToAmount)(grossPaise);
    const fee = (0, types_1.paiseToAmount)(feePaise);
    const tax = (0, types_1.paiseToAmount)(taxPaise);
    const netAmount = (0, types_1.paiseToAmount)(netPaise);
    const ledgerDate = event.baseDate;
    const settlementDate = (0, types_1.addDaysIso)(event.baseDate, 1);
    const bankDate = settlementDate;
    return {
        bankRows: [
            {
                bankTxnId: ids.bankTxnId,
                amount: netAmount,
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
                amount: grossAmount,
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
                grossAmount,
                fee,
                tax,
                netAmount,
                settlementDate,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        discrepancyType: "feeDeduction",
    };
}
//# sourceMappingURL=feeDeduction.js.map