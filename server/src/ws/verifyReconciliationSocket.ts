import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachReconciliationSocket } from "./reconciliationSocket";
import type { ReconciliationRunSummary } from "../reconciliation/runReconciliation";
import type { RunEventSink } from "../reconciliation/runEvents";
import { releaseRunLock } from "../reconciliation/runLock";

async function mockRun(options?: {
  skipLlm?: boolean;
  onEvent?: RunEventSink;
}): Promise<ReconciliationRunSummary> {
  options?.onEvent?.({
    type: "run.log",
    message: "mock tier1",
    ts: Date.now(),
  });
  options?.onEvent?.({
    type: "run.progress",
    phase: "tier1",
    completed: 1,
    total: 1,
  });
  options?.onEvent?.({
    type: "run.progress",
    phase: "persist",
    completed: 1,
    total: 1,
  });
  const summary = {
    decisionsWritten: 0,
    matchRate: {
      total: 0,
      matched: 0,
      partial: 0,
      exception: 0,
      matchRate: 0,
      plainStatement: "none",
    },
    tierSplit: { tier1: 0, tier2: 0, total: 0 },
    discrepancyBreakdown: [],
    exceptions: 0,
  };
  options?.onEvent?.({ type: "run.done", summary });
  return summary;
}

async function main() {
  releaseRunLock();
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  attachReconciliationSocket(server, { run: mockRun });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };

  const events: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/reconciliation`);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "run.start", skipLlm: true }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      events.push(msg);
      if (msg.type === "run.done") {
        ws.close();
        resolve();
      }
      if (msg.type === "run.error") {
        reject(new Error(msg.message));
      }
    });
    ws.on("error", reject);
  });

  assert.ok(events.some((e: any) => e.type === "run.log"));
  assert.ok(events.some((e: any) => e.type === "run.progress"));
  assert.ok(events.some((e: any) => e.type === "run.done"));

  // Overlap: hold lock and expect RUN_IN_PROGRESS
  const { tryAcquireRunLock, releaseRunLock: release } = await import(
    "../reconciliation/runLock"
  );
  assert.equal(tryAcquireRunLock(), true);
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/reconciliation`);
    ws.on("open", () => ws.send(JSON.stringify({ type: "run.start" })));
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      try {
        assert.equal(msg.type, "run.error");
        assert.equal(msg.code, "RUN_IN_PROGRESS");
        ws.close();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    ws.on("error", reject);
  });
  release();

  server.close();
  console.log("verifyReconciliationSocket: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
