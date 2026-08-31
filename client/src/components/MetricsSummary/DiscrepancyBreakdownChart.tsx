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
    <div>
      <h3 style={{ marginTop: 0 }}>By discrepancy type</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <li key={row.discrepancyType} style={{ marginBottom: "0.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.9rem",
              }}
            >
              <span>{row.discrepancyType}</span>
              <span>{row.count}</span>
            </div>
            <div
              style={{
                height: 8,
                background: "#e8e8e8",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(row.count / max) * 100}%`,
                  height: "100%",
                  background: "#1a5f4a",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
