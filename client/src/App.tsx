// Root app shell composing RunTrigger, MetricsSummary, ExceptionList, and QnAPanel.

import { useCallback, useEffect, useState } from "react";
import {
  fetchMetricsSummary,
  runReconciliation,
  type MetricsSummaryResponse,
} from "./api/client";
import { RunTrigger } from "./components/RunTrigger/RunTrigger";
import { MetricsSummary } from "./components/MetricsSummary/MetricsSummary";
import { ExceptionList } from "./components/ExceptionList/ExceptionList";
import { QnAPanel } from "./components/QnA/QnAPanel";

export default function App() {
  const [metrics, setMetrics] = useState<MetricsSummaryResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchMetricsSummary();
    setMetrics(data);
  }, []);

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  async function handleRun(skipLlm: boolean) {
    setRunning(true);
    setError(null);
    setStatus(skipLlm ? "Running Tier-1 only…" : "Running full reconcile (may take several minutes)…");
    try {
      await runReconciliation(skipLlm);
      await refresh();
      setStatus("Done.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: "1.5rem",
        color: "#1a1a1a",
        background: "linear-gradient(180deg, #f3f6f4 0%, #ffffff 40%)",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ marginTop: 0 }}>AI Finance Controller</h1>
      <p style={{ color: "#444", marginTop: 0 }}>
        3-way reconciliation — bank · ledger · settlement
      </p>

      <RunTrigger running={running} onRun={handleRun} />
      {status && <p style={{ color: "#1a5f4a" }}>{status}</p>}
      {error && (
        <p style={{ color: "#8b1e1e" }} role="alert">
          {error}
        </p>
      )}

      <MetricsSummary data={metrics} />
      <ExceptionList items={metrics?.exceptions ?? []} />
      <QnAPanel />
    </main>
  );
}
