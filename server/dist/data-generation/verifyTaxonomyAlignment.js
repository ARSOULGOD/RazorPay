"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const taxonomy_1 = require("./taxonomy");
function has(id, table) {
    return taxonomy_1.DISCREPANCY_TAXONOMY_BY_ID[id].affectedTables.includes(table);
}
// Spec §4 — these MUST include the expanded tables
strict_1.default.equal(has("settlementLag", "SettlementRecord"), true, "settlementLag must include SettlementRecord");
strict_1.default.equal(has("feeDeduction", "BankTransaction"), true, "feeDeduction must include BankTransaction");
strict_1.default.equal(has("partialCapture", "BankTransaction") && has("partialCapture", "SettlementRecord"), true, "partialCapture must include Bank + Settlement");
strict_1.default.equal(taxonomy_1.DISCREPANCY_TAXONOMY_BY_ID.trueOrphan.isOrphan, true);
for (const e of Object.values(taxonomy_1.DISCREPANCY_TAXONOMY_BY_ID)) {
    if (e.id !== "trueOrphan")
        strict_1.default.equal(e.isOrphan, false, `${e.id} must not be orphan`);
}
console.log("verifyTaxonomyAlignment: OK");
//# sourceMappingURL=verifyTaxonomyAlignment.js.map