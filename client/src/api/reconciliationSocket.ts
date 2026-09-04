export type ServerRunEvent =
  | { type: "run.log"; message: string; ts: number }
  | {
      type: "run.progress";
      phase: "tier1" | "tier2" | "persist";
      completed: number;
      total: number;
    }
  | { type: "run.done"; summary: unknown }
  | { type: "run.error"; code: string; message: string };

function wsUrl(): string {
  const base = import.meta.env.VITE_API_BASE as string | undefined;
  if (base && /^https?:\/\//.test(base)) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws/reconciliation";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/reconciliation`;
}

export type ReconciliationSocket = {
  ready: boolean;
  startRun: (skipLlm: boolean) => void;
  disconnect: () => void;
};

export function openReconciliationSocket(handlers: {
  onOpen?: () => void;
  onClose?: () => void;
  onEvent: (event: ServerRunEvent) => void;
}): ReconciliationSocket {
  const ws = new WebSocket(wsUrl());
  let ready = false;

  ws.addEventListener("open", () => {
    ready = true;
    handlers.onOpen?.();
  });
  ws.addEventListener("close", () => {
    ready = false;
    handlers.onClose?.();
  });
  ws.addEventListener("message", (ev) => {
    try {
      handlers.onEvent(JSON.parse(String(ev.data)) as ServerRunEvent);
    } catch {
      handlers.onEvent({
        type: "run.error",
        code: "BAD_SERVER_MESSAGE",
        message: "Failed to parse server event",
      });
    }
  });

  return {
    get ready() {
      return ready && ws.readyState === WebSocket.OPEN;
    },
    startRun(skipLlm: boolean) {
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      ws.send(JSON.stringify({ type: "run.start", skipLlm }));
    },
    disconnect() {
      ws.close();
    },
  };
}
