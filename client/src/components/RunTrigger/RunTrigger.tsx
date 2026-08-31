// UI control to kick off a full reconciliation pass against the loaded dataset.

type Props = {
  running: boolean;
  onRun: (skipLlm: boolean) => void;
};

export function RunTrigger({ running, onRun }: Props) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ margin: "0 0 0.5rem" }}>Run reconciliation</h2>
      <p style={{ margin: "0 0 0.75rem", color: "#444" }}>
        Processes the seeded bank / ledger / settlement batch. Tier-1 is
        deterministic; Tier-2 uses Groq (Gemini failover).
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" disabled={running} onClick={() => onRun(false)}>
          {running ? "Running…" : "Run full reconcile"}
        </button>
        <button type="button" disabled={running} onClick={() => onRun(true)}>
          Run Tier-1 only
        </button>
      </div>
    </section>
  );
}
