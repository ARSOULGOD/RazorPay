// HTTP routes to trigger and inspect reconciliation runs.

import { Router } from "express";
import { runReconciliation } from "../reconciliation/runReconciliation";
import { prisma } from "../db/prisma";
import { tryAcquireRunLock, releaseRunLock } from "../reconciliation/runLock";

export const reconciliationRouter = Router();

/** POST /api/reconciliation/run — full pass (Groq primary / Gemini failover). */
reconciliationRouter.post("/run", async (req, res) => {
  if (!tryAcquireRunLock()) {
    res.status(409).json({
      ok: false,
      error: "Reconciliation already in progress",
      code: "RUN_IN_PROGRESS",
    });
    return;
  }
  try {
    const skipLlm = Boolean(req.body?.skipLlm);
    const summary = await runReconciliation({ skipLlm });
    res.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/reconciliation/run", message);
    res.status(500).json({ ok: false, error: message });
  } finally {
    releaseRunLock();
  }
});

/** GET /api/reconciliation/results — latest stored decisions. */
reconciliationRouter.get("/results", async (_req, res) => {
  try {
    const results = await prisma.reconciliationResult.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});
