# Roadmap — AI Finance Controller (Razorpay Buildathon Track 04)

Status as of **2026-09-01**. Companion to `decision-doc.md`, `design-doc.md`, and `cursorrules`.

**Goal:** Close one finance-ops loop on 50+ synthetic records with measured match rate + honest exceptions.

---

## Phase 0 — Project framing ✅
- [x] Track selection: AI Finance Controller → multi-source reconciliation
- [x] Locked decisions D1–D9 (`decision-doc.md`)
- [x] Design doc: 3-way recon, taxonomy, Tier-1/2, metrics, UI last
- [x] Cursor rules for stack / domain / working style

---

## Phase 1 — Schema & infrastructure ✅
- [x] Monorepo layout: `server/` + `client/` + `ground-truth/`
- [x] Prisma 6 schema (BankTransaction, LedgerEntry, SettlementRecord, ReconciliationResult)
- [x] Nullable link fields, no FKs (D7)
- [x] Docker Compose Postgres (`postgres:16.6`, volume `aifc_pgdata`)
- [x] Init migration applied on `ai_finance_controller`

---

## Phase 2 — Synthetic data & seed gate ✅
- [x] Seeded true-event generator + 9 discrepancy transformers
- [x] Taxonomy alignment verifier
- [x] Wipe-reseed into Postgres + `ground-truth/event-mapping.json`
- [x] Gate: 75 events, ≥6 true orphans, sampled fee/lag/exact checks
- [x] Scripts: `npm run seed` (tsx)

---

## Phase 3 — Reconciliation engine + metrics + demo surface ✅
- [x] Tier-1 deterministic exact matcher
- [x] Router + `runReconciliation` (persist `ReconciliationResult`)
- [x] Tier-2 LLM: **Groq primary** → **Gemini failover**
- [x] Groq JSON repair (`failed_generation` + repair retry)
- [x] Candidate dedupe
- [x] Metrics: match rate, tier split, discrepancy breakdown, exception list
- [x] Internal `validateAgainstGroundTruth` helper (not in UI yet)
- [x] Express API (`:3001`)
  - `POST /api/reconciliation/run`
  - `GET /api/reconciliation/results`
  - `GET /api/metrics/summary` / `exceptions`
- [x] Thin Vite UI (`:5173`): RunTrigger, MetricsSummary, ExceptionList
- [x] Verified batch example: ~32 MATCHED / 40 PARTIAL / 21 EXCEPTION (~77%)

---

## Phase 4 — Demo hardening (next)
Priority for Buildathon submission polish:

1. **Pitch artifacts**
   - [ ] Public GitHub repo clean (README, `.env.example`, no secrets)
   - [ ] 5-minute pitch video script + recording
   - [ ] Architecture one-pager (data flow: seed → Tier-1 → Tier-2 → metrics → exceptions)

2. **Reliability**
   - [ ] Re-run full `npm run reconcile` after JSON-repair change; confirm no hard `json_validate_failed` drops
   - [ ] Document free-tier limits / expected runtime (~minutes for 67 Tier-2 calls)
   - [ ] Optional: expose ground-truth accuracy number in metrics API (internal only, labeled)

3. **Honest reporting**
   - [ ] Tighten Tier-2 orphan labeling vs seed taxonomy (reduce false `trueOrphan` tags)
   - [ ] Ensure exception list always shows verbatim reasoning in UI (already wired — verify in demo run)

4. **Submission checklist (track bar)**
   - [ ] Process entire 50+ batch in demo (not cherry-picked)
   - [ ] Show match/partial/exception counts + formula
   - [ ] Show unresolved records + reasons
   - [ ] Call out verification step (Tier-1 evidence / no force-match)

---

## Phase 5 — Stretch (only if Phase 4 is solid)
- [ ] Settlement Q&A layer (`/api/qna/ask` + `QnAPanel`) over stored reasoning
- [ ] UI ground-truth accuracy panel (optional, not for agent)
- [ ] Seed writes wrapped in `prisma.$transaction()`
- [ ] Formal FK constraints after data gen validated (D7 open)
- [ ] Tune Tier-1→2 confidence threshold if soft matching is added later

---

## Explicitly out of scope (unless track/decision changes)
- Forward cash forecasting / tax-line matcher as primary product
- Mongo / LangChain / swapping primary LLM without a real constraint
- UI polish (animations, extra pages) ahead of demo correctness
- Auto-inflating match rate

---

## Suggested order of work this week
1. Phase 4.1 — README + `.env.example` + secret audit  
2. Phase 4.2 — one clean full reconcile + capture screenshots/metrics for pitch  
3. Phase 4.4 — walkthrough script aligned to track evaluation bar  
4. Phase 5 — Q&A only if time remains  

---

## Quick commands
```bash
docker compose up -d
cd server && npm run seed && npm run reconcile   # CLI full loop
cd server && npm run dev                         # API
cd client && npm run dev                         # UI
```
