import assert from "node:assert/strict";
import { emitLog, emitProgress, type ReconciliationRunEvent } from "./runEvents";
import { routeReconciliation } from "./router";

async function main() {
  const events: ReconciliationRunEvent[] = [];
  const sink = (e: ReconciliationRunEvent) => events.push(e);

  emitLog(sink, "hello");
  assert.equal(events[0]?.type, "run.log");
  if (events[0]?.type === "run.log") {
    assert.equal(events[0].message, "hello");
    assert.equal(typeof events[0].ts, "number");
  }

  emitProgress(sink, "tier2", 3, 10);
  assert.equal(events[1]?.type, "run.progress");
  if (events[1]?.type === "run.progress") {
    assert.deepEqual(
      { phase: events[1].phase, completed: events[1].completed, total: events[1].total },
      { phase: "tier2", completed: 3, total: 10 },
    );
  }

  // Empty inputs: Tier-1 0, Tier-2 0, skipLlm path still emits opening log + progress
  events.length = 0;
  const decisions = await routeReconciliation([], [], [], {
    skipLlm: true,
    onEvent: sink,
  });
  assert.equal(decisions.length, 0);
  assert.ok(
    events.some((e) => e.type === "run.log" && e.message.includes("Tier-1")),
    "expected Tier-1 summary log",
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === "run.progress" &&
        e.phase === "tier1" &&
        e.completed === 1 &&
        e.total === 1,
    ),
    "expected tier1 progress marker",
  );

  console.log("verifyRouteEvents: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
