// Root app shell composing RunTrigger, MetricsSummary, ExceptionList, and QnAPanel.

import { useCallback, useEffect, useState } from "react";
import {
  fetchMetricsSummary,
  type MetricsSummaryResponse,
} from "./api/client";
import { openReconciliationSocket, type ReconciliationSocket } from "./api/reconciliationSocket";
import { RunTrigger } from "./components/RunTrigger/RunTrigger";
import { RunConsole } from "./components/RunConsole/RunConsole";
import { MetricsSummary } from "./components/MetricsSummary/MetricsSummary";
import { ExceptionList } from "./components/ExceptionList/ExceptionList";
import { QnAPanel } from "./components/QnAPanel/QnAPanel";

export default function App() {
  const [metrics, setMetrics] = useState<MetricsSummaryResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [socket, setSocket] = useState<ReconciliationSocket | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchMetricsSummary();
    setMetrics(data);
  }, []);

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  useEffect(() => {
    const s = openReconciliationSocket({
      onOpen: () => setWsReady(true),
      onClose: () => {
        setWsReady(false);
        setRunning((r) => {
          if (r) setStatus("Disconnected — run may still be finishing on the server");
          return r;
        });
      },
      onEvent: (event) => {
        if (event.type === "run.log") {
          setLines((prev) => [...prev, event.message]);
        } else if (event.type === "run.progress") {
          if (event.phase === "tier2") {
            setStatus(`Tier-2 ${event.completed}/${event.total}`);
          } else {
            setStatus(event.phase);
          }
        } else if (event.type === "run.done") {
          setRunning(false);
          setStatus("Done.");
          refresh();
        } else if (event.type === "run.error") {
          setRunning(false);
          setError(event.message);
        }
      },
    });
    setSocket(s);
    return () => s.disconnect();
  }, [refresh]);

  function handleRun(skipLlm: boolean) {
    if (!socket || !socket.ready) return;
    setRunning(true);
    setError(null);
    setLines([]);
    setStatus(skipLlm ? "Running Tier-1 only…" : "Running full reconcile (may take several minutes)…");
    try {
      socket.startRun(skipLlm);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: "1.5rem",
        color: "var(--text-primary)",
        minHeight: "100vh",
      }}
    >
      <style>{`
        :root {
          --surface-1: #f9fafb;
          --surface-2: #ffffff;
          --border: #e5e7eb;
          --border-strong: #d1d5db;
          --text-primary: #111827;
          --text-secondary: #4b5563;
          --text-muted: #9ca3af;
          --bg-danger: #fef2f2;
          --text-danger: #dc2626;
          --bg-warning: #fffbeb;
          --border-warning: #f59e0b;
          --text-warning: #d97706;
          --bg-success: #f0fdf4;
          --border-success: #22c55e;
          --text-success: #15803d;
          --bg-accent: #eff6ff;
          --border-accent: #3b82f6;
          --text-accent: #1d4ed8;
          --radius: 8px;
          --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        body { background: #ffffff; margin: 0; }
        .pill { cursor: pointer; user-select: none; transition: transform 0.1s; border: 1px solid transparent; background: transparent; }
        .pill:active { transform: scale(0.97); }
        .pill.active { background: var(--bg-accent); border-color: var(--border-accent); color: var(--text-accent); }
      `}</style>
      <div style={{ padding: "1rem 0 1.25rem" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "24px" }}>AI finance controller</h1>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)" }}>
          3-way reconciliation — bank, ledger, settlement
        </p>
      </div>

      <RunTrigger running={running} wsReady={wsReady} onRun={handleRun} />
      {status && <p style={{ color: "var(--text-accent)", fontSize: "14px" }}>{status}</p>}
      {error && (
        <p style={{ color: "var(--text-danger)", fontSize: "14px" }} role="alert">
          {error}
        </p>
      )}

      <RunConsole lines={lines} />
      <MetricsSummary data={metrics} />
      <QnAPanel />
      <ExceptionList items={metrics?.exceptions ?? []} />
    </main>
  );
}
