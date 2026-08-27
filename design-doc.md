# Design Doc — AI Finance Controller

Companion to decision-doc.md. That file records *why*; this file
describes *how the system works*. If something here conflicts with a
locked decision, the decision doc wins — flag the conflict rather than
silently resolving it in code.

---

## 1. System overview

Three synthetic data sources are generated to represent one
underlying set of real-world financial events, deliberately observed
imperfectly by each source (the way a bank statement, an internal
ledger, and a processor's settlement report will disagree with each
other in reality). A reconciliation agent then processes the three
sources and attempts to establish, for each underlying event, which
records across the three sources refer to it — and where they don't
fully agree, why.

```
BankTransaction  ─┐
LedgerEntry      ─┼──▶  Reconciliation Engine  ──▶  ReconciliationResult
SettlementRecord ─┘         (Tier 1: deterministic)      (status, confidence,
                             (Tier 2: LLM-routed)          discrepancy_type,
                                                            reasoning)
                                                                │
                                                                ▼
                                                    Metrics & Exception Report
                                                                │
                                                                ▼
                                                          React Dashboard
```

---

## 2. Data model

Four tables (see decision-doc D7 for why no FK constraints yet):

- **BankTransaction** — ground truth for money movement.
- **LedgerEntry** — internal books' record of the same event.
- **SettlementRecord** — processor's (Razorpay-style) report, including
  gross/fee/tax/net breakdown.
- **ReconciliationResult** — the agent's output per attempted match:
  status, confidence, discrepancy type, reasoning, and whether Tier 1
  or Tier 2 resolved it.

Exact field list lives in the Phase 1 Cursor prompt / resulting
`schema.prisma` — this doc describes the *role* of each table, not the
literal field list, to avoid this doc going stale the moment schema.prisma
is edited.

---

## 3. Synthetic data generation

Target: 70-80 total underlying events, generated such that after
discrepancy injection, 50+ records remain in the final dataset shown
in the demo.

### Discrepancy taxonomy (each must be explicitly represented, not incidental)

| Type | Description | Which tables affected |
|---|---|---|
| Exact match | Baseline — same ID/amount/date across all 3 | All 3, clean |
| Settlement lag | Bank shows T+2, ledger shows T+0 | Bank vs Ledger dates differ |
| Fee deduction | Settlement net = gross − fee − tax; ledger shows gross | Settlement vs Ledger amount |
| Partial capture/refund | Only part of an amount is captured/refunded | Ledger entryType, amount mismatch |
| Split payment | 1 ledger entry ↔ 2 bank transactions | Ledger:Bank = 1:2 |
| Many-to-one (batched payout) | 2+ ledger entries ↔ 1 bank transaction | Ledger:Bank = 2:1 |
| Duplicate entry | Same transaction logged twice in one source | Data-entry-error simulation |
| Currency rounding | Paise-level rounding difference | Small amount deltas |
| True orphan (unresolvable) | Exists in exactly one source, matches nothing | Any single table, deliberately isolated |

The orphan category (decision-doc D6) must be large enough to be
credible as "real" exceptions — not just 1 token example. Target: at
least 4-6 genuine orphans in the final dataset.

### Generation approach
A deterministic seed-based generator (plain TypeScript, not
LLM-generated data) creates the base "true event" set, then applies
discrepancy transformations per the taxonomy above to derive what each
of the three tables independently "observed." This keeps the ground
truth known and recorded separately (for your own accuracy validation
against the agent's output — the agent should never have access to
this ground-truth mapping).

---

## 4. Reconciliation engine — two tiers

### Tier 1 — Deterministic (plain TypeScript, no LLM call)
Attempts exact-match resolution first: same reference ID where
present, or exact amount + exact timestamp + exact currency across
all 3 tables. If Tier 1 resolves a record with high confidence, it is
NOT sent to the LLM. This is expected to resolve the "exact match"
baseline category and reduce LLM calls/cost.

### Tier 2 — LLM-routed (Claude API, structured output)
Anything Tier 1 cannot confidently resolve is passed to Claude with:
- The candidate records from each source that might relate to it
- Explicit instruction to reason about known discrepancy types
  (fee deduction, lag, split, etc.)
- A required structured output shape:
  ```
  {
    status: "MATCHED" | "PARTIAL_MATCH" | "EXCEPTION",
    confidence: number (0-1),
    discrepancyType: string | null,
    reasoning: string
  }
  ```
- Explicit permission — instruction, not just allowance — to return
  EXCEPTION with a clear reasoning string when no confident match
  exists. The prompt must not implicitly pressure the model toward
  forcing a match (decision-doc D6).

Every Tier 2 result is written to ReconciliationResult with
`resolvedByLLM: true`; every Tier 1 result with `resolvedByLLM: false`.
This distinction is itself a reportable metric (see Section 5).

---

## 5. Metrics & exception reporting

This is core product, not a UI afterthought (decision-doc D1 — this is
what the judging bar is actually evaluating).

Required outputs:
- **Overall match rate**: matched + partial / total attempted, stated
  plainly (e.g. "47/54 fully matched, 4 partial, 3 genuine exceptions").
- **Breakdown by discrepancy type**: how many of each taxonomy category
  were correctly identified and resolved.
- **Tier 1 vs Tier 2 split**: how many records resolved deterministically
  vs. via LLM reasoning — this is your "we route by difficulty" evidence.
- **Exception list**: every unresolved record with its `reasoning`
  string surfaced verbatim, not summarized away. This is the "honest"
  part the track explicitly asks for.

Optional, if time allows: compare agent output against the known
ground-truth mapping (Section 3) to produce a true accuracy percentage
for internal validation — not necessarily shown in the demo, but useful
to know your real number before a judge asks a hard question about it.

---

## 6. UI (React) — deliberately last priority

Minimum viable dashboard:
1. Trigger/run view — kick off a reconciliation pass
2. Summary view — match rate, tier split, discrepancy breakdown
3. Exception table — list of unresolved records with reasoning shown

No animations, no extra pages, no polish beyond making the above three
views legible, unless schema + data + engine + metrics are already
solid (decision-doc D1 priority ordering, restated in .cursorrules).

---

## 7. Stretch — Settlement Q&A layer

If core reconciliation is solid with time remaining: a chat interface
that answers questions like "why didn't transaction X match?" by
reusing the `reasoning` field already stored in ReconciliationResult,
plus a Claude call that can reference the specific record's stored
reasoning and elaborate conversationally. This is explicitly a thin
layer over existing data, not a parallel system — do not let this
become a second reconciliation engine.

---

## Open items (not yet decided — do not let Cursor silently decide these)

- Whether formal FK constraints get added after synthetic data
  generation is validated (decision-doc D7 leaves this open).
- Exact confidence threshold at which Tier 1 defers to Tier 2 (needs
  to be tuned once real synthetic data exists, not guessed now).
- Whether ground-truth ORIGIN mapping (Section 3) is stored in a
  separate table/file inaccessible to the reconciliation logic, or
  kept entirely outside the database to avoid any risk of leakage.
