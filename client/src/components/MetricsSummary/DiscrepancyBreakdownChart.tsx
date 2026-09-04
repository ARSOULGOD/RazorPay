// Visual breakdown of outcomes by discrepancy taxonomy category.

import type { DiscrepancyBreakdownRow } from "../../api/client";

export function DiscrepancyBreakdownChart({
  rows,
}: {
  rows: DiscrepancyBreakdownRow[];
}) {
  if (!rows.length) return <p>No discrepancy breakdown yet.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--text-secondary)" }}>By type</p>
      <div>
        {rows.map((row) => {
          let barBg = "var(--bg-accent)";
          let barFill = "var(--border-accent)";
          if (row.discrepancyType === "exactMatch") {
            barBg = "var(--bg-success)"; barFill = "var(--border-success)";
          } else if (row.discrepancyType === "unclassified" || row.discrepancyType === "trueOrphan") {
             barBg = "var(--bg-warning)"; barFill = "var(--border-warning)";
          }
          return (
            <div key={row.discrepancyType} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                <span>{row.discrepancyType === "unclassified" ? "Unclassified" : row.discrepancyType === "exactMatch" ? "Exact match" : row.discrepancyType}</span>
                <span style={{ fontWeight: 500 }}>{row.count}</span>
              </div>
              <div style={{ height: "5px", background: barBg, borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: `${(row.count / max) * 100}%`, height: "100%", background: barFill }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
