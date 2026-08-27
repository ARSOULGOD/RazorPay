# Decision Doc — AI Finance Controller

Status: locked. Do not reopen these without a real new constraint
(e.g. a hard rate limit hit, a judge requirement change). "I want to
try X" is not sufficient reason to revisit a closed decision three
days before a deadline.

---

## D1 — Track & product scope
**Decision:** Building Track 04 (AI Finance Controller), core direction
= Multi-source reconciliation. Settlement Q&A is a stretch layer on top
of the same reconciled data, not a separate build.

**Why:** The track's stated bar — "throughput plus measured accuracy
plus an honest exception list" — maps directly onto reconciliation
output (match rate + exceptions). Forecasting and tax-matching don't
naturally produce that same output shape. Reconciliation is also the
only direction where "one cherry-picked match proves nothing" is a
meaningful warning — it implies judges expect to see a real dataset
and a real number, which reconciliation is built to produce.

**Rejected alternatives:** Forward cash forecaster (predictive, harder
to "prove" in a short demo without historical data depth). Tax-line
matcher (narrower, less demo-able range of discrepancy types).

---

## D2 — Reconciliation shape: 3-way
**Decision:** BankTransaction ↔ LedgerEntry ↔ SettlementRecord.

**Why:** This is the standard fintech 3-way recon pattern and the one
most legible to judges evaluating a payments company's hackathon:
money that moved (bank), what the books say happened (ledger), what
the processor confirms (settlement). It also generates the richest,
most realistic discrepancy set (settlement lag, fee deduction, partial
capture) compared to a simpler 2-way bank/ledger recon.

---

## D3 — Stack
**Decision:** Express + React (TypeScript) + PostgreSQL + Prisma.
Not literal MERN (no MongoDB) despite the original framing.

**Why:** Reconciliation across three related tables needs relational
joins, foreign-key-style linking, and transactional integrity — Postgres
is a direct fit; Mongo would require modeling around a problem it isn't
suited for. Prisma chosen over raw `pg`/node-postgres for TypeScript
schema safety and migration tracking under time pressure, where a raw
SQL typo late at night is a worse failure mode than a slightly heavier
ORM.

---

## D4 — LLM: Claude API, direct SDK, no framework
**Decision:** `@anthropic-ai/sdk`, direct calls. No LangChain, no
LlamaIndex. No Gemini, no Groq.

**Alternatives considered and rejected:**
- Groq: inference platform, not a model provider — free tier is
  rate-limited, real risk of hitting a cap mid-build under hackathon
  time pressure.
- Gemini: usable free tier, but structured-output reliability under
  the same reasoning load is less certain, and the core differentiator
  of this project (structured confidence + reasoning on ambiguous
  matches) is exactly the place you don't want new uncertainty.
- LangChain/frameworks: abstraction overhead that costs debugging time
  without adding capability this project needs at this scale.

**Cost reality check (why "free" wasn't actually necessary):** full
pipeline run ≈ 50–100K tokens ≈ fractions of a dollar on Sonnet
pricing. New Anthropic Console accounts get a $5 trial credit, no card
required. This comfortably covers many full dev-cycle iterations.
Confirmed live and in use.

---

## D5 — Matching tiers: deterministic vs. LLM-routed
**Decision:** Exact-match cases (same ID + same amount + same
timestamp) are resolved in plain TypeScript, never sent to the LLM.
Ambiguous cases (fee deduction, settlement lag, split/many-to-one,
partial capture, duplicates) are routed to Claude for reasoning.

**Why:** Cost efficiency, but more importantly: this is a legitimate
architectural talking point for judging ("we route by match
difficulty, not brute-force every record through the LLM") that
signals the team understood the problem rather than just wiring an
API. Also keeps LLM latency off the easy 60-70% of records, making
demo runs faster.

---

## D6 — Synthetic data must include unresolvable orphans
**Decision:** The dataset intentionally includes records that should
NOT match anything, and the reconciliation agent must report these as
genuine exceptions rather than force-fit a match.

**Why:** Directly addresses the track's stated concern about
cherry-picked, artificially-clean demos. A 100% match rate on a
50-record dataset is a red flag to judges who explicitly warned
against exactly that. An honest, explained exception list is core
product, not a caveat section.

---

## D7 — Data model linking fields stay nullable, unconstrained
**Decision:** No FK constraints between BankTransaction, LedgerEntry,
SettlementRecord at the schema level (yet). Linking fields are plain
nullable strings.

**Why:** Synthetic data generation needs to create orphans and
mismatches freely without the database rejecting inserts. Formal
relations can be added later once data generation is validated,
if useful — but are not required for the reconciliation logic to
function, since matching happens in application code, not via DB
joins on FK constraints.

---

## D8 — CLI agent: Cursor, governed by `.cursorrules`
**Decision:** Cursor is the coding agent. A `.cursorrules` file at
project root encodes stack, domain rules, and working style so Cursor
doesn't drift into Mongo patterns, invent recon logic unprompted, or
silently loosen matching criteria to inflate the match rate.

**Why:** Without a persistent context file, a multi-session hackathon
build risks the agent forgetting constraints between sessions or
"helpfully" simplifying something load-bearing (e.g. auto-computing
`netAmount` when it needs to stay independently editable for injected
discrepancies).
