// Shared row shapes for discrepancy generators — mirrors schema.prisma business
// fields (excludes Prisma-managed id / createdAt). Amounts are 2-decimal strings
// (same convention as TrueEvent); dates are ISO-8601 strings → DateTime on insert.
//
// Link fields store business keys (ledgerEntryId / bankTxnId / settlementId), not
// Prisma UUIDs — UUIDs do not exist until insert.

import type { DiscrepancyTaxonomyId } from "../taxonomy";

export interface GeneratedBankRow {
  bankTxnId: string;
  amount: string;
  currency: string;
  transactionDate: string;
  description: string;
  linkedLedgerId: string | null;
}

export interface GeneratedLedgerRow {
  ledgerEntryId: string;
  invoiceOrOrderId: string | null;
  amount: string;
  currency: string;
  entryDate: string;
  entryType: "PAYMENT" | "REFUND" | "PARTIAL_PAYMENT" | "PAYOUT";
  linkedBankTxnId: string | null;
  linkedSettlementId: string | null;
}

export interface GeneratedSettlementRow {
  settlementId: string;
  utr: string | null;
  grossAmount: string;
  fee: string;
  tax: string;
  netAmount: string;
  settlementDate: string;
  linkedLedgerId: string | null;
}

export interface DiscrepancyGenerationResult {
  bankRows: GeneratedBankRow[];
  ledgerRows: GeneratedLedgerRow[];
  settlementRows: GeneratedSettlementRow[];
  /** Which taxonomy id this result was generated as — always set by the
   *  generator itself, never left for the caller to infer. */
  discrepancyType: DiscrepancyTaxonomyId;
}

/** Deterministic business IDs from (eventId, indexSeed) — no Math.random / UUID. */
export function deterministicIds(eventId: string, indexSeed: number) {
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
export function amountToPaise(amount: string): number {
  const match = /^(-?\d+)\.(\d{2})$/.exec(amount);
  if (!match) {
    throw new Error(`amountToPaise: expected N.NN string, got ${JSON.stringify(amount)}`);
  }
  const whole = Number(match[1]);
  const frac = Number(match[2]);
  const sign = whole < 0 || Object.is(whole, -0) ? -1 : 1;
  return sign * (Math.abs(whole) * 100 + frac);
}

export function paiseToAmount(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${rupees}.${frac.toString().padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
