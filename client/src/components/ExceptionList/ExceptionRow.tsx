// Single exception row showing identifiers, discrepancy type, and reasoning.

import type { ExceptionListItem } from "../../api/client";

export function ExceptionRow({ item }: { item: ExceptionListItem }) {
  return (
    <tr>
      <td style={{ verticalAlign: "top", padding: "0.5rem", borderTop: "1px solid #ddd" }}>
        <div>{item.ledgerEntryId ?? "—"}</div>
        <div style={{ color: "#666", fontSize: "0.85rem" }}>
          bank: {item.bankTxnId ?? "—"}
        </div>
        <div style={{ color: "#666", fontSize: "0.85rem" }}>
          set: {item.settlementId ?? "—"}
        </div>
      </td>
      <td style={{ verticalAlign: "top", padding: "0.5rem", borderTop: "1px solid #ddd" }}>
        {item.discrepancyType ?? "unclassified"}
      </td>
      <td style={{ verticalAlign: "top", padding: "0.5rem", borderTop: "1px solid #ddd" }}>
        {item.reasoning}
      </td>
    </tr>
  );
}
