export type RunProgressPhase = "tier1" | "tier2" | "persist";

export type ReconciliationRunEvent =
  | { type: "run.log"; message: string; ts: number }
  | {
      type: "run.progress";
      phase: RunProgressPhase;
      completed: number;
      total: number;
    }
  | { type: "run.done"; summary: unknown }
  | { type: "run.error"; code: string; message: string };

export type RunEventSink = (event: ReconciliationRunEvent) => void;

export function emitLog(
  onEvent: RunEventSink | undefined,
  message: string,
): void {
  console.log(message);
  onEvent?.({ type: "run.log", message, ts: Date.now() });
}

export function emitProgress(
  onEvent: RunEventSink | undefined,
  phase: RunProgressPhase,
  completed: number,
  total: number,
): void {
  onEvent?.({ type: "run.progress", phase, completed, total });
}
