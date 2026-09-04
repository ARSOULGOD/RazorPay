// Orchestrates a full reconciliation pass over the loaded dataset and persists results.

import "dotenv/config";
import { prisma } from "../db/prisma";
import { emitLog, emitProgress, type RunEventSink } from "./runEvents";
import { routeReconciliation } from "./router";
import type {
  BankTxnView,
  LedgerView,
  ReconciliationDecision,
  SettlementView,
} from "../types/reconciliation.types";
import { computeMatchRate } from "../metrics/computeMatchRate";
import { computeTierSplit } from "../metrics/computeTierSplit";
import { computeDiscrepancyBreakdown } from "../metrics/computeDiscrepancyBreakdown";
import { buildExceptionList } from "../metrics/buildExceptionList";

function decimalToString(value: { toString(): string } | string | number): string {
  return typeof value === "string" ? value : value.toString();
}

function toBankView(row: {
  bankTxnId: string;
  amount: { toString(): string };
  currency: string;
  transactionDate: Date;
  description: string;
  linkedLedgerId: string | null;
}): BankTxnView {
  return {
    bankTxnId: row.bankTxnId,
    amount: decimalToString(row.amount),
    currency: row.currency,
    transactionDate: row.transactionDate.toISOString(),
    description: row.description,
    linkedLedgerId: row.linkedLedgerId,
  };
}

function toLedgerView(row: {
  ledgerEntryId: string;
  invoiceOrOrderId: string | null;
  amount: { toString(): string };
  currency: string;
  entryDate: Date;
  entryType: string;
  linkedBankTxnId: string | null;
  linkedSettlementId: string | null;
}): LedgerView {
  return {
    ledgerEntryId: row.ledgerEntryId,
    invoiceOrOrderId: row.invoiceOrOrderId,
    amount: decimalToString(row.amount),
    currency: row.currency,
    entryDate: row.entryDate.toISOString(),
    entryType: row.entryType,
    linkedBankTxnId: row.linkedBankTxnId,
    linkedSettlementId: row.linkedSettlementId,
  };
}

function toSettlementView(row: {
  settlementId: string;
  utr: string | null;
  grossAmount: { toString(): string };
  fee: { toString(): string };
  tax: { toString(): string };
  netAmount: { toString(): string };
  settlementDate: Date;
  linkedLedgerId: string | null;
}): SettlementView {
  return {
    settlementId: row.settlementId,
    utr: row.utr,
    grossAmount: decimalToString(row.grossAmount),
    fee: decimalToString(row.fee),
    tax: decimalToString(row.tax),
    netAmount: decimalToString(row.netAmount),
    settlementDate: row.settlementDate.toISOString(),
    linkedLedgerId: row.linkedLedgerId,
  };
}

async function persistDecisions(decisions: ReconciliationDecision[]): Promise<void> {
  await prisma.reconciliationResult.deleteMany({});
  if (decisions.length === 0) return;

  await prisma.reconciliationResult.createMany({
    data: decisions.map((d) => ({
      bankTxnId: d.bankTxnId,
      ledgerEntryId: d.ledgerEntryId,
      settlementId: d.settlementId,
      status: d.status,
      confidence: d.confidence,
      discrepancyType: d.discrepancyType,
      reasoning: d.reasoning,
      resolvedByLLM: d.resolvedByLLM,
      llmDurationMs: d.llmDurationMs ?? null, // Issue 13: Store LLM latency
    })),
  });
}

export interface ReconciliationRunSummary {
  decisionsWritten: number;
  matchRate: ReturnType<typeof computeMatchRate>;
  tierSplit: ReturnType<typeof computeTierSplit>;
  discrepancyBreakdown: ReturnType<typeof computeDiscrepancyBreakdown>;
  exceptions: number;
}

export async function runReconciliation(options?: {
  skipLlm?: boolean;
  onEvent?: RunEventSink;
}): Promise<ReconciliationRunSummary> {
  const [banks, ledgers, settlements] = await Promise.all([
    prisma.bankTransaction.findMany(),
    prisma.ledgerEntry.findMany(),
    prisma.settlementRecord.findMany(),
  ]);

  const decisions = await routeReconciliation(
    banks.map(toBankView),
    ledgers.map(toLedgerView),
    settlements.map(toSettlementView),
    { skipLlm: options?.skipLlm, onEvent: options?.onEvent },
  );

  emitProgress(options?.onEvent, "persist", 1, 1);
  emitLog(options?.onEvent, "Persisting reconciliation decisions…");
  await persistDecisions(decisions);

  const stored = await prisma.reconciliationResult.findMany({
    orderBy: { createdAt: "asc" },
  });

  const summary = {
    decisionsWritten: stored.length,
    matchRate: computeMatchRate(stored),
    tierSplit: computeTierSplit(stored),
    discrepancyBreakdown: computeDiscrepancyBreakdown(stored),
    exceptions: buildExceptionList(stored).length,
  };

  options?.onEvent?.({ type: "run.done", summary });
  return summary;
}

async function main() {
  const skipLlm = process.argv.includes("--skip-llm");
  console.log(`runReconciliation starting (skipLlm=${skipLlm})...`);
  const summary = await runReconciliation({ skipLlm });
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("runReconciliation FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
    await prisma.$disconnect();
    process.exit(1);
  });
}
