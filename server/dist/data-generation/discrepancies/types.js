"use strict";
// Shared row shapes for discrepancy generators — mirrors schema.prisma business
// fields (excludes Prisma-managed id / createdAt). Amounts are 2-decimal strings
// (same convention as TrueEvent); dates are ISO-8601 strings → DateTime on insert.
//
// Link fields store business keys (ledgerEntryId / bankTxnId / settlementId), not
// Prisma UUIDs — UUIDs do not exist until insert.
Object.defineProperty(exports, "__esModule", { value: true });
exports.deterministicIds = deterministicIds;
exports.amountToPaise = amountToPaise;
exports.paiseToAmount = paiseToAmount;
exports.addDaysIso = addDaysIso;
/** Deterministic business IDs from (eventId, indexSeed) — no Math.random / UUID. */
function deterministicIds(eventId, indexSeed) {
    const tag = `${eventId}_s${indexSeed}`;
    return {
        bankTxnId: `bank_${tag}`,
        ledgerEntryId: `led_${tag}`,
        settlementId: `set_${tag}`,
        utr: `UTR${tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
        invoiceOrOrderId: `inv_${tag}`,
    };
}
/** Parse "4847.50" → paise integer. Throws on malformed input. */
function amountToPaise(amount) {
    const match = /^(-?\d+)\.(\d{2})$/.exec(amount);
    if (!match) {
        throw new Error(`amountToPaise: expected N.NN string, got ${JSON.stringify(amount)}`);
    }
    const whole = Number(match[1]);
    const frac = Number(match[2]);
    const sign = whole < 0 || Object.is(whole, -0) ? -1 : 1;
    return sign * (Math.abs(whole) * 100 + frac);
}
function paiseToAmount(paise) {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(paise);
    const rupees = Math.floor(abs / 100);
    const frac = abs % 100;
    return `${sign}${rupees}.${frac.toString().padStart(2, "0")}`;
}
function addDaysIso(iso, days) {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
}
//# sourceMappingURL=types.js.map