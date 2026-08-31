// Quick offline smoke for Tier-1 exactMatcher (no Docker required).
import assert from "node:assert/strict";
import { tryExactMatch, findExactMatches } from "./exactMatcher";
import type {
  BankTxnView,
  LedgerView,
  SettlementView,
} from "../../types/reconciliation.types";

const date = "2026-01-15T10:00:00.000Z";

const bank: BankTxnView = {
  bankTxnId: "bank_1",
  amount: "100.00",
  currency: "INR",
  transactionDate: date,
  description: "test",
  linkedLedgerId: "led_1",
};
const ledger: LedgerView = {
  ledgerEntryId: "led_1",
  invoiceOrOrderId: "inv_1",
  amount: "100.00",
  currency: "INR",
  entryDate: date,
  entryType: "PAYMENT",
  linkedBankTxnId: "bank_1",
  linkedSettlementId: "set_1",
};
const settlement: SettlementView = {
  settlementId: "set_1",
  utr: "UTR1",
  grossAmount: "100.00",
  fee: "0.00",
  tax: "0.00",
  netAmount: "100.00",
  settlementDate: date,
  linkedLedgerId: "led_1",
};

const ok = tryExactMatch(bank, ledger, settlement);
assert.equal(ok?.status, "MATCHED");
assert.equal(ok?.resolvedByLLM, false);

const feeCase = tryExactMatch(bank, ledger, {
  ...settlement,
  fee: "2.00",
  tax: "0.36",
  netAmount: "97.64",
});
assert.equal(feeCase, null);

const found = findExactMatches([bank], [ledger], [settlement]);
assert.equal(found.length, 1);
console.log("exactMatcher smoke OK");
