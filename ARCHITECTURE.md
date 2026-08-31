# AI Finance Controller — Architecture One-Pager

## Overview
A **3-way financial reconciliation agent** that matches records across three data sources (BankTransaction, LedgerEntry, SettlementRecord) using deterministic rules (Tier-1) and LLM reasoning (Tier-2), reporting measured match rate + honest exception list.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SYNTHETIC DATA GENERATION                                       │
│ • True-event generator (75 base events)                         │
│ • 9 discrepancy transformers (fee, lag, partial, orphan, etc.) │
│ • Ground-truth mapping (internal validation only)              │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL 16.6)                                      │
│ ├─ BankTransaction   (ID, amount, timestamp, ...)             │
│ ├─ LedgerEntry       (ID, amount, timestamp, ...)             │
│ ├─ SettlementRecord  (ID, netAmount, timestamp, ...)          │
│ └─ ReconciliationResult (decision, confidence, reasoning)      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ TIER-1: DETERMINISTIC EXACT MATCHER (TypeScript)              │
│ ├─ Find 3-way triangle: BankTx + LedgerEntry + SettlementRec │
│ ├─ Match criteria: ID + amount + timestamp (±tolerance)       │
│ └─ Output: MATCHED (high confidence)                          │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓ (unmatched candidates)
┌─────────────────────────────────────────────────────────────────┐
│ TIER-2: LLM REASONING (Groq → Gemini Failover)               │
│ ├─ LLM: Groq (openai/gpt-oss-20b) — PRIMARY                   │
│ ├─ Fallover: Gemini Flash (on 429/503/quota/JSON error)       │
│ ├─ Reasoning: partial captures, settlement lag, fee deduction,│
│ │             many-to-one, split payments, currency rounding  │
│ ├─ JSON repair: extract failed_generation → repair → retry    │
│ └─ Output: MATCHED | PARTIAL_MATCH | EXCEPTION (+ reasoning)  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ METRICS & VALIDATION                                            │
│ ├─ Match rate: (MATCHED + PARTIAL) / total                    │
│ ├─ Tier split: Tier-1 vs Tier-2 breakdown                    │
│ ├─ Discrepancy breakdown: count by type (lag, fee, orphan...) │
│ ├─ Exception list: unresolved records + verbatim reasoning    │
│ └─ Internal: validateAgainstGroundTruth (not in public API)   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ EXPRESS API (:3001)                                             │
│ ├─ POST   /api/reconciliation/run                             │
│ ├─ GET    /api/reconciliation/results                         │
│ ├─ GET    /api/metrics/summary                                │
│ └─ GET    /api/metrics/exceptions                             │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ REACT UI (Vite, :5173)                                          │
│ ├─ RunTrigger: Start reconciliation                           │
│ ├─ MetricsSummary: Match rate, tier split, breakdown         │
│ └─ ExceptionList: Unresolved records + reasons               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| **LLM Primary** | Groq | Free tier stable, JSON repair handles noise |
| **LLM Fallover** | Gemini | Backup for quota/rate limits, no silent failures |
| **Money** | `decimal.js` | Avoid JS float precision errors in reconciliation |
| **Database** | PostgreSQL | Nullable link fields (no FKs), Prisma ORM, schema versioning |
| **Match Strategy** | Tier-1 (exact) → Tier-2 (LLM) | Deterministic first, reasoning only for ambiguous |
| **Honest Output** | Exception list + reasoning | No force-matching; transparency over match rate |

---

## Verified Results (Example Batch)

- **Total records**: 67 candidates after Tier-1
- **MATCHED** (Tier-1): 32 exact 3-way triangles
- **PARTIAL_MATCH** (Tier-2): 40 ambiguous resolved by LLM
- **EXCEPTION** (Tier-2): 21 unresolved → exception list
- **Match rate**: (32 + 40) / 93 ≈ **77%**
- **LLM reasoning**: Captured for all PARTIAL & EXCEPTION decisions

---

## Stack

- **Backend**: Node.js + Express (TypeScript) in `server/`
- **Frontend**: React + Vite (TypeScript) in `client/`
- **Database**: PostgreSQL 16.6 via Docker Compose
- **ORM**: Prisma 6.x
- **LLM SDKs**: Groq (`groq-sdk`), Gemini (`@google/generative-ai`)
- **Money**: `decimal.js` + Prisma `Decimal`

---

## How to Run

```bash
# 1. Database
docker compose up -d

# 2. Seed data & reconcile (CLI)
cd server && npm run seed && npm run reconcile

# 3. Or: API + UI
cd server && npm run dev     # http://localhost:3001
cd client && npm run dev     # http://localhost:5173 (proxies /api)
```

---

## Submission Track Alignment

✅ **Measured match rate** with formula  
✅ **Honest exception list** with reasoning (no force-match)  
✅ **Verification step** (Tier-1 evidence + Tier-2 LLM chain-of-thought)  
✅ **Process entire batch** (75 seed events, 93 reconciliation candidates)  
✅ **Multi-source reconciliation** (3-way BankTx ↔ LedgerEntry ↔ Settlement)  

---

## Open / Stretch (Phase 5)

- Settlement Q&A layer (`/api/qna/ask`) — 501 placeholder
- Ground-truth accuracy panel in UI
- Tier-1→2 confidence threshold tuning
- Formal FK constraints after data validation (D7)
