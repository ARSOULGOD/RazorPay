// HTTP client helpers for calling the server reconciliation/metrics/QnA APIs.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json();
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export interface MatchRateSummary {
  total: number;
  matched: number;
  partial: number;
  exception: number;
  matchRate: number;
  plainStatement: string;
}

export interface TierSplitSummary {
  tier1: number;
  tier2: number;
  total: number;
}

export interface DiscrepancyBreakdownRow {
  discrepancyType: string;
  count: number;
}

export interface ExceptionListItem {
  id: string;
  bankTxnId: string | null;
  ledgerEntryId: string | null;
  settlementId: string | null;
  discrepancyType: string | null;
  confidence: number;
  reasoning: string;
  resolvedByLLM: boolean;
  createdAt: string;
}

export interface MetricsSummaryResponse {
  ok: true;
  matchRate: MatchRateSummary;
  tierSplit: TierSplitSummary;
  discrepancyBreakdown: DiscrepancyBreakdownRow[];
  exceptions: ExceptionListItem[];
}

export function fetchMetricsSummary() {
  return request<MetricsSummaryResponse>("/api/metrics/summary");
}

export function runReconciliation(skipLlm = false) {
  return request<{ ok: true; summary: unknown }>("/api/reconciliation/run", {
    method: "POST",
    body: JSON.stringify({ skipLlm }),
  });
}
