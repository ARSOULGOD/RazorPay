// Displays how many results were resolved by Tier-1 vs Tier-2 LLM.

import type { TierSplitSummary } from "../../api/client";

export function TierSplitCard({ data }: { data: TierSplitSummary | null }) {
  if (!data) return <p>No tier-split data yet.</p>;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Tier split</h3>
      <p style={{ margin: 0 }}>
        Tier-1 (deterministic): <strong>{data.tier1}</strong>
      </p>
      <p style={{ margin: "0.25rem 0 0" }}>
        Tier-2 (LLM): <strong>{data.tier2}</strong>
      </p>
    </div>
  );
}
