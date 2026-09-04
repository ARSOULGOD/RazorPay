// UI control to kick off a full reconciliation pass against the loaded dataset.

type Props = {
  running: boolean;
  wsReady: boolean;
  onRun: (skipLlm: boolean) => void;
};

export function RunTrigger({ running, wsReady, onRun }: Props) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ margin: "0 0 0.5rem" }}>Run reconciliation</h2>
      <p style={{ margin: "0 0 0.75rem", color: "#444" }}>
        Processes the seeded bank / ledger / settlement batch. Tier-1 is
        deterministic; Tier-2 uses Groq (Gemini failover).
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" disabled={running || !wsReady} onClick={() => onRun(false)}>
          {running ? "Running…" : "Run full reconcile"}
        </button>
        <button type="button" disabled={running || !wsReady} onClick={() => onRun(true)}>
          Run Tier-1 only
        </button>
      </div>
      {!wsReady && <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "#666" }}>Connecting to run channel…</p>}
    </section>
  );
}
