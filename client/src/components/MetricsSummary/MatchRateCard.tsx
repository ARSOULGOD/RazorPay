// Displays overall matched / partial / exception counts and match rate.

import type { MatchRateSummary } from "../../api/client";

export function MatchRateCard({ data }: { data: MatchRateSummary | null }) {
  if (!data) return <p>No match-rate data yet.</p>;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Match rate</h3>
      <p style={{ fontSize: "1.5rem", margin: "0.25rem 0" }}>
        {(data.matchRate * 100).toFixed(1)}%
      </p>
      <p style={{ margin: 0 }}>{data.plainStatement}</p>
    </div>
  );
}
