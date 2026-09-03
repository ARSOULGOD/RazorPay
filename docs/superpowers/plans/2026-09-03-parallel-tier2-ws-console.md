# Parallel Tier-2 + WebSocket Run Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut full-reconcile wall-clock to under ~1 minute via concurrent Tier-2 LLM calls, and stream a live run console to the dashboard over WebSocket.

**Architecture:** Keep the existing Tier-1 → Tier-2 → atomic persist pipeline. Raise default concurrency via `LLM_CONCURRENCY` (default 10). Plumb an `onEvent` callback through `runReconciliation` / `routeReconciliation`. Attach a `ws` server on `/ws/reconciliation` with an in-process run lock. Dashboard starts runs over WebSocket and renders append-only logs; metrics refresh only on `run.done`.

**Tech Stack:** Node.js + Express 5 + TypeScript (`tsx`), `ws`, React 19 + Vite 8, Prisma (unchanged). Verification via Node `assert` + `tsx` scripts (no Jest/Vitest in this repo).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-03-parallel-tier2-ws-console-design.md` is authoritative.
- Default `LLM_CONCURRENCY=10`; if unset, fall back to `GEMINI_CONCURRENCY`; if both unset, use `10`.
- Per-candidate Tier-2 calls stay independent; do not change Groq→Gemini failover, JSON repair, or prompts.
- Persist stays atomic (`deleteMany` + `createMany` only after all decisions). No mid-run DB writes.
- Single in-process run lock; overlapping HTTP POST → 409; overlapping WS `run.start` → `run.error` `RUN_IN_PROGRESS`.
- WS disconnect does not cancel the run; v1 has no log replay.
- Dashboard full runs are fail-closed on WebSocket (require WS). CLI/`npm run reconcile` unchanged.
- No adaptive concurrency, no multi-client fan-out, no progressive metrics UI.
- Money / Prisma / ground-truth rules unchanged.

---

## File map

| File | Responsibility |
|---|---|
| `server/src/reconciliation/llmConcurrency.ts` | Resolve concurrency from env |
| `server/src/reconciliation/mapWithConcurrency.ts` | Bounded parallel map + progress hook |
| `server/src/reconciliation/runEvents.ts` | Shared `ReconciliationRunEvent` types + helpers |
| `server/src/reconciliation/runLock.ts` | In-process tryAcquire / release / isInProgress |
| `server/src/reconciliation/router.ts` | Use concurrency helper + emit events |
| `server/src/reconciliation/runReconciliation.ts` | Accept `onEvent`; emit persist / done-side events |
| `server/src/routes/reconciliation.routes.ts` | Acquire lock; 409 if busy |
| `server/src/ws/reconciliationSocket.ts` | WS upgrade on `/ws/reconciliation` |
| `server/src/index.ts` | Attach WS to HTTP server |
| `server/.env.example` | Document `LLM_CONCURRENCY` |
| `server/package.json` | Add `ws`, `@types/ws`; verify scripts |
| `client/vite.config.ts` | Proxy `/ws` with `ws: true` |
| `client/src/api/reconciliationSocket.ts` | WS client helper |
| `client/src/components/RunConsole/RunConsole.tsx` | Live log panel |
| `client/src/components/RunTrigger/RunTrigger.tsx` | Disable until WS ready |
| `client/src/App.tsx` | Wire WS run + console + metrics refresh |
| `server/src/reconciliation/verifyLlmConcurrency.ts` | Assert env resolution |
| `server/src/reconciliation/verifyMapWithConcurrency.ts` | Assert max in-flight + progress |
| `server/src/reconciliation/verifyRunLock.ts` | Assert lock rejects overlap |
| `server/src/ws/verifyReconciliationSocket.ts` | Light WS integration with mocked run |

---

### Task 1: `LLM_CONCURRENCY` resolver + env docs

**Files:**
- Create: `server/src/reconciliation/llmConcurrency.ts`
- Create: `server/src/reconciliation/verifyLlmConcurrency.ts`
- Modify: `server/.env.example`
- Modify: `server/package.json` (add `"verify:llm-concurrency"` script)

**Interfaces:**
- Consumes: `process.env.LLM_CONCURRENCY`, `process.env.GEMINI_CONCURRENCY`
- Produces: `export function resolveLlmConcurrency(env?: NodeJS.ProcessEnv): number`

- [ ] **Step 1: Write the failing verifier**

Create `server/src/reconciliation/verifyLlmConcurrency.ts`:

```typescript
import assert from "node:assert/strict";
import { resolveLlmConcurrency } from "./llmConcurrency";

assert.equal(resolveLlmConcurrency({}), 10, "default must be 10");
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "8" }), 8);
assert.equal(resolveLlmConcurrency({ GEMINI_CONCURRENCY: "3" }), 3);
assert.equal(
  resolveLlmConcurrency({ LLM_CONCURRENCY: "12", GEMINI_CONCURRENCY: "2" }),
  12,
  "LLM_CONCURRENCY wins over GEMINI_CONCURRENCY",
);
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "0" }), 10, "0 is invalid → default");
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "-1" }), 10);
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "nope" }), 10);

console.log("verifyLlmConcurrency: OK");
```

- [ ] **Step 2: Run verifier — expect FAIL**

```bash
cd server && npx tsx src/reconciliation/verifyLlmConcurrency.ts
```

Expected: `Cannot find module './llmConcurrency'` (or similar).

- [ ] **Step 3: Implement resolver**

Create `server/src/reconciliation/llmConcurrency.ts`:

```typescript
/** Resolve Tier-2 parallelism. Spec default 10; LLM_CONCURRENCY overrides GEMINI_CONCURRENCY. */
export function resolveLlmConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.LLM_CONCURRENCY ?? env.GEMINI_CONCURRENCY;
  if (raw === undefined || raw === "") return 10;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return n;
}
```

Update `server/.env.example` — replace the Gemini concurrency block with:

```bash
# Tier-2 parallel LLM calls (default 10). Target: ~1 min for ~67 candidates.
LLM_CONCURRENCY=10
# Legacy alias — used only if LLM_CONCURRENCY is unset
# GEMINI_CONCURRENCY=1
```

Add to `server/package.json` scripts:

```json
"verify:llm-concurrency": "tsx src/reconciliation/verifyLlmConcurrency.ts"
```

- [ ] **Step 4: Run verifier — expect PASS**

```bash
cd server && npm run verify:llm-concurrency
```

Expected: `verifyLlmConcurrency: OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/reconciliation/llmConcurrency.ts \
  server/src/reconciliation/verifyLlmConcurrency.ts \
  server/.env.example server/package.json
git commit -m "feat: resolve LLM_CONCURRENCY with default 10"
```

---

### Task 2: `mapWithConcurrency` helper

**Files:**
- Create: `server/src/reconciliation/mapWithConcurrency.ts`
- Create: `server/src/reconciliation/verifyMapWithConcurrency.ts`
- Modify: `server/package.json` (add verify script)

**Interfaces:**
- Consumes: none from Task 1 (pure helper)
- Produces:

```typescript
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemDone?: (info: {
    completed: number;
    total: number;
    index: number;
    result: R;
  }) => void,
): Promise<R[]>
```

- [ ] **Step 1: Write the failing verifier**

Create `server/src/reconciliation/verifyMapWithConcurrency.ts`:

```typescript
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./mapWithConcurrency";

async function main() {
  let inFlight = 0;
  let maxInFlight = 0;
  const progress: number[] = [];

  const items = Array.from({ length: 10 }, (_, i) => i);
  const results = await mapWithConcurrency(
    items,
    3,
    async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return item * 2;
    },
    ({ completed }) => {
      progress.push(completed);
    },
  );

  assert.deepEqual(results, items.map((i) => i * 2));
  assert.ok(maxInFlight <= 3, `maxInFlight=${maxInFlight} expected ≤ 3`);
  assert.ok(maxInFlight >= 2, `maxInFlight=${maxInFlight} expected some parallelism`);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // concurrency < 1 must behave like 1
  const single = await mapWithConcurrency([1, 2], 0, async (x) => x);
  assert.deepEqual(single, [1, 2]);

  console.log("verifyMapWithConcurrency: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run verifier — expect FAIL**

```bash
cd server && npx tsx src/reconciliation/verifyMapWithConcurrency.ts
```

Expected: module not found.

- [ ] **Step 3: Implement helper**

Create `server/src/reconciliation/mapWithConcurrency.ts`:

```typescript
/**
 * Run async mapper over items with a fixed concurrency cap.
 * Results preserve input order. onItemDone fires as each item finishes
 * (completion order, not input order) with a monotonic completed count.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemDone?: (info: {
    completed: number;
    total: number;
    index: number;
    result: R;
  }) => void,
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];

  const limit = Math.max(1, Math.floor(concurrency) || 1);
  const results: R[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      const result = await mapper(items[index]!, index);
      results[index] = result;
      completed += 1;
      onItemDone?.({ completed, total, index, result });
    }
  }

  const workers = Array.from({ length: Math.min(limit, total) }, () => worker());
  await Promise.all(workers);
  return results;
}
```

Add script:

```json
"verify:map-concurrency": "tsx src/reconciliation/verifyMapWithConcurrency.ts"
```

- [ ] **Step 4: Run verifier — expect PASS**

```bash
cd server && npm run verify:map-concurrency
```

Expected: `verifyMapWithConcurrency: OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/reconciliation/mapWithConcurrency.ts \
  server/src/reconciliation/verifyMapWithConcurrency.ts \
  server/package.json
git commit -m "feat: add mapWithConcurrency for Tier-2 parallelism"
```

---

### Task 3: Run event types + wire router / `runReconciliation`

**Files:**
- Create: `server/src/reconciliation/runEvents.ts`
- Modify: `server/src/reconciliation/router.ts` (concurrency + `onEvent`)
- Modify: `server/src/reconciliation/runReconciliation.ts` (`onEvent` option)
- Create: `server/src/reconciliation/verifyRouteEvents.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `resolveLlmConcurrency`, `mapWithConcurrency`
- Produces:

```typescript
// runEvents.ts
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

export function emitLog(onEvent: RunEventSink | undefined, message: string): void;
export function emitProgress(
  onEvent: RunEventSink | undefined,
  phase: RunProgressPhase,
  completed: number,
  total: number,
): void;
```

```typescript
// router.ts — extend options
export async function routeReconciliation(
  banks: BankTxnView[],
  ledgers: LedgerView[],
  settlements: SettlementView[],
  options?: { skipLlm?: boolean; onEvent?: RunEventSink },
): Promise<ReconciliationDecision[]>

// runReconciliation.ts
export async function runReconciliation(options?: {
  skipLlm?: boolean;
  onEvent?: RunEventSink;
}): Promise<ReconciliationRunSummary>
```

- [ ] **Step 1: Write failing event-emission verifier**

Create `server/src/reconciliation/verifyRouteEvents.ts`. Assert `emitLog` / `emitProgress` shapes, then call `routeReconciliation([], [], [], { skipLlm: true, onEvent })` (no LLM) and assert Tier-1 summary log + tier1 progress marker.

```typescript
import assert from "node:assert/strict";
import { emitLog, emitProgress, type ReconciliationRunEvent } from "./runEvents";
import { routeReconciliation } from "./router";

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
```

Wrap in `async function main()` with `.catch` exit 1.

- [ ] **Step 2: Run verifier — expect FAIL**

```bash
cd server && npx tsx src/reconciliation/verifyRouteEvents.ts
```

Expected: `runEvents` missing and/or `onEvent` ignored.

- [ ] **Step 3: Implement `runEvents.ts`**

```typescript
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
```

- [ ] **Step 4: Wire `router.ts`**

1. Import `resolveLlmConcurrency`, `mapWithConcurrency`, `emitLog`, `emitProgress`, `RunEventSink`.
2. Extend `options` with `onEvent?: RunEventSink`.
3. Replace the opening `console.log(...)` with:

```typescript
emitLog(
  options?.onEvent,
  `routeReconciliation: Tier-1 resolved ${tier1.length}; Tier-2 candidates ${total}`,
);
emitProgress(options?.onEvent, "tier1", 1, 1);
```

4. In `skipLlm` branch, after building exceptions, also:

```typescript
emitLog(options?.onEvent, `Tier-2 skipped (skipLlm=true); ${total} left unresolved`);
```

5. Replace the `for (let i = 0; i < candidates.length; i += concurrency)` batch loop with:

```typescript
const concurrency = resolveLlmConcurrency();
const tier2 = await mapWithConcurrency(
  candidates,
  concurrency,
  async (candidate, index) => {
    // move existing runOne body here (label, t0, resolveViaLlm, catch → EXCEPTION)
    // but do NOT increment a shared completed counter manually — use onItemDone
  },
  ({ completed, total: t, result }) => {
    const label =
      /* same label derivation from result ids or keep label inside mapper via closure */;
    const duration = result.llmDurationMs ?? 0;
    emitLog(
      options?.onEvent,
      `Tier-2 ${completed}/${t} ${label} → ${result.status} (${duration}ms)`,
    );
    emitProgress(options?.onEvent, "tier2", completed, t);
  },
);
```

Keep label construction inside the mapper return or attach to a side channel. Practical pattern: mapper returns `{ decision, label, duration }` then map to decisions:

```typescript
const tier2Wrapped = await mapWithConcurrency(
  candidates,
  concurrency,
  async (candidate, index) => {
    const label =
      candidate.ledger?.ledgerEntryId ??
      candidate.bank?.bankTxnId ??
      candidate.settlement?.settlementId ??
      `idx_${index}`;
    const t0 = Date.now();
    try {
      const decision = await resolveViaLlm(candidate);
      const duration = Date.now() - t0;
      return {
        label,
        decision: { ...decision, llmDurationMs: duration },
      };
    } catch (err) {
      const duration = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      return {
        label,
        decision: {
          status: "EXCEPTION" as const,
          confidence: 0,
          discrepancyType: null,
          reasoning: `Tier-2 API failure: ${message}`,
          bankTxnId: candidate.bank?.bankTxnId ?? null,
          ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
          settlementId: candidate.settlement?.settlementId ?? null,
          resolvedByLLM: true,
          llmDurationMs: duration,
        },
      };
    }
  },
  ({ completed, total: t, result }) => {
    const duration = result.decision.llmDurationMs ?? 0;
    emitLog(
      options?.onEvent,
      `Tier-2 ${completed}/${t} ${result.label} → ${result.decision.status} (${duration}ms)`,
    );
    emitProgress(options?.onEvent, "tier2", completed, t);
  },
);
const tier2 = tier2Wrapped.map((w) => w.decision);
return [...tier1, ...tier2];
```

Remove the old `GEMINI_CONCURRENCY` parse block and the old `completed` counter / `runOne` function.

- [ ] **Step 5: Wire `runReconciliation.ts`**

```typescript
import { emitLog, emitProgress, type RunEventSink } from "./runEvents";

export async function runReconciliation(options?: {
  skipLlm?: boolean;
  onEvent?: RunEventSink;
}): Promise<ReconciliationRunSummary> {
  // ... load rows ...
  const decisions = await routeReconciliation(
    banks.map(toBankView),
    ledgers.map(toLedgerView),
    settlements.map(toSettlementView),
    { skipLlm: options?.skipLlm, onEvent: options?.onEvent },
  );

  emitProgress(options?.onEvent, "persist", 1, 1);
  emitLog(options?.onEvent, "Persisting reconciliation decisions…");
  await persistDecisions(decisions);
  // ... build summary ...
  options?.onEvent?.({ type: "run.done", summary });
  return summary;
}
```

Note: `run.done` is emitted here so HTTP callers that pass `onEvent` also get it; the WS layer may choose to rely on this instead of emitting a second done. **WS must not double-emit `run.done`.** Spec: one `run.done` per run.

- [ ] **Step 6: Run verifier — expect PASS**

```bash
cd server && npx tsx src/reconciliation/verifyRouteEvents.ts
```

Add script `"verify:route-events": "tsx src/reconciliation/verifyRouteEvents.ts"`.

- [ ] **Step 7: Commit**

```bash
git add server/src/reconciliation/runEvents.ts \
  server/src/reconciliation/router.ts \
  server/src/reconciliation/runReconciliation.ts \
  server/src/reconciliation/verifyRouteEvents.ts \
  server/package.json
git commit -m "feat: emit reconcile run events and parallelize Tier-2"
```

---

### Task 4: In-process run lock + HTTP 409

**Files:**
- Create: `server/src/reconciliation/runLock.ts`
- Create: `server/src/reconciliation/verifyRunLock.ts`
- Modify: `server/src/routes/reconciliation.routes.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `runReconciliation`
- Produces:

```typescript
export function tryAcquireRunLock(): boolean;
export function releaseRunLock(): void;
export function isRunInProgress(): boolean;
```

- [ ] **Step 1: Write failing verifier**

```typescript
import assert from "node:assert/strict";
import {
  tryAcquireRunLock,
  releaseRunLock,
  isRunInProgress,
} from "./runLock";

assert.equal(isRunInProgress(), false);
assert.equal(tryAcquireRunLock(), true);
assert.equal(isRunInProgress(), true);
assert.equal(tryAcquireRunLock(), false, "second acquire must fail");
releaseRunLock();
assert.equal(isRunInProgress(), false);
assert.equal(tryAcquireRunLock(), true);
releaseRunLock();

console.log("verifyRunLock: OK");
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement lock**

```typescript
let locked = false;

export function tryAcquireRunLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}

export function releaseRunLock(): void {
  locked = false;
}

export function isRunInProgress(): boolean {
  return locked;
}
```

- [ ] **Step 4: Wire HTTP route**

Replace `POST /run` handler body with:

```typescript
reconciliationRouter.post("/run", async (req, res) => {
  if (!tryAcquireRunLock()) {
    res.status(409).json({
      ok: false,
      error: "Reconciliation already in progress",
      code: "RUN_IN_PROGRESS",
    });
    return;
  }
  try {
    const skipLlm = Boolean(req.body?.skipLlm);
    const summary = await runReconciliation({ skipLlm });
    res.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/reconciliation/run", message);
    res.status(500).json({ ok: false, error: message });
  } finally {
    releaseRunLock();
  }
});
```

- [ ] **Step 5: Run verifier — PASS**

```bash
cd server && npx tsx src/reconciliation/verifyRunLock.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/src/reconciliation/runLock.ts \
  server/src/reconciliation/verifyRunLock.ts \
  server/src/routes/reconciliation.routes.ts \
  server/package.json
git commit -m "feat: reject overlapping reconciliation runs with 409"
```

---

### Task 5: WebSocket server + Vite proxy

**Files:**
- Create: `server/src/ws/reconciliationSocket.ts`
- Create: `server/src/ws/verifyReconciliationSocket.ts`
- Modify: `server/src/index.ts`
- Modify: `client/vite.config.ts`
- Modify: `server/package.json` (deps `ws`, `@types/ws`)

**Interfaces:**
- Consumes: `tryAcquireRunLock`, `releaseRunLock`, `runReconciliation`, event types
- Produces: `export function attachReconciliationSocket(server: HttpServer, deps?: { run?: typeof runReconciliation }): WebSocketServer`

Wire protocol (exact):

Client → server: `{ "type": "run.start", "skipLlm"?: boolean }`  
Server → client: `run.log` | `run.progress` | `run.done` | `run.error`

- [ ] **Step 1: Install deps**

```bash
cd server && npm install ws && npm install -D @types/ws
```

- [ ] **Step 2: Write failing WS verifier**

Create `server/src/ws/verifyReconciliationSocket.ts`:

```typescript
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
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `attachReconciliationSocket`**

```typescript
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
```

- [ ] **Step 5: Attach in `index.ts`**

Change listen setup so the `http.Server` is available before validation callback:

```typescript
import { attachReconciliationSocket } from "./ws/reconciliationSocket";

const server = app.listen(port, async () => {
  try {
    await validateStartup();
    console.log(`✓ AI Finance Controller API listening on http://localhost:${port}`);
  } catch (err) {
    console.error("Startup validation failed:", err);
    server.close(() => process.exit(1));
  }
});

attachReconciliationSocket(server);
```

- [ ] **Step 6: Vite proxy**

In `client/vite.config.ts`:

```typescript
proxy: {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
  "/ws": {
    target: "ws://localhost:3001",
    ws: true,
  },
},
```

- [ ] **Step 7: Run WS verifier — PASS**

```bash
cd server && npx tsx src/ws/verifyReconciliationSocket.ts
```

Add `"verify:ws-reconcile": "tsx src/ws/verifyReconciliationSocket.ts"`.

- [ ] **Step 8: Commit**

```bash
git add server/src/ws/reconciliationSocket.ts \
  server/src/ws/verifyReconciliationSocket.ts \
  server/src/index.ts \
  client/vite.config.ts \
  server/package.json server/package-lock.json
git commit -m "feat: stream reconciliation progress over WebSocket"
```

---

### Task 6: Dashboard RunConsole + WS-driven run

**Files:**
- Create: `client/src/api/reconciliationSocket.ts`
- Create: `client/src/components/RunConsole/RunConsole.tsx`
- Modify: `client/src/components/RunTrigger/RunTrigger.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: WS protocol from Task 5
- Produces: `connectReconciliationSocket(handlers)` returning `{ startRun, disconnect, ready }`

- [ ] **Step 1: WS client helper**

Create `client/src/api/reconciliationSocket.ts`:

```typescript
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
```

- [ ] **Step 2: `RunConsole` component**

```tsx
// client/src/components/RunConsole/RunConsole.tsx
type Props = { lines: string[] };

export function RunConsole({ lines }: Props) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ margin: "0 0 0.5rem" }}>Run console</h2>
      <pre
        style={{
          margin: 0,
          padding: "0.75rem",
          maxHeight: 280,
          overflow: "auto",
          background: "#0f1a16",
          color: "#c8e6d0",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          borderRadius: 4,
        }}
      >
        {lines.length === 0 ? "Waiting for a run…" : lines.join("\n")}
      </pre>
    </section>
  );
}
```

- [ ] **Step 3: Update `RunTrigger`**

Add `wsReady: boolean` prop; disable buttons when `running || !wsReady`; show a short hint when WS is down:

```tsx
type Props = {
  running: boolean;
  wsReady: boolean;
  onRun: (skipLlm: boolean) => void;
};

// buttons: disabled={running || !wsReady}
// hint: {!wsReady && <p>Connecting to run channel…</p>}
```

- [ ] **Step 4: Wire `App.tsx`**

Replace HTTP `runReconciliation` for dashboard runs with WS:

1. State: `lines: string[]`, `wsReady: boolean`, keep `running` / `status` / `error` / `metrics`.
2. `useEffect` opens `openReconciliationSocket`:
   - `onOpen` → `setWsReady(true)`
   - `onClose` → `setWsReady(false)`; if `running`, set status to “Disconnected — run may still be finishing on the server”
   - `onEvent`:
     - `run.log` → append `message` to `lines`
     - `run.progress` → set status e.g. `Tier-2 ${completed}/${total}` when phase is `tier2`, else phase name
     - `run.done` → `setRunning(false)`, `setStatus("Done.")`, `refresh()`
     - `run.error` → `setRunning(false)`, `setError(message)`
3. `handleRun(skipLlm)`:
   - clear error/lines; `setRunning(true)`
   - `socket.startRun(skipLlm)` (catch → setError)
4. Cleanup: `disconnect()` on unmount.
5. Render `<RunConsole lines={lines} />` under status/error.
6. Remove use of HTTP `runReconciliation` from `App` (keep function in `client.ts` for other callers if any).

Auto-scroll: optional `useEffect` on `lines` scrolling the `<pre>` via ref — include a small ref scrollIntoView on the last line.

- [ ] **Step 5: Manual smoke (dev)**

```bash
# terminal 1
cd server && npm run dev
# terminal 2
cd client && npm run dev
```

Open http://localhost:5173 — confirm “Connecting…” clears, Run enables, Tier-1-only run streams logs and updates metrics.

- [ ] **Step 6: Commit**

```bash
git add client/src/api/reconciliationSocket.ts \
  client/src/components/RunConsole/RunConsole.tsx \
  client/src/components/RunTrigger/RunTrigger.tsx \
  client/src/App.tsx
git commit -m "feat: live WebSocket run console on dashboard"
```

---

### Task 7: Full verification gate

**Files:**
- Modify: `server/package.json` (optional aggregate script)
- Modify: `ROADMAP.md` only if a checkbox already exists for this work — otherwise skip docs churn

- [ ] **Step 1: Run all automated verifiers**

```bash
cd server && npm run verify:llm-concurrency \
  && npm run verify:map-concurrency \
  && npm run verify:route-events \
  && npx tsx src/reconciliation/verifyRunLock.ts \
  && npm run verify:ws-reconcile
```

(Add `"verify:run-lock"` if not added in Task 4; ensure all scripts exist.)

Expected: all print `OK`.

- [ ] **Step 2: CLI still works**

```bash
cd server && npm run reconcile:tier1
```

Expected: JSON summary; no WebSocket required.

- [ ] **Step 3: Manual full reconcile (keys required)**

With `LLM_CONCURRENCY=10` in `server/.env`, run full reconcile from dashboard (or `npm run reconcile`). Confirm:
- Wall-clock under ~1 minute when rate limits allow
- Live console lines appear during Tier-2
- Metrics update only at end
- Second Run while busy → error / disabled behavior

- [ ] **Step 4: Commit any leftover script/doc fixes**

```bash
git add -A server/package.json
git commit -m "chore: add reconcile concurrency verify scripts" || true
```

Only commit if there are real leftover changes.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `LLM_CONCURRENCY` default 10 + GEMINI fallback | Task 1 |
| Parallel independent Tier-2 | Tasks 2–3 |
| `onEvent` through run/router | Task 3 |
| Atomic persist unchanged | Task 3 (persist after decisions) |
| Run lock + HTTP 409 | Task 4 |
| WebSocket `/ws/reconciliation` protocol | Task 5 |
| Vite WS proxy | Task 5 |
| Live RunConsole + fail-closed WS UI | Task 6 |
| Metrics refresh on `run.done` only | Task 6 |
| Unit: concurrency / lock / WS mock | Tasks 2, 4, 5 |
| CLI unchanged | Task 7 |
| Non-goals (adaptive, replay, progressive DB) | Not planned |

No TBD placeholders. Types aligned: `RunEventSink`, `run.start` / `run.log` / `run.progress` / `run.done` / `run.error`, `RUN_IN_PROGRESS`.
