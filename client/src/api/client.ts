// HTTP client helpers for calling the server reconciliation/metrics/QnA APIs.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new Error(`Failed to parse JSON response from ${path}: ${err}`);
  }
  
  // Validate response structure before casting.
  if (typeof body !== "object" || body === null) {
    throw new Error(`API ${path} returned non-object: ${typeof body}`);
  }
  
  if (!res.ok || (body as Record<string, unknown>).ok === false) {
    const error = (body as Record<string, unknown>).error ?? `HTTP ${res.status}`;
    throw new Error(String(error));
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
