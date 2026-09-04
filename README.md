# AI Finance Controller

A **3-way financial reconciliation agent** built for the **Razorpay Buildathon (Track 04)**. This system matches records across three data sources (Bank, Ledger, Settlement) using a two-tier engine (deterministic rules + LLM reasoning) and reports measured match rates along with an honest exception list.

## Overview

Financial reconciliation is notoriously messy. A bank statement, an internal ledger, and a payment processor's settlement report will rarely agree perfectly due to real-world complexities like settlement lags, fee deductions, split payments, and currency rounding.

The AI Finance Controller solves this by simulating these exact discrepancies and deploying a **Tiered Reconciliation Engine** to resolve them. It proves its capability not just by matching what it can, but by honestly reporting what it *can't* (genuine orphans/exceptions).

## Tech Stack & Why It's Used

- **Backend:** Node.js + Express (TypeScript) - robust, scalable API.
- **Frontend:** React + Vite (TypeScript) - lightweight, fast UI dashboard.
- **Database:** PostgreSQL 16.6 (via Docker) - Financial data requires strict relational integrity (tables for Bank, Ledger, Settlement). MongoDB was explicitly rejected because this problem inherently requires relational modeling.
- **ORM:** Prisma 6.x - provides type-safe database queries and schema migrations.
- **LLM SDKs:** Groq (`groq-sdk`) as primary, Gemini (`@google/generative-ai`) as fallback. Groq provides ultra-fast inference for structured JSON, while Gemini serves as a reliable failover for quota limits.
- **Money Handling:** `decimal.js` - avoids native JavaScript floating-point precision errors (critical for financial reconciliation and preventing rounding errors).

## Architecture & Workflow

The workflow consists of data generation, tiered matching, and metrics reporting.

### 1. Synthetic Data Generation
We generate synthetic true-events (75 base events) and inject **9 specific discrepancy types**:
- Exact matches
- Settlement lag (date mismatches)
- Fee deductions (gross vs. net mismatches)
- Partial capture/refund
- Split payments (1:2 ratio)
- Batched payouts (many-to-one)
- Duplicate entries
- Currency rounding
- **True orphans (deliberately unresolvable records)**

This dataset is seeded directly into the PostgreSQL database.

### 2. Tier-1: Deterministic Exact Matcher
The agent first runs plain TypeScript rules to find exact 3-way triangles (same ID, amount, and timestamp across Bank, Ledger, and Settlement). 
**Why?** Cost efficiency and speed. We route by difficulty. Simple exact matches should never incur the latency and cost of an LLM call. High-confidence deterministic matches bypass the LLM entirely.

### 3. Tier-2: LLM Reasoning
Unmatched, ambiguous candidates from Tier-1 are passed to the Tier-2 LLM engine.
The LLM (Groq → Gemini fallback) receives the candidate records and is instructed to reason about the known discrepancy types.
It outputs structured JSON:
```json
{
  "status": "MATCHED" | "PARTIAL_MATCH" | "EXCEPTION",
  "confidence": 0.95,
  "discrepancyType": "Fee Deduction",
  "reasoning": "Settlement amount is net of a 2% fee..."
}
```

### 4. Metrics & UI Dashboard
The React frontend surfaces the results of the reconciliation run:
- **Match Rate:** The percentage of records successfully resolved (Matched + Partial Match).
- **Tier Split:** Shows how many were solved by code (Tier-1) vs AI (Tier-2).
- **Discrepancy Breakdown:** Visualizes the types of issues found.
- **Exception List:** Displays unresolved records (the "true orphans") with the LLM's **verbatim reasoning**.

## The Thinking Behind It (Key Decisions)

1. **Honest Reporting over 100% Match Rates:** 
   The most important design decision is the inclusion of "True Orphans" in the data generation. The agent is explicitly told it is allowed to fail to match records, producing an "EXCEPTION". This proves the agent isn't hallucinating or force-fitting matches to achieve a fake 100% success rate. The output is honest, transparent, and trustworthy.

2. **3-Way Reconciliation:**
   We chose Bank ↔ Ledger ↔ Settlement because it accurately mirrors the standard fintech operations loop. 2-way reconciliation (Bank ↔ Ledger) misses processor-level complexities like batch settlements and fee deductions.

3. **No Database Constraints (FKs) Initially:**
   Linking fields are kept as nullable strings without strict Foreign Keys. This allows our data generator to insert mismatched and orphaned records freely to test the AI's resilience.

4. **Groq Primary / Gemini Failover:**
   Groq is used for its fast response times and free-tier availability, perfect for structured JSON outputs in the reconciliation loop. Gemini is kept as a strict fallback to prevent silent failures during rate-limits.

5. **Local Docker Postgres:**
   A local PostgreSQL container with a persistent volume guarantees that the synthetic state survives between restarts, ensuring a stable environment for iterative prompt tuning.

## How to Run the Project

```bash
# 1. Start the Database
docker compose up -d

# 2. Seed data & run the reconciliation agent via CLI
cd server
npm install
npm run seed
npm run reconcile

# 3. Start the APIs and UI
# In terminal 1:
cd server && npm run dev     # Starts API on http://localhost:3001

# In terminal 2:
cd client && npm install
npm run dev                  # Starts UI on http://localhost:5173
```
