// Table/list of unresolved exception records with reasoning.

import type { ExceptionListItem } from "../../api/client";
import { ExceptionRow } from "./ExceptionRow";

export function ExceptionList({ items }: { items: ExceptionListItem[] }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 0.75rem" }}>
        Exceptions ({items.length})
      </h2>
      {!items.length ? (
        <p>No EXCEPTION rows in the latest results.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th align="left" style={{ padding: "0.5rem" }}>
                  IDs
                </th>
                <th align="left" style={{ padding: "0.5rem" }}>
                  Type
                </th>
                <th align="left" style={{ padding: "0.5rem" }}>
                  Reasoning (verbatim)
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ExceptionRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
