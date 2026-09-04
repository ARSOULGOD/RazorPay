// Displays overall matched / partial / exception counts and match rate.

import type { MatchRateSummary } from "../../api/client";

export function MatchRateCard({ data }: { data: MatchRateSummary | null }) {
  if (!data) return <p>No match-rate data yet.</p>;
  
  const isDanger = data.matchRate < 0.8;
  const bg = isDanger ? "var(--bg-danger)" : "var(--surface-1)";
  const color = isDanger ? "var(--text-danger)" : "var(--text-primary)";
  const subtitleColor = isDanger ? "var(--text-danger)" : "var(--text-secondary)";
  const captionColor = isDanger ? "var(--text-danger)" : "var(--text-muted)";

  return (
    <div style={{ background: bg, borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ margin: "0 0 6px", fontSize: "13px", color: subtitleColor }}>Match rate</p>
      <p style={{ margin: "0 0 4px", fontSize: "28px", fontWeight: 500, color }}>
        {(data.matchRate * 100).toFixed(1)}%
      </p>
      <p style={{ margin: 0, fontSize: "12px", color: captionColor }}>{data.plainStatement}</p>
    </div>
  );
}
