// Table/list of unresolved exception records with reasoning.

import { useState } from "react";
import type { ExceptionListItem } from "../../api/client";
import { ExceptionRow } from "./ExceptionRow";

export function ExceptionList({ items }: { items: ExceptionListItem[] }) {
  const [filter, setFilter] = useState("all");

  const getType = (item: ExceptionListItem) => {
    // Structural orphan check: if 2 out of 3 IDs are missing, it's definitively an orphan
    const missingCount = (!item.bankTxnId ? 1 : 0) + (!item.ledgerEntryId ? 1 : 0) + (!item.settlementId ? 1 : 0);
    if (missingCount >= 2) return "orphan";

    const dt = item.discrepancyType || "";
    if (dt.includes("duplicate")) return "duplicate";
    if (dt.includes("split")) return "split";
    if (dt.includes("orphan")) return "orphan";
    
    return "unmatched";
  };

  const filteredItems = items.filter(item => filter === "all" || getType(item) === filter);
  
  const counts = {
    all: items.length,
    unmatched: items.filter(i => getType(i) === "unmatched").length,
    duplicate: items.filter(i => getType(i) === "duplicate").length,
    split: items.filter(i => getType(i) === "split").length,
    orphan: items.filter(i => getType(i) === "orphan").length,
  };

  const isSkipped = items.length > 0 && items[0].reasoning?.includes("Tier-2 skipped");

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <h2 style={{ margin: 0 }}>Exceptions</h2>
        <span style={{ background: "var(--surface-1)", color: "var(--text-secondary)", fontSize: "12px", fontWeight: 500, padding: "2px 8px", borderRadius: "999px" }}>
          {items.length}
        </span>
      </div>

      {!items.length ? (
        <p>No EXCEPTION rows in the latest results.</p>
      ) : (
        <>
          {isSkipped && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--bg-warning)", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: "1rem" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-warning)" }}>
                Tier-2 (LLM) matching was disabled for this run, so all {items.length} exceptions were left unresolved instead of auto-classified.
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "1rem" }}>
            {["all", "unmatched", "duplicate", "split", "orphan"].map((f) => (
              <button 
                key={f}
                className={`pill ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
                style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "999px", textTransform: "capitalize" }}
              >
                {f} {counts[f as keyof typeof counts]}
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 500, color: "var(--text-secondary)", width: "32%" }}>Ledger ID</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 500, color: "var(--text-secondary)", width: "16%" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 500, color: "var(--text-secondary)", width: "26%" }}>Bank ref</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 500, color: "var(--text-secondary)", width: "26%" }}>Set ref</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ExceptionRow key={item.id} item={item} type={getType(item)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
