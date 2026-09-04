# Phase 5 (Stretch) — Extremely Detailed Implementation Plan

**Goal:** Implement the Phase 5 stretch goals from the roadmap with explicit, line-by-line instructions, complete code snippets, and exact CLI commands. This leaves zero ambiguity for the developer or agent picking up these tasks.

---

## Task 1: Atomic Seed Writes via `prisma.$transaction()`

**Target:** `server/src/data-generation/seedDatabase.ts`

**Implementation Steps:**
1. Locate the sequence of `deleteMany` and `createMany` calls starting around line 143.
2. Replace them with a single transactional array to guarantee all-or-nothing execution:

```typescript
  // Replace the individual await calls with:
  const [
    _, _, _, _,
    bankCreate,
    ledgerCreate,
    settlementCreate
  ] = await prisma.$transaction([
    prisma.reconciliationResult.deleteMany(),
    prisma.bankTransaction.deleteMany(),
    prisma.ledgerEntry.deleteMany(),
    prisma.settlementRecord.deleteMany(),
    prisma.bankTransaction.createMany({ data: bankRows }),
    prisma.ledgerEntry.createMany({ data: ledgerRows }),
    prisma.settlementRecord.createMany({ data: settlementRows }),
  ]);
```
3. Run `npm run seed` in the `server/` directory to verify the transactional seed successfully executes without throwing rollback errors.

---

## Task 2: Formal FK Constraints in Prisma

**Target:** `server/prisma/schema.prisma`

**Implementation Steps:**
1. Update the `BankTransaction` model to include a formal relation to `LedgerEntry`:
```prisma
  // Replace 'linkedLedgerId String?' with:
  linkedLedgerId  String?
  linkedLedger    LedgerEntry? @relation("BankToLedger", fields: [linkedLedgerId], references: [ledgerEntryId], onDelete: SetNull)
```
2. Update the `SettlementRecord` model to include a formal relation to `LedgerEntry`:
```prisma
  // Replace 'linkedLedgerId String?' with:
  linkedLedgerId  String?
  linkedLedger    LedgerEntry? @relation("SettlementToLedger", fields: [linkedLedgerId], references: [ledgerEntryId], onDelete: SetNull)
```
3. Update the `LedgerEntry` model to complete the bi-directional relations (Prisma requires both sides):
```prisma
  // Replace 'linkedBankTxnId String?' and 'linkedSettlementId String?' with:
  linkedBankTxnId    String?
  linkedBankTxn      BankTransaction? @relation("BankToLedger")
  
  linkedSettlementId String?
  linkedSettlement   SettlementRecord? @relation("SettlementToLedger")
```
4. Run the migration command in the `server/` directory: 
   `npx prisma migrate dev --name phase5_add_fk_constraints`
5. Run `npm run seed` again to ensure that synthetic data generation respects the newly enforced referential integrity (e.g. no orphaned string IDs that don't exist).

---

## Task 3: Settlement Q&A Layer (`/api/qna/ask` + `QnAPanel`)

**3.1 Backend Route:**
Create `server/src/routes/qna.routes.ts`:
```typescript
import { Router } from "express";
import { prisma } from "../db/prisma";
import { getGroqClient, getGroqModelName } from "../reconciliation/tier2-llm/groqClient";

export const qnaRouter = Router();

qnaRouter.post("/ask", async (req, res) => {
  try {
    const { settlementId, question } = req.body;
    
    // 1. Fetch full context
    const settlement = await prisma.settlementRecord.findUnique({
      where: { settlementId }
    });
    
    const result = await prisma.reconciliationResult.findFirst({
      where: { settlementId }
    });
    
    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    // 2. Build Prompt
    const prompt = `You are a finance AI assistant answering a question about a payment settlement.
Settlement Data: ${JSON.stringify(settlement)}
Agent's Reconciliation Reasoning: ${result?.reasoning ?? 'None'}
User Question: ${question}
Provide a concise, helpful answer explaining the numbers or discrepancy.`;

    // 3. Query LLM
    const completion = await getGroqClient().chat.completions.create({
      model: getGroqModelName(),
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ answer: completion.choices[0]?.message?.content });
  } catch (err) {
    console.error("QnA Error:", err);
    res.status(500).json({ error: String(err) });
  }
});
```
Update `server/src/index.ts` to mount it:
```typescript
import { qnaRouter } from "./routes/qna.routes";
// Inside your middleware stack:
app.use("/api/qna", qnaRouter);
```

**3.2 Frontend Component:**
Create `client/src/components/QnAPanel/QnAPanel.tsx`:
```tsx
import React, { useState } from 'react';
import styles from './QnAPanel.module.css';

export function QnAPanel({ settlementId }: { settlementId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("http://localhost:3001/api/qna/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementId, question })
      });
      const data = await res.json();
      setAnswer(data.answer || data.error);
    } catch (err) {
      setAnswer(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <h4>Ask AI about Settlement: {settlementId}</h4>
      <div className={styles.inputGroup}>
        <input 
          type="text" 
          value={question} 
          onChange={e => setQuestion(e.target.value)} 
          placeholder="Why was there a fee discrepancy?" 
          className={styles.input}
        />
        <button onClick={ask} disabled={loading} className={styles.button}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </div>
      {answer && (
        <div className={styles.answerBox}>
          <strong>AI:</strong> {answer}
        </div>
      )}
    </div>
  );
}
```

---

## Task 4: UI Ground-Truth Accuracy Panel (Optional)

**4.1 Backend Metric Endpoint:**
Create or append to `server/src/routes/metrics.routes.ts`:
```typescript
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { prisma } from "../db/prisma";

export const metricsRouter = Router();

metricsRouter.get("/accuracy", async (req, res) => {
  try {
    const groundTruthPath = path.resolve(process.cwd(), "../ground-truth/event-mapping.json");
    const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf-8"));
    
    const results = await prisma.reconciliationResult.findMany();
    let correctMatches = 0;
    
    // Cross-reference logic
    for (const result of results) {
       // Search the ground truth events to see if the LLM successfully identified the true root cause
       const truthEvent = groundTruth.events.find(
         (e: any) => e.bankTxnIds.includes(result.bankTxnId) || e.settlementIds.includes(result.settlementId)
       );
       
       // Compare truthEvent.discrepancyType with result.discrepancyType
       // Increment correctMatches if they align.
    }
    
    res.json({ 
       total: results.length,
       correct: correctMatches,
       accuracyPercent: results.length ? (correctMatches / results.length) * 100 : 0 
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

---

## Task 5: Tune Tier-1→2 Confidence Threshold

**Target:** `server/.env` and `server/src/reconciliation/tier1-deterministic/exactMatcher.ts`

**Implementation Steps:**
1. Add threshold variable to `server/.env`:
   `TIER1_CONFIDENCE_THRESHOLD=0.95`
2. Update `exactMatcher.ts` to parse and check this environment variable before blindly accepting a match as `MATCHED`:
```typescript
  // Load threshold once
  const threshold = parseFloat(process.env.TIER1_CONFIDENCE_THRESHOLD || "1.0");
  
  // Inside the tier-1 matching algorithm, if a fuzzy/soft match yields a confidence < threshold:
  const computedConfidence = calculateFuzzyMatch(bankTxn, ledgerTxn);
  
  if (computedConfidence < threshold) {
     // Do not push to Tier-1 resolved array.
     // Leave it in the unmatched sets so that `routeReconciliation` passes it into the `candidates` 
     // pool for Tier-2 LLM execution.
     continue; 
  }
```
3. This ensures Tier-1 is reserved only for absolute 100% mathematical certainties (or above 95%), properly outsourcing edge-cases to Groq/Gemini.
