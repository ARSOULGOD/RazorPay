// Deterministic Tier-1 exact matching (ID/amount/timestamp) without calling the LLM.

import { Decimal } from "decimal.js";
import { TAXONOMY_IDS } from "../../data-generation/taxonomy";
import type {
  BankTxnView,
  LedgerView,
  ReconciliationDecision,
  SettlementView,
} from "../../types/reconciliation.types";

function moneyEq(a: string, b: string): boolean {
  // Throws if a or b is not a valid decimal string; fail loudly on corrupted data.
  return new Decimal(a).eq(new Decimal(b));
}

function timeEq(aIso: string, bIso: string): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * Tier 1 succeeds only when a consistent 3-way triangle exists:
 * - cross-links agree on business IDs
 * - bank.amount === ledger.amount === settlement.grossAmount === settlement.netAmount
 * - currencies equal
 * - bank.transactionDate === ledger.entryDate === settlement.settlementDate
 *
 * Fee/lag/split/orphan cases fail this check and must go to Tier 2.
 */
export function tryExactMatch(
  bank: BankTxnView,
  ledger: LedgerView,
  settlement: SettlementView,
): ReconciliationDecision | null {
  const linksOk =
    bank.linkedLedgerId === ledger.ledgerEntryId &&
    ledger.linkedBankTxnId === bank.bankTxnId &&
    ledger.linkedSettlementId === settlement.settlementId &&
    settlement.linkedLedgerId === ledger.ledgerEntryId;

  if (!linksOk) return null;

  const amountsOk =
    moneyEq(bank.amount, ledger.amount) &&
    moneyEq(ledger.amount, settlement.grossAmount) &&
    moneyEq(settlement.grossAmount, settlement.netAmount) &&
    moneyEq(settlement.fee, "0") &&
    moneyEq(settlement.tax, "0");

  if (!amountsOk) return null;

  // Settlements have no currency field in schema; bank/ledger must agree.
  if (bank.currency !== ledger.currency) return null;

  const timesOk =
    timeEq(bank.transactionDate, ledger.entryDate) &&
    timeEq(ledger.entryDate, settlement.settlementDate);

  if (!timesOk) return null;

  return {
    status: "MATCHED",
    confidence: 1,
    discrepancyType: TAXONOMY_IDS.exactMatch,
    reasoning:
      "Tier-1 exact match: consistent cross-links, equal amounts (gross=net, fee=tax=0), equal timestamps, matching currency.",
    bankTxnId: bank.bankTxnId,
    ledgerEntryId: ledger.ledgerEntryId,
    settlementId: settlement.settlementId,
    resolvedByLLM: false,
  };
}

/**
 * Given indexes of all three sources, find every Tier-1 exact triple.
 * Each business ID is used at most once.
 */
export function findExactMatches(
  banks: BankTxnView[],
  ledgers: LedgerView[],
  settlements: SettlementView[],
): ReconciliationDecision[] {
  const ledgerById = new Map(ledgers.map((l) => [l.ledgerEntryId, l]));
  const settlementById = new Map(settlements.map((s) => [s.settlementId, s]));

  const usedBank = new Set<string>();
  const usedLedger = new Set<string>();
  const usedSettlement = new Set<string>();
  const results: ReconciliationDecision[] = [];

  for (const bank of banks) {
    if (usedBank.has(bank.bankTxnId)) continue;
    if (!bank.linkedLedgerId) continue;

    const ledger = ledgerById.get(bank.linkedLedgerId);
    if (!ledger || usedLedger.has(ledger.ledgerEntryId)) continue;
    if (!ledger.linkedSettlementId) continue;

    const settlement = settlementById.get(ledger.linkedSettlementId);
    if (!settlement || usedSettlement.has(settlement.settlementId)) continue;

    const decision = tryExactMatch(bank, ledger, settlement);
    if (!decision) continue;

    usedBank.add(bank.bankTxnId);
    usedLedger.add(ledger.ledgerEntryId);
    usedSettlement.add(settlement.settlementId);
    results.push(decision);
  }

  return results;
}

export interface ExactMatchCoverage {
  decisions: ReconciliationDecision[];
  usedBankIds: Set<string>;
  usedLedgerIds: Set<string>;
  usedSettlementIds: Set<string>;
}

export function findExactMatchesWithCoverage(
  banks: BankTxnView[],
  ledgers: LedgerView[],
  settlements: SettlementView[],
): ExactMatchCoverage {
  const decisions = findExactMatches(banks, ledgers, settlements);
  return {
    decisions,
    usedBankIds: new Set(decisions.map((d) => d.bankTxnId!).filter(Boolean)),
    usedLedgerIds: new Set(decisions.map((d) => d.ledgerEntryId!).filter(Boolean)),
    usedSettlementIds: new Set(decisions.map((d) => d.settlementId!).filter(Boolean)),
  };
}
