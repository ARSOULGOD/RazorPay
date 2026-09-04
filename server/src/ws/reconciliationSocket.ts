import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { runReconciliation } from "../reconciliation/runReconciliation";
import {
  tryAcquireRunLock,
  releaseRunLock,
} from "../reconciliation/runLock";
import type { RunEventSink } from "../reconciliation/runEvents";

type RunFn = typeof runReconciliation;

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachReconciliationSocket(
  server: HttpServer,
  deps?: { run?: RunFn },
): WebSocketServer {
  const run = deps?.run ?? runReconciliation;
  const wss = new WebSocketServer({ server, path: "/ws/reconciliation" });

  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      let msg: { type?: string; skipLlm?: boolean };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        send(ws, {
          type: "run.error",
          code: "BAD_MESSAGE",
          message: "Invalid JSON",
        });
        return;
      }

      if (msg.type !== "run.start") {
        send(ws, {
          type: "run.error",
          code: "UNKNOWN_TYPE",
          message: `Unsupported message type: ${String(msg.type)}`,
        });
        return;
      }

      if (!tryAcquireRunLock()) {
        send(ws, {
          type: "run.error",
          code: "RUN_IN_PROGRESS",
          message: "Reconciliation already in progress",
        });
        return;
      }

      const onEvent: RunEventSink = (event) => send(ws, event);

      try {
        await run({ skipLlm: Boolean(msg.skipLlm), onEvent });
        // runReconciliation already emits run.done via onEvent
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send(ws, { type: "run.error", code: "RUN_FAILED", message });
      } finally {
        releaseRunLock();
      }
    });
  });

  return wss;
}
