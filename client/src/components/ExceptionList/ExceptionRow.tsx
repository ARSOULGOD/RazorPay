// Single exception row showing identifiers, discrepancy type, and reasoning.

import type { ExceptionListItem } from "../../api/client";

export function ExceptionRow({ item, type }: { item: ExceptionListItem; type: string }) {
  let badgeBg = "var(--surface-1)";
  let badgeColor = "var(--text-secondary)";
  let badgeBorder = "0.5px solid var(--border-strong)";
  
  if (type === "duplicate") {
    badgeBg = "var(--bg-accent)"; badgeColor = "var(--text-accent)"; badgeBorder = "none";
  } else if (type === "split") {
    badgeBg = "var(--bg-warning)"; badgeColor = "var(--text-warning)"; badgeBorder = "none";
  } else if (type === "orphan") {
    badgeBg = "var(--bg-danger)"; badgeColor = "var(--text-danger)"; badgeBorder = "none";
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <>
      <tr style={{ borderBottom: item.reasoning ? "none" : "0.5px solid var(--border)" }}>
        <td style={{ padding: "8px 6px", fontFamily: "var(--font-mono)", color: item.ledgerEntryId ? "inherit" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.ledgerEntryId ?? ""}>
          {item.ledgerEntryId ?? "—"}
        </td>
        <td style={{ padding: "8px 6px" }}>
          <span style={{ background: badgeBg, color: badgeColor, border: badgeBorder, fontSize: "12px", fontWeight: 500, padding: "2px 8px", borderRadius: "999px" }}>
            {capitalize(type)}
          </span>
        </td>
        <td style={{ padding: "8px 6px", fontFamily: "var(--font-mono)", color: item.bankTxnId ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.bankTxnId ?? ""}>
          {item.bankTxnId ?? "—"}
        </td>
        <td style={{ padding: "8px 6px", fontFamily: "var(--font-mono)", color: item.settlementId ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.settlementId ?? ""}>
          {item.settlementId ?? "—"}
        </td>
      </tr>
      {item.reasoning && (
        <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
          <td colSpan={4} style={{ padding: "0 6px 12px 6px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            <strong>Reasoning:</strong> {item.reasoning}
          </td>
        </tr>
      )}
    </>
  );
}
