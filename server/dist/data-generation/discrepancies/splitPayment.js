"use strict";
// Split payment: 1 ledger ↔ 2 bank rows (ledger:bank = 1:2). Taxonomy id: splitPayment.
//
// taxonomy.ts affectedTables for splitPayment: ["LedgerEntry", "BankTransaction"] —
// confirmed: NO SettlementRecord. settlementRows is intentionally always [].
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSplitPayment = generateSplitPayment;
const types_1 = require("./types");
/**
 * Splits ledger amount across two bank transactions that sum EXACTLY to the
 * ledger amount in integer paise:
 *   part1Paise = floor(total * pct / 100)
 *   part2Paise = total - part1Paise
 * so part1 + part2 === total with zero leftover by construction (the remainder
 * lands entirely in part2 — never a float round that loses a paise).
 *
 * pct is deterministic from indexSeed in [30, 50] inclusive
 * (30 + abs(indexSeed) % 21) — not always 50/50.
 *
 * Both bank rows link to the same ledgerEntryId. Ledger.linkedBankTxnId is
 * null because there is no single bank counterpart; linkedSettlementId is
 * null because this taxonomy type has no settlement row.
 */
function generateSplitPayment(event, indexSeed) {
    const ids = (0, types_1.deterministicIds)(event.eventId, indexSeed);
    const totalPaise = (0, types_1.amountToPaise)(event.amount);
    const pct = 30 + (Math.abs(indexSeed) % 21); // 30..50
    const part1Paise = Math.floor((totalPaise * pct) / 100);
    const part2Paise = totalPaise - part1Paise; // exact complement — no leftover
    if (part1Paise <= 0 || part2Paise <= 0) {
        throw new Error(`generateSplitPayment: non-positive split for ${event.eventId} ` +
            `(total=${event.amount}, pct=${pct})`);
    }
    if (part1Paise + part2Paise !== totalPaise) {
        throw new Error(`generateSplitPayment: paise sum invariant broken for ${event.eventId}`);
    }
    const ledgerAmount = (0, types_1.paiseToAmount)(totalPaise);
    const part1Amount = (0, types_1.paiseToAmount)(part1Paise);
    const part2Amount = (0, types_1.paiseToAmount)(part2Paise);
    const date = event.baseDate;
    const bankTxnIdPart1 = `${ids.bankTxnId}_p1`;
    const bankTxnIdPart2 = `${ids.bankTxnId}_p2`;
    return {
        bankRows: [
            {
                bankTxnId: bankTxnIdPart1,
                amount: part1Amount,
                currency: event.currency,
                transactionDate: date,
                description: `${event.description} (split part 1/${pct}%)`,
                linkedLedgerId: ids.ledgerEntryId,
            },
            {
                bankTxnId: bankTxnIdPart2,
                amount: part2Amount,
                currency: event.currency,
                transactionDate: date,
                description: `${event.description} (split part 2/${100 - pct}%)`,
                linkedLedgerId: ids.ledgerEntryId,
            },
        ],
        ledgerRows: [
            {
                ledgerEntryId: ids.ledgerEntryId,
                invoiceOrOrderId: ids.invoiceOrOrderId,
                amount: ledgerAmount,
                currency: event.currency,
                entryDate: date,
                entryType: "PAYMENT",
                linkedBankTxnId: null,
                linkedSettlementId: null,
            },
        ],
        // Intentionally empty — taxonomy.splitPayment does not include SettlementRecord.
        settlementRows: [],
        discrepancyType: "splitPayment",
    };
}
//# sourceMappingURL=splitPayment.js.map