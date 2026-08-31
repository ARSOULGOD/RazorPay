// Summary panel composing match-rate, tier-split, and discrepancy breakdown cards.

import type { MetricsSummaryResponse } from "../../api/client";
import { MatchRateCard } from "./MatchRateCard";
import { TierSplitCard } from "./TierSplitCard";
import { DiscrepancyBreakdownChart } from "./DiscrepancyBreakdownChart";

export function MetricsSummary({
  data,
}: {
  data: MetricsSummaryResponse | null;
}) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ margin: "0 0 0.75rem" }}>Metrics</h2>
      {!data ? (
        <p>Load or run a reconciliation to see metrics.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <MatchRateCard data={data.matchRate} />
          <TierSplitCard data={data.tierSplit} />
          <DiscrepancyBreakdownChart rows={data.discrepancyBreakdown} />
        </div>
      )}
    </section>
  );
}
