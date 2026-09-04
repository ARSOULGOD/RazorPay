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
    <div style={{ marginBottom: "1.5rem" }}>
      {!data ? (
        <p>Load or run a reconciliation to see metrics.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "1.2fr 1fr 1fr",
          }}
        >
          <MatchRateCard data={data.matchRate} />
          <TierSplitCard data={data.tierSplit} />
          <DiscrepancyBreakdownChart rows={data.discrepancyBreakdown} />
        </div>
      )}
    </div>
  );
}
