# Phase 2 Close-Out — Review Remediation Design

**Date:** 2026-08-29  
**Status:** Approved for planning (brainstorming)  
**Scope:** Full remediation of Phase 2 code-review findings — not Phase 3.

Companion to repo `decision-doc.md` / `design-doc.md`. If this file conflicts with a locked decision (D1–D9), the decision doc wins.

---

## 1. Problem

Code review of Phase 2 was blunt and correct:

| Checkpoint | Reality |
|---|---|
| 2.1 taxonomy | Mostly done; `affectedTables` drift on fee/lag/partial |
| 2.2 true events | Generator exists; never orchestrated |
| 2.3 9 discrepancy generators | Solid in isolation |
| 2.4 `seedDatabase.ts` | **Stub only** — one comment line |
| 2.5 gate (real DB rows) | **Impossible** — empty `event-mapping.json`, no seed |

Calling Phase 2 “complete” was false. This design closes that gap.

---

## 2. Goals / non-goals

**Goals**
- Expand taxonomy `affectedTables` to match what generators already emit.
- Commit/track `discrepancies/types.ts`.
- Replace generator string-literal `discrepancyType` values with taxonomy-backed constants.
- Implement wipe-and-reseed `seedDatabase.ts` with fixed quotas (≥6 orphans).
- Write `ground-truth/event-mapping.json`.
- Prove gate 2.5 with real Postgres rows (orphans + other categories).
- Fail loudly on any inconsistency — no silent partial seeds.

**Non-goals**
- Phase 3 reconciliation / Tier 1–2 / metrics / UI.
- Changing generator signatures (manyToOne stays single-TrueEvent).
- Adding FK constraints (D7 remains open).
- `prisma dev` fallback if Docker is down.
- Formal unit-test suite (manual gate + in-seed asserts are enough for this close-out).

---

## 3. Architecture

Single orchestrator file (Approach 1):

```
generateTrueEvents(75, 42)
        ↓
fixed quota assignment → discrepancyType per event
        ↓
9 generators → DiscrepancyGenerationResult[]
        ↓
wipe source (+ recon) tables → Prisma insert
        ↓
ground-truth/event-mapping.json + console gate summary
```

**Files touched**
- `server/src/data-generation/taxonomy.ts` — `affectedTables` + id constants
- `server/src/data-generation/discrepancies/*.ts` — use taxonomy id constants for `discrepancyType`
- `server/src/data-generation/discrepancies/types.ts` — must be tracked in git
- `server/src/data-generation/seedDatabase.ts` — full implementation
- `server/package.json` — `"seed": "ts-node src/data-generation/seedDatabase.ts"`
- `ground-truth/event-mapping.json` — rewritten by seed only

**Not touched:** recon, metrics, client, Prisma schema, decision/design docs (unless a follow-up explicitly asks).

---

## 4. Taxonomy `affectedTables` expansions

Match generators (user choice: expand taxonomy, do not narrow generators):

| id | New `affectedTables` |
|---|---|
| `settlementLag` | `BankTransaction`, `LedgerEntry`, `SettlementRecord` |
| `feeDeduction` | `SettlementRecord`, `LedgerEntry`, `BankTransaction` |
| `partialCapture` | `LedgerEntry`, `BankTransaction`, `SettlementRecord` |

All other types unchanged. `trueOrphan` keeps all three tables with the existing comment: “any one of these, not all three at once.”

**Id constants:** Export a stable map/object of taxonomy ids (e.g. from `DISCREPANCY_TAXONOMY_BY_ID` or an explicit `TAXONOMY_IDS` const). Every generator sets `discrepancyType` via that export — no raw string literals like `"feeDeduction"`.

---

## 5. Fixed quotas

Defaults (overridable only by editing constants at top of `seedDatabase.ts` for this phase):

- `EVENT_COUNT = 75`
- `SEED = 42`

| Type | Count |
|---|---|
| exactMatch | 20 |
| settlementLag | 8 |
| feeDeduction | 8 |
| partialCapture | 7 |
| splitPayment | 6 |
| manyToOne | 6 |
| duplicateEntry | 6 |
| currencyRounding | 8 |
| trueOrphan | **6** |
| **Total** | **75** |

**Assignment algorithm**
1. Build a flat array of 75 taxonomy ids from the quota table.
2. Shuffle that array with Mulberry32 seeded by **`SEED + 1`** (keeps assignment order independent of the event-field PRNG stream inside `generateTrueEvents`, which uses `SEED`).
3. `events = generateTrueEvents(EVENT_COUNT, SEED)`.
4. Zip `events[i]` with `assignments[i]`; call `generator(event, indexSeed=i)`.

---

## 6. Orchestrator steps (`seedDatabase.ts`)

Strict order:

1. Load env from `server/.env` (`DATABASE_URL` required).
2. **Wipe:** delete all rows in `ReconciliationResult`, then `BankTransaction`, `LedgerEntry`, `SettlementRecord` (no FKs; wipe recon first anyway so demos stay clean).
3. Generate true events.
4. Build + shuffle assignments; **blunt-check** quota sum === `EVENT_COUNT`.
5. Run generators; collect results; **blunt-check** each `result.discrepancyType === assignment`.
6. Flatten rows; Prisma insert (`createMany` preferred).
7. Write `ground-truth/event-mapping.json` at **repo root** (resolve path from `server/` cwd as `../ground-truth/event-mapping.json`, or via `path.join` from a known repo-root marker — never write inside `server/`).
8. Print gate summary to stdout (counts + sample IDs).
9. Run post-seed blunt asserts (see §7). Exit non-zero on any failure.

**Run:** from `server/`: `npm run seed`.  
If Postgres is unreachable: stop. Message must say to check `docker ps` for `aifc_postgres`. Never fall back to `prisma dev`.

---

## 7. Blunt error checking (non-negotiable)

Be extremely blunt. Prefer throw + non-zero exit over “best effort.” No soft warnings for data integrity failures. No partial commits left looking successful.

### Before wipe / generate
| Condition | Behavior |
|---|---|
| `DATABASE_URL` missing/empty | Throw: `"seedDatabase ABORT: DATABASE_URL missing in server/.env"` |
| Quota map missing any of the 9 taxonomy ids | Throw listing missing ids |
| Sum of quotas ≠ `EVENT_COUNT` | Throw: `"seedDatabase ABORT: quota sum X !== EVENT_COUNT Y — fix the table, do not run"` |

### During generation
| Condition | Behavior |
|---|---|
| Unknown assignment id / missing generator | Throw: `"seedDatabase ABORT: no generator for <id>"` |
| Generator returns different `discrepancyType` than assigned | Throw with eventId + expected + actual — treat as a bug, not a soft mismatch |
| Generator throws | Do not catch-and-continue; let it fail the process |

### During / after persist
| Condition | Behavior |
|---|---|
| Prisma connect/query failure | Throw with underlying message + `"Is aifc_postgres Up (healthy)?"` |
| Insert count for a table ≠ flattened row count for that table | Throw — silent truncation is a Critical failure |
| After write: trueOrphan assignments in mapping `< 6` | Throw: `"seedDatabase ABORT: orphan count < 6 — Phase 2 gate fails, do not proceed to Phase 3"` |
| Any `trueOrphan` mapping entry where zero or >1 of `{bankTxnIds, ledgerEntryIds, settlementIds}` is non-empty | Throw naming the eventId — empty/multi orphans are corrupt |
| Ground-truth write fails | Throw; do not claim seed succeeded |

### Explicitly forbidden
- Catching errors and logging “continuing anyway”
- Seeding when Docker/Postgres is down
- Leaving old rows mixed with new rows (wipe is mandatory every run)
- Writing an incomplete `event-mapping.json` after a failed insert
- Treating “row counts look roughly right” as gate success without orphan spot-checks

---

## 8. Ground-truth file format

Path: `ground-truth/event-mapping.json` (repo root).

```json
{
  "seed": 42,
  "count": 75,
  "generatedAt": "<ISO-8601>",
  "events": [
    {
      "eventId": "evt_0001",
      "discrepancyType": "feeDeduction",
      "bankTxnIds": ["bank_..."],
      "ledgerEntryIds": ["led_..."],
      "settlementIds": ["set_..."]
    }
  ]
}
```

Rules:
- Written only by `seedDatabase.ts`.
- Reconciliation / Tier-2 prompts must never read this file (design-doc / cursorrules).
- For `splitPayment`, `settlementIds` may be `[]`.
- For `trueOrphan`, exactly one of the three ID arrays is non-empty.

---

## 9. Gate check (Phase 2.5) — done criteria

After a successful `npm run seed`, a human (or agent) must:

1. Confirm `aifc_postgres` is Up.
2. From mapping + DB, show **≥6** true orphan rows (null links; only one source table populated for that event).
3. Show at least one real DB row (or joined trio) for **2–3 other** categories (e.g. `feeDeduction`, `settlementLag`, `exactMatch`).
4. Paste those samples before Phase 3 starts.

If any of the above cannot be produced, Phase 2 is **still not done**. Do not negotiate.

---

## 10. Success criteria

- [ ] `affectedTables` updated for lag/fee/partial
- [ ] Generators use taxonomy id constants
- [ ] `types.ts` tracked in git
- [ ] `npm run seed` wipe-reseeds deterministically for seed 42
- [ ] `event-mapping.json` non-empty with 75 events
- [ ] ≥6 orphans verified in DB
- [ ] ≥1 row visible per taxonomy category via mapping
- [ ] Any integrity failure aborts with a blunt error (no soft pass)

---

## 11. Open items (do not silently decide later)

None for this close-out. Quota numbers and SEED/COUNT are fixed above; change only with an explicit user edit to this spec or the constants.
