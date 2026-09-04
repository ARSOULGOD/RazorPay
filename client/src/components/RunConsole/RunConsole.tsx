type Props = { lines: string[] };

export function RunConsole({ lines }: Props) {
  if (lines.length === 0) {
    return (
      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.5rem", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-muted)" }}>
        Waiting for a run…
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <pre
        style={{
          margin: 0,
          padding: "0.75rem",
          maxHeight: 280,
          overflow: "auto",
          background: "#0f1a16",
          color: "#c8e6d0",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          borderRadius: "var(--radius)",
        }}
      >
        {lines.join("\n")}
      </pre>
    </div>
  );
}
