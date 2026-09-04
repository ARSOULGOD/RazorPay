// Displays how many results were resolved by Tier-1 vs Tier-2 LLM.

import type { TierSplitSummary } from "../../api/client";

export function TierSplitCard({ data }: { data: TierSplitSummary | null }) {
  if (!data) return <p>No tier-split data yet.</p>;
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--text-secondary)" }}>Tier split</p>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "13px" }}>Tier-1</span>
        <span style={{ fontSize: "13px", fontWeight: 500 }}>{data.tier1}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px" }}>Tier-2 (LLM)</span>
        <span style={{ fontSize: "13px", fontWeight: 500 }}>{data.tier2}</span>
      </div>
    </div>
  );
}
