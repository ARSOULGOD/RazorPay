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

## D4 — LLM: Gemini API, direct SDK, no framework (REVISED)
**Original decision (superseded):** Claude API via `@anthropic-ai/sdk`,
based on an assumption that new Anthropic Console accounts receive an
automatic $5 trial credit with no card required. This assumption was
WRONG — checked directly against a live Console dashboard showing
$0.00 organization credit with no trial applied, and confirmed against
Anthropic's own support documentation, which describes a fund-your-
account flow requiring payment details, not an automatic grant.
Several third-party sources had claimed an auto-grant existed; they
were either wrong, describing a discontinued program, or describing
conditions that didn't apply to this account. Do not trust the earlier
version of this entry, and do not re-litigate switching back to Claude
based on a resurfaced claim of a free credit without verifying it live
on the actual Console dashboard first.

**Revised decision:** `@google/generative-ai` (Gemini), direct SDK
calls. No LangChain, no LlamaIndex.

**Why Gemini over Groq specifically:** Groq is an inference platform
(fast serving of various open models, not its own frontier model
family) — free tier is request-rate-limited, real risk of hitting a
cap mid-build during rapid Tier 2 prompt iteration. Gemini's free tier
is more generous for exploratory/iterative usage, and Google has
specifically invested in schema-constrained structured output, which
is exactly what Tier 2's `{ status, confidence, discrepancyType,
reasoning }` shape needs (design doc Section 4).

**Known residual risk, carried forward openly rather than hidden:**
structured-output reliability under Gemini has not been validated
against this project's actual ambiguous-match reasoning load yet —
this needs real testing once Phase 4 starts, with the same scrutiny
the original Claude-based plan would have gotten. Do not assume parity
with Claude's tool-use reliability without checking real output.

**Blast radius of this change (contained, not full rework):**
Unaffected: schema, Phase 2 data generation, Tier 1 deterministic
matching, types, metrics module, UI. Affected: `tier2-llm/` folder
contents (`claudeClient.ts` → renamed/rewritten against Gemini SDK,
`buildReconciliationPrompt.ts` adjusted for Gemini's prompt format,
`parseReconciliationResponse.ts` rewritten for Gemini's JSON mode
instead of Claude's tool-use blocks), and the LLM dependency in
`server/package.json`.

---

## D5 — Matching tiers: deterministic vs. LLM-routed
**Decision:** Exact-match cases (same ID + same amount + same
timestamp) are resolved in plain TypeScript, never sent to the LLM.
Ambiguous cases (fee deduction, settlement lag, split/many-to-one,
partial capture, duplicates) are routed to the LLM (Gemini, per
revised D4) for reasoning.

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

---

## D9 — Local Postgres via Docker, not `prisma dev`
**Decision:** Local development database runs via
`docker-compose.yml` at project root (postgres:16.6, named volume
`aifc_pgdata`, container `aifc_postgres`, port 5432), not via
`prisma dev`'s ephemeral local instance.

**Why:** `prisma dev` creates a database tied to a running background
process — genuinely useful for zero-setup quick starts, but not
durable storage. It does not survive a stopped process, and in this
project's first setup attempt, Cursor silently fell back to `prisma
dev` when Docker wasn't running (Docker was installed but Docker
Desktop itself hadn't been started), which produced a working-looking
migration against a database that would not have persisted reliably
across sessions — a real risk for a multi-session hackathon build
generating hand-crafted synthetic data. A named Docker volume
guarantees data survives container restarts as long as the volume
isn't explicitly removed.

**Verified state (locked):** `aifc_postgres` container `Up (healthy)`,
`server/.env` DATABASE_URL points at
`postgresql://aifc_user:aifc_dev_pw@localhost:5432/ai_finance_controller`,
migration applied, all four tables present and confirmed at 0 rows.
Before any future session assumes the database is reachable, confirm
`docker ps` shows `aifc_postgres` as `Up`, not just installed — Docker
Desktop must be manually running; it does not auto-start.
