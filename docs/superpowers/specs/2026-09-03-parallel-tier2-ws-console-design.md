# Parallel Tier-2 + WebSocket Run Console — Design

**Date:** 2026-09-03  
**Status:** Approved for planning (brainstorming)  
**Scope:** Cut full-reconcile wall-clock time and show a live run console on the dashboard.

Companion to `ARCHITECTURE.md` / `ROADMAP.md`. Does not change Tier-1 matching rules, LLM prompt/failover semantics, or atomic persist behavior.

---

## 1. Problem

Dashboard `POST /api/reconciliation/run` is a blocking request. The UI shows a static “may take several minutes” status until the entire pass finishes. Server progress exists only in `console.log`.

The real bottleneck is sequential Tier-2 LLM calls. `routeReconciliation` already batches with `Promise.all`, but `GEMINI_CONCURRENCY` defaults to **1**. For ~67 independent candidates at ~7s each, wall-clock is ~8 minutes of LLM time alone. A progress bar alone does not fix that.

---

## 2. Goals / non-goals

**Goals**
- Full reconcile wall-clock **under ~1 minute** on the seeded ~67 Tier-2 batch when API keys and free-tier rate limits cooperate.
- Raise safe default concurrency for independent Tier-2 calls (`LLM_CONCURRENCY`, default **10**).
- Live **WebSocket** run console on the dashboard streaming the same progress lines as the server terminal.
- Single-run lock so a second start does not wipe an in-flight run.
- Keep CLI / `POST /api/reconciliation/run` working for non-UI callers.

**Non-goals**
- Adaptive / auto-tuning concurrency.
- Mid-run progressive DB writes or live metrics updates.
- Log replay buffer for clients that disconnect mid-run.
- Multi-client fan-out of one shared run.
- Replacing `npm run reconcile` CLI.
- Changing Groq→Gemini failover, JSON repair, or decision taxonomy.

---

## 3. Architecture

Two knobs, one wire:

1. **Parallel Tier-2** — Env `LLM_CONCURRENCY` (default 10). Fall back to `GEMINI_CONCURRENCY` if unset for compatibility. Existing slice/`Promise.all` loop in `routeReconciliation` stays; only default and naming change. Per-candidate calls remain independent; retries/failover unchanged.

2. **WebSocket run channel** — Attach `ws` to the same HTTP server (:3001). Path: `/ws/reconciliation`. Dashboard starts runs and receives log/progress/done/error events over the socket.

3. **Single-run lock** — In-process boolean/mutex. Concurrent `run.start` → error; overlapping HTTP `POST /run` → **409**.

4. **Atomic persist unchanged** — `deleteMany` + `createMany` only after all decisions are ready. Metrics/exceptions refresh on the client only after `run.done`.

```
Client (React)
  │  WebSocket /ws/reconciliation
  │  run.start → run.log / run.progress → run.done | run.error
  ▼
Express HTTP + ws upgrade (:3001)
  │  run lock
  ▼
runReconciliation({ skipLlm, onEvent })
  ├─ Tier-1 exact matches
  ├─ Tier-2 batches (LLM_CONCURRENCY)
  └─ persistDecisions (atomic)
```

---

## 4. Components

### Server

| Piece | Role |
|---|---|
| `runReconciliation` | Accept optional `onEvent(event)`; forward progress/logs from router |
| `reconciliation/router.ts` | Read `LLM_CONCURRENCY` (fallback `GEMINI_CONCURRENCY`); emit progress after each candidate |
| `ws/reconciliationSocket.ts` | WS upgrade, lock, map messages → `runReconciliation`, push events to that client |
| `POST /api/reconciliation/run` | Keep summary JSON for CLI/compat; share the same lock (409 if busy) |

### Client

| Piece | Role |
|---|---|
| `RunConsole` | Monospace append-only log panel; auto-scroll; clear on new run |
| `RunTrigger` | Start via WebSocket (fail-closed: require WS for dashboard full runs) |
| `App` | Status line with progress count while running; refresh metrics on `run.done` |

### Env

- `.env.example`: document `LLM_CONCURRENCY=10`; keep `GEMINI_CONCURRENCY` noted as legacy alias/fallback.

---

## 5. Data flow

### Happy path

1. Client opens WebSocket to `/ws/reconciliation` (Vite proxy in dev).
2. User clicks Run → `{ type: "run.start", skipLlm?: boolean }`.
3. Server acquires lock → Tier-1 → emits:
   - `run.log` — e.g. “Tier-1 resolved N; Tier-2 candidates M”
   - `run.progress` — `{ phase: "tier1", completed: 1, total: 1 }` (phase marker; N/M stay in the log line)
4. Tier-2 in batches of `LLM_CONCURRENCY` → each completion emits:
   - `run.log` — same text as today’s console line (`Tier-2 k/total label → status (durationMs)`)
   - `run.progress` — `{ phase: "tier2", completed: k, total: M }` where M is Tier-2 candidate count
5. Persist → `run.progress` `{ phase: "persist", completed: 1, total: 1 }` → `run.done` `{ summary }` → release lock.
6. Client calls existing metrics endpoints once on `done`.

If `skipLlm` is true, skip step 4 (emit a log that Tier-2 was skipped) and go to persist.

### Wire protocol (JSON text frames)

**Client → server**
- `{ "type": "run.start", "skipLlm"?: boolean }`

**Server → client**
- `{ "type": "run.log", "message": string, "ts": number }`
- `{ "type": "run.progress", "phase": "tier1" | "tier2" | "persist", "completed": number, "total": number }`
- `{ "type": "run.done", "summary": object }` — same shape as today’s HTTP summary
- `{ "type": "run.error", "code": string, "message": string }`

---

## 6. Error handling

| Case | Behavior |
|---|---|
| Second run while locked | WS: `run.error` `{ code: "RUN_IN_PROGRESS" }`; HTTP POST: **409** |
| Per-candidate LLM failure | Existing EXCEPTION decision; still emit log; run continues |
| Fatal run failure | `run.error`; release lock; **no** partial persist |
| WS disconnect mid-run | Run **continues** server-side; v1 has **no** replay buffer; UI shows disconnected / “run may still be finishing” |
| Rate-limit storms | Existing retry/failover only; concurrency stays fixed |

---

## 7. Testing & success criteria

**Success**
- Wall-clock under ~1 minute on seeded ~67 Tier-2 batch when keys/limits allow (`LLM_CONCURRENCY≈10`).
- Dashboard live console shows server-style progress lines during the run.
- Metrics/exceptions update only after `run.done`.
- Overlapping starts are rejected.

**Automated**
- Unit: concurrency batching with mock `resolveViaLlm` (e.g. 10 candidates, concurrency 3 → max in-flight ≤ 3; event counts).
- Unit: run lock rejects overlapping starts.
- Light integration: WS `run.start` → `progress`/`log`/`done` with mocked LLM.

**Manual**
- One full live run (Groq/Gemini): confirm stream + timing when limits allow.
- Second Run while busy is rejected.
- CLI `npm run reconcile` still works without WebSocket.

---

## 8. Implementation order (for planning)

1. `LLM_CONCURRENCY` default 10 + env/docs; verify wall-clock drop with mocked or live LLM.
2. `onEvent` plumbing through `runReconciliation` / router (console + callback).
3. In-process run lock on HTTP POST.
4. WebSocket server module + Vite proxy.
5. Client `RunConsole` + wire `RunTrigger`/`App` to WS.
6. Tests above; manual gate.

---

## 9. Open follow-ups (explicitly deferred)

- Adaptive concurrency on 429 patterns.
- Replay buffer / run status endpoint for reconnect.
- Persist-as-you-go + progressive metrics UI.
