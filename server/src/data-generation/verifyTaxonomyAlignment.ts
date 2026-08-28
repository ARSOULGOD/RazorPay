import assert from "node:assert/strict";
import { DISCREPANCY_TAXONOMY_BY_ID } from "./taxonomy";

function has(id: keyof typeof DISCREPANCY_TAXONOMY_BY_ID, table: string) {
  return DISCREPANCY_TAXONOMY_BY_ID[id].affectedTables.includes(table as never);
}

// Spec §4 — these MUST include the expanded tables
assert.equal(has("settlementLag", "SettlementRecord"), true, "settlementLag must include SettlementRecord");
assert.equal(has("feeDeduction", "BankTransaction"), true, "feeDeduction must include BankTransaction");
assert.equal(
  has("partialCapture", "BankTransaction") && has("partialCapture", "SettlementRecord"),
  true,
  "partialCapture must include Bank + Settlement",
);
assert.equal(DISCREPANCY_TAXONOMY_BY_ID.trueOrphan.isOrphan, true);
for (const e of Object.values(DISCREPANCY_TAXONOMY_BY_ID)) {
  if (e.id !== "trueOrphan") assert.equal(e.isOrphan, false, `${e.id} must not be orphan`);
}

console.log("verifyTaxonomyAlignment: OK");
