# Phase 2 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 2 by aligning taxonomy with generators, wiring taxonomy id constants, implementing wipe-and-reseed `seedDatabase.ts` with fixed quotas and blunt ABORTs, writing ground truth, and proving the 2.5 DB gate.

**Architecture:** Single orchestrator (`seedDatabase.ts`) generates 75 seeded true events, assigns fixed taxonomy quotas via Mulberry32(`SEED+1`) shuffle, calls the nine discrepancy generators, wipes Postgres source tables, inserts rows, writes `ground-truth/event-mapping.json`, then hard-fails on any integrity violation.

**Tech Stack:** Node.js + TypeScript + Express server package, Prisma 6 + PostgreSQL (`aifc_postgres`), `ts-node`, existing `data-generation/` modules. No new LLM/agent frameworks. No Jest — verification uses Node `assert` via `ts-node` scripts and live DB queries after seed.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-phase2-remediation-design.md` is authoritative for this work.
- Decision doc D7/D9: no FKs; Docker Postgres only — never `prisma dev` fallback.
- Amounts: string N.NN / integer paise — never JS float money math.
- Ground truth: write only via seed; recon must never read it.
- Blunt errors: throw + non-zero exit; no catch-and-continue; message prefix `seedDatabase ABORT:`.
- Defaults: `EVENT_COUNT = 75`, `SEED = 42`, assignment shuffle seed = `SEED + 1`.
- Orphan quota: exactly **6** `trueOrphan` slots; post-seed abort if orphan mapping count `< 6`.
- Do not start Phase 3 in this plan.

---

## File map

| File | Responsibility |
|---|---|
| `server/src/data-generation/taxonomy.ts` | Expand `affectedTables`; export `TAXONOMY_IDS` |
| `server/src/data-generation/discrepancies/*.ts` (9) | Set `discrepancyType` from `TAXONOMY_IDS` |
| `server/src/data-generation/discrepancies/types.ts` | Already exists — must be git-tracked |
| `server/src/data-generation/seedDatabase.ts` | Wipe → generate → assign → inject → persist → ground truth → blunt asserts |
| `server/package.json` | Add `"seed"` script |
| `ground-truth/event-mapping.json` | Rewritten by seed (not hand-edited) |
| `server/src/data-generation/verifyTaxonomyAlignment.ts` | One-shot assert script for Task 1 (taxonomy vs expected tables) |

---

### Task 1: Taxonomy `affectedTables` + `TAXONOMY_IDS`

**Files:**
- Create: `server/src/data-generation/verifyTaxonomyAlignment.ts`
- Modify: `server/src/data-generation/taxonomy.ts`
- Test: run verify script with `ts-node`

**Interfaces:**
- Consumes: existing `DISCREPANCY_TAXONOMY`, `DiscrepancyTaxonomyId`
- Produces: `export const TAXONOMY_IDS: { readonly [K in DiscrepancyTaxonomyId]: K }` (or equivalent) used by all generators and seed

- [ ] **Step 1: Write the failing alignment verifier**

Create `server/src/data-generation/verifyTaxonomyAlignment.ts`:

```typescript
import assert from "node:assert/strict";
import { DISCREPANCY_TAXONOMY_BY_ID } from "./taxonomy";

function has(id: keyof typeof DISCREPANCY_TAXONOMY_BY_ID, table: string) {
  return DISCREPANCY_TAXONOMY_BY_ID[id].affectedTables.includes(table as never);
}

// Spec §4 — these MUST include the expanded tables
assert.equal(has("settlementLag", "SettlementRecord"), true, "settlementLag must include SettlementRecord");
assert.equal(has("feeDeduction", "BankTransaction"), true, "feeDeduction must include BankTransaction");
assert.equal(
  has("partialCapture", "BankTransaction") && has("partialCapture", "SettlementRecord"),
  true,
  "partialCapture must include Bank + Settlement",
);
assert.equal(DISCREPANCY_TAXONOMY_BY_ID.trueOrphan.isOrphan, true);
for (const e of Object.values(DISCREPANCY_TAXONOMY_BY_ID)) {
  if (e.id !== "trueOrphan") assert.equal(e.isOrphan, false, `${e.id} must not be orphan`);
}

console.log("verifyTaxonomyAlignment: OK");
```

- [ ] **Step 2: Run verifier — expect FAIL**

```bash
cd server && npx ts-node src/data-generation/verifyTaxonomyAlignment.ts
```

Expected: AssertionError on settlementLag / feeDeduction / partialCapture (current taxonomy lacks expanded tables).

- [ ] **Step 3: Update `taxonomy.ts`**

1. Change `affectedTables` for:
   - `settlementLag` → `["BankTransaction", "LedgerEntry", "SettlementRecord"]`
   - `feeDeduction` → `["SettlementRecord", "LedgerEntry", "BankTransaction"]`
   - `partialCapture` → `["LedgerEntry", "BankTransaction", "SettlementRecord"]`
2. Add after `DISCREPANCY_TAXONOMY_BY_ID`:

```typescript
/** Stable id constants — generators must use these, not raw strings. */
export const TAXONOMY_IDS = {
  exactMatch: "exactMatch",
  settlementLag: "settlementLag",
  feeDeduction: "feeDeduction",
  partialCapture: "partialCapture",
  splitPayment: "splitPayment",
  manyToOne: "manyToOne",
  duplicateEntry: "duplicateEntry",
  currencyRounding: "currencyRounding",
  trueOrphan: "trueOrphan",
} as const satisfies { readonly [K in DiscrepancyTaxonomyId]: K };
```

- [ ] **Step 4: Re-run verifier — expect OK**

```bash
cd server && npx ts-node src/data-generation/verifyTaxonomyAlignment.ts
```

Expected: `verifyTaxonomyAlignment: OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/data-generation/taxonomy.ts server/src/data-generation/verifyTaxonomyAlignment.ts
git commit -m "fix(taxonomy): expand affectedTables and export TAXONOMY_IDS"
```

---

### Task 2: Generators use `TAXONOMY_IDS` + track `types.ts`

**Files:**
- Modify: all nine files under `server/src/data-generation/discrepancies/` that set `discrepancyType`
- Ensure tracked: `server/src/data-generation/discrepancies/types.ts`

**Interfaces:**
- Consumes: `TAXONOMY_IDS` from `../taxonomy`
- Produces: each generator still `(event: TrueEvent, indexSeed: number) => DiscrepancyGenerationResult` with `discrepancyType: TAXONOMY_IDS.<id>`

- [ ] **Step 1: Update each generator**

In every generator file, add:

```typescript
import { TAXONOMY_IDS } from "../taxonomy";
```

Replace the string literal return field, e.g.:

| File | Change |
|---|---|
| `exactMatch.ts` | `discrepancyType: TAXONOMY_IDS.exactMatch` |
| `settlementLag.ts` | `discrepancyType: TAXONOMY_IDS.settlementLag` |
| `feeDeduction.ts` | `discrepancyType: TAXONOMY_IDS.feeDeduction` |
| `partialCapture.ts` | `discrepancyType: TAXONOMY_IDS.partialCapture` |
| `duplicateEntry.ts` | `discrepancyType: TAXONOMY_IDS.duplicateEntry` |
| `currencyRounding.ts` | `discrepancyType: TAXONOMY_IDS.currencyRounding` |
| `splitPayment.ts` | `discrepancyType: TAXONOMY_IDS.splitPayment` |
| `manyToOne.ts` | `discrepancyType: TAXONOMY_IDS.manyToOne` |
| `trueOrphan.ts` | `discrepancyType: TAXONOMY_IDS.trueOrphan` |

Do not change generation logic otherwise.

- [ ] **Step 2: Smoke one generator**

```bash
cd server && npx ts-node -e "
import { generateTrueEvents } from './src/data-generation/generateTrueEvents';
import { generateFeeDeduction } from './src/data-generation/discrepancies/feeDeduction';
import { TAXONOMY_IDS } from './src/data-generation/taxonomy';
const e = generateTrueEvents(1, 42)[0];
const r = generateFeeDeduction(e, 0);
if (r.discrepancyType !== TAXONOMY_IDS.feeDeduction) throw new Error('bad type');
console.log('smoke OK', r.discrepancyType, r.settlementRows[0].netAmount);
"
```

Expected: `smoke OK feeDeduction <net string>`

- [ ] **Step 3: Commit (include untracked types.ts)**

```bash
git add server/src/data-generation/discrepancies/
git commit -m "refactor(discrepancies): use TAXONOMY_IDS; track types.ts"
```

---

### Task 3: Implement `seedDatabase.ts` (orchestrator + blunt ABORTs)

**Files:**
- Modify: `server/src/data-generation/seedDatabase.ts` (replace stub)
- Modify: `server/package.json` (add seed script)

**Interfaces:**
- Consumes:
  - `generateTrueEvents(count, seed)`
  - all nine `generate*` functions
  - `TAXONOMY_IDS`, `DiscrepancyTaxonomyId`
  - `prisma` from `../db/prisma`
- Produces: side effects — wiped+seeded DB, rewritten `../ground-truth/event-mapping.json`, stdout gate summary; process exit 0 only on full success

- [ ] **Step 1: Add npm script**

In `server/package.json` scripts:

```json
"seed": "ts-node src/data-generation/seedDatabase.ts"
```

- [ ] **Step 2: Implement `seedDatabase.ts`**

Replace the stub with a complete file that follows this structure (implement fully — no placeholders):

```typescript
import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma";
import { generateTrueEvents } from "./generateTrueEvents";
import { TAXONOMY_IDS, type DiscrepancyTaxonomyId } from "./taxonomy";
import { generateExactMatch } from "./discrepancies/exactMatch";
import { generateSettlementLag } from "./discrepancies/settlementLag";
import { generateFeeDeduction } from "./discrepancies/feeDeduction";
import { generatePartialCapture } from "./discrepancies/partialCapture";
import { generateSplitPayment } from "./discrepancies/splitPayment";
import { generateManyToOne } from "./discrepancies/manyToOne";
import { generateDuplicateEntry } from "./discrepancies/duplicateEntry";
import { generateCurrencyRounding } from "./discrepancies/currencyRounding";
import { generateTrueOrphan } from "./discrepancies/trueOrphan";
import type { DiscrepancyGenerationResult } from "./discrepancies/types";

const EVENT_COUNT = 75;
const SEED = 42;

const QUOTAS: Record<DiscrepancyTaxonomyId, number> = {
  exactMatch: 20,
  settlementLag: 8,
  feeDeduction: 8,
  partialCapture: 7,
  splitPayment: 6,
  manyToOne: 6,
  duplicateEntry: 6,
  currencyRounding: 8,
  trueOrphan: 6,
};

const GENERATORS: Record<
  DiscrepancyTaxonomyId,
  (event: ReturnType<typeof generateTrueEvents>[number], indexSeed: number) => DiscrepancyGenerationResult
> = {
  exactMatch: generateExactMatch,
  settlementLag: generateSettlementLag,
  feeDeduction: generateFeeDeduction,
  partialCapture: generatePartialCapture,
  splitPayment: generateSplitPayment,
  manyToOne: generateManyToOne,
  duplicateEntry: generateDuplicateEntry,
  currencyRounding: generateCurrencyRounding,
  trueOrphan: generateTrueOrphan,
};

function abort(message: string): never {
  throw new Error(`seedDatabase ABORT: ${message}`);
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAssignments(): DiscrepancyTaxonomyId[] {
  const ids = Object.keys(TAXONOMY_IDS) as DiscrepancyTaxonomyId[];
  for (const id of ids) {
    if (!(id in QUOTAS)) abort(`quota map missing ${id}`);
  }
  const sum = ids.reduce((acc, id) => acc + QUOTAS[id], 0);
  if (sum !== EVENT_COUNT) abort(`quota sum ${sum} !== EVENT_COUNT ${EVENT_COUNT} — fix the table, do not run`);

  const slots: DiscrepancyTaxonomyId[] = [];
  for (const id of ids) {
    for (let i = 0; i < QUOTAS[id]; i++) slots.push(id);
  }

  const rng = createSeededRng(SEED + 1);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots;
}

type MappingEvent = {
  eventId: string;
  discrepancyType: DiscrepancyTaxonomyId;
  bankTxnIds: string[];
  ledgerEntryIds: string[];
  settlementIds: string[];
};

async function main() {
  if (!process.env.DATABASE_URL) {
    abort("DATABASE_URL missing in server/.env");
  }

  const assignments = buildAssignments();
  const events = generateTrueEvents(EVENT_COUNT, SEED);
  assert.equal(events.length, EVENT_COUNT);

  const results: DiscrepancyGenerationResult[] = [];
  const mappingEvents: MappingEvent[] = [];

  for (let i = 0; i < EVENT_COUNT; i++) {
    const event = events[i]!;
    const assigned = assignments[i]!;
    const gen = GENERATORS[assigned];
    if (!gen) abort(`no generator for ${assigned}`);
    const result = gen(event, i);
    if (result.discrepancyType !== assigned) {
      abort(
        `generator type mismatch eventId=${event.eventId} expected=${assigned} actual=${result.discrepancyType}`,
      );
    }
    results.push(result);
    mappingEvents.push({
      eventId: event.eventId,
      discrepancyType: result.discrepancyType,
      bankTxnIds: result.bankRows.map((r) => r.bankTxnId),
      ledgerEntryIds: result.ledgerRows.map((r) => r.ledgerEntryId),
      settlementIds: result.settlementRows.map((r) => r.settlementId),
    });
  }

  // Blunt orphan structure check before touching DB
  const orphanMappings = mappingEvents.filter((e) => e.discrepancyType === TAXONOMY_IDS.trueOrphan);
  if (orphanMappings.length < 6) {
    abort(`orphan count ${orphanMappings.length} < 6 — Phase 2 gate fails, do not proceed to Phase 3`);
  }
  for (const o of orphanMappings) {
    const nonempty = [o.bankTxnIds, o.ledgerEntryIds, o.settlementIds].filter((a) => a.length > 0);
    if (nonempty.length !== 1) {
      abort(`corrupt orphan eventId=${o.eventId}: expected exactly one non-empty id array`);
    }
  }

  try {
    await prisma.$connect();
  } catch (err) {
    abort(`Prisma connect failed: ${String(err)} — Is aifc_postgres Up (healthy)?`);
  }

  // Wipe
  await prisma.reconciliationResult.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.settlementRecord.deleteMany();

  const bankRows = results.flatMap((r) => r.bankRows);
  const ledgerRows = results.flatMap((r) => r.ledgerRows);
  const settlementRows = results.flatMap((r) => r.settlementRows);

  const bankCreate = await prisma.bankTransaction.createMany({ data: bankRows });
  const ledgerCreate = await prisma.ledgerEntry.createMany({ data: ledgerRows });
  const settlementCreate = await prisma.settlementRecord.createMany({
    data: settlementRows,
  });

  if (bankCreate.count !== bankRows.length) {
    abort(`bank insert count ${bankCreate.count} !== flattened ${bankRows.length}`);
  }
  if (ledgerCreate.count !== ledgerRows.length) {
    abort(`ledger insert count ${ledgerCreate.count} !== flattened ${ledgerRows.length}`);
  }
  if (settlementCreate.count !== settlementRows.length) {
    abort(`settlement insert count ${settlementCreate.count} !== flattened ${settlementRows.length}`);
  }

  const groundTruthPath = path.resolve(process.cwd(), "../ground-truth/event-mapping.json");
  if (!fs.existsSync(path.dirname(groundTruthPath))) {
    abort(`ground-truth directory missing at ${path.dirname(groundTruthPath)}`);
  }

  const payload = {
    seed: SEED,
    count: EVENT_COUNT,
    generatedAt: new Date().toISOString(),
    events: mappingEvents,
  };

  try {
    fs.writeFileSync(groundTruthPath, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    abort(`ground-truth write failed: ${String(err)}`);
  }

  // Gate summary
  const counts: Record<string, number> = {};
  for (const e of mappingEvents) {
    counts[e.discrepancyType] = (counts[e.discrepancyType] ?? 0) + 1;
  }
  console.log("seedDatabase: OK");
  console.log("counts:", counts);
  console.log(
    "orphan samples:",
    orphanMappings.slice(0, 3).map((o) => ({
      eventId: o.eventId,
      bankTxnIds: o.bankTxnIds,
      ledgerEntryIds: o.ledgerEntryIds,
      settlementIds: o.settlementIds,
    })),
  );
  const sampleTypes: DiscrepancyTaxonomyId[] = [
    TAXONOMY_IDS.feeDeduction,
    TAXONOMY_IDS.settlementLag,
    TAXONOMY_IDS.exactMatch,
  ];
  for (const t of sampleTypes) {
    const sample = mappingEvents.find((e) => e.discrepancyType === t);
    console.log(`sample ${t}:`, sample);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Path note for implementer:** Use exactly:

```typescript
const groundTruthPath = path.resolve(process.cwd(), "../ground-truth/event-mapping.json");
if (!fs.existsSync(path.dirname(groundTruthPath))) {
  abort(`ground-truth directory missing at ${path.dirname(groundTruthPath)}`);
}
```

Do not leave both `groundTruthPath` and `groundTruthPathFixed` in the final file — one correct path only.

- [ ] **Step 3: Ensure deps + Prisma client**

```bash
cd server && npm install && npx prisma generate
```

Expected: install succeeds; client generated.

- [ ] **Step 4: Commit**

```bash
git add server/src/data-generation/seedDatabase.ts server/package.json
git commit -m "feat(seed): wipe-reseed orchestrator with fixed quotas and blunt aborts"
```

---

### Task 4: Run seed + Phase 2.5 gate (real DB proof)

**Files:**
- Runtime: Postgres + `ground-truth/event-mapping.json`
- No new source files required

**Interfaces:**
- Consumes: working `npm run seed`
- Produces: gate evidence pasted for humans (orphan rows + 2–3 other categories)

- [ ] **Step 1: Confirm Docker Postgres**

```bash
docker ps --filter name=aifc_postgres --format '{{.Names}} {{.Status}}'
```

Expected: `aifc_postgres Up ... (healthy)` (or at least Up). If missing:

```bash
cd /home/arnav-rinawa/Documents/Backend/RazorPay/RazorPay && docker compose up -d
```

If Docker is unavailable: **STOP** — do not invent an alternate DB. Report the exact error.

- [ ] **Step 2: Run seed**

```bash
cd server && npm run seed
```

Expected stdout includes `seedDatabase: OK`, counts with `trueOrphan: 6`, and sample lines. Exit code 0.  
Any `seedDatabase ABORT:` → fix cause; do not proceed.

- [ ] **Step 3: Verify mapping file**

```bash
node -e "const m=require('../ground-truth/event-mapping.json'); console.log(m.count, m.events.filter(e=>e.discrepancyType==='trueOrphan').length); if(m.count!==75) process.exit(1);"
```

Run from `server/`. Expected: `75 6`

- [ ] **Step 4: Query real orphan + other category rows**

Using `npx ts-node` + prisma (or `docker exec` + `psql`), fetch and **paste into the session**:

1. At least **3** orphan rows (null link fields; matching mapping IDs)
2. At least one **feeDeduction** settlement row where `netAmount < grossAmount` and fee/tax > 0
3. At least one **settlementLag** pair showing bank date = ledger date + 2 days
4. Optionally one **exactMatch** trio with equal amounts/dates

Example prisma snippet:

```typescript
import { prisma } from "./src/db/prisma";
import mapping from "../ground-truth/event-mapping.json";

async function gate() {
  const orphans = mapping.events.filter((e) => e.discrepancyType === "trueOrphan");
  for (const o of orphans.slice(0, 3)) {
    if (o.bankTxnIds[0]) console.log(await prisma.bankTransaction.findUnique({ where: { bankTxnId: o.bankTxnIds[0] } }));
    if (o.ledgerEntryIds[0]) console.log(await prisma.ledgerEntry.findUnique({ where: { ledgerEntryId: o.ledgerEntryIds[0] } }));
    if (o.settlementIds[0]) console.log(await prisma.settlementRecord.findUnique({ where: { settlementId: o.settlementIds[0] } }));
  }
  const fee = mapping.events.find((e) => e.discrepancyType === "feeDeduction")!;
  console.log(await prisma.settlementRecord.findUnique({ where: { settlementId: fee.settlementIds[0] } }));
  console.log(await prisma.ledgerEntry.findUnique({ where: { ledgerEntryId: fee.ledgerEntryIds[0] } }));
  await prisma.$disconnect();
}
gate();
```

- [ ] **Step 5: Commit ground-truth artifact**

```bash
git add ground-truth/event-mapping.json
git commit -m "chore(seed): populate ground-truth event-mapping from seed 42"
```

Only commit if the file is intentional for the repo demo; if the team prefers regenerating locally only, skip this commit and note that in the handoff — **default for this plan: commit** so judges/agents can inspect without re-seeding.

---

## Spec coverage self-check

| Spec section | Task |
|---|---|
| §4 affectedTables expansions | Task 1 |
| §4 TAXONOMY_IDS / no raw strings in generators | Tasks 1–2 |
| §5 quotas + SEED/SEED+1 shuffle | Task 3 |
| §6 orchestrator order + npm seed | Task 3 |
| §7 blunt ABORTs | Task 3 (`abort()` + insert count checks + orphan structure) |
| §8 ground-truth format | Task 3 |
| §9 gate paste | Task 4 |
| types.ts tracked | Task 2 commit |
| No Phase 3 | Global constraints |

## Placeholder scan

No TBD/TODO left in tasks. Path ambiguity for ground-truth resolved to `path.resolve(process.cwd(), "../ground-truth/event-mapping.json")` with cwd=`server/`.

## Type consistency

- `DiscrepancyTaxonomyId` / `TAXONOMY_IDS` / `QUOTAS` / `GENERATORS` keys must be the same nine ids.
- Generator signature remains `(event, indexSeed) => DiscrepancyGenerationResult`.
- Mapping fields: `bankTxnIds`, `ledgerEntryIds`, `settlementIds` (arrays).
