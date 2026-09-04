// HTTP routes exposing match rate, tier split, discrepancy breakdown, and exceptions.

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma";
import { computeMatchRate } from "../metrics/computeMatchRate";
import { computeTierSplit } from "../metrics/computeTierSplit";
import { computeDiscrepancyBreakdown } from "../metrics/computeDiscrepancyBreakdown";
import { buildExceptionList } from "../metrics/buildExceptionList";

export const metricsRouter = Router();

metricsRouter.get("/summary", async (_req, res) => {
  try {
    const rows = await prisma.reconciliationResult.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json({
      ok: true,
      matchRate: computeMatchRate(rows),
      tierSplit: computeTierSplit(rows),
      discrepancyBreakdown: computeDiscrepancyBreakdown(rows),
      exceptions: buildExceptionList(rows),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

metricsRouter.get("/exceptions", async (_req, res) => {
  try {
    const rows = await prisma.reconciliationResult.findMany({
      where: { status: "EXCEPTION" },
      orderBy: { createdAt: "asc" },
    });
    res.json({ ok: true, exceptions: buildExceptionList(rows) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

metricsRouter.get("/accuracy", async (_req, res) => {
  try {
    const groundTruthPath = path.resolve(process.cwd(), "../ground-truth/event-mapping.json");
    if (!fs.existsSync(groundTruthPath)) {
      return res.json({ ok: false, error: "Ground truth not generated." });
    }
    const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf-8"));
    
    const results = await prisma.reconciliationResult.findMany();
    let correctMatches = 0;
    
    for (const result of results) {
       // Search the ground truth events to see if the LLM successfully identified the true root cause
       const truthEvent = groundTruth.events.find(
         (e: any) => e.bankTxnIds.includes(result.bankTxnId) || e.settlementIds.includes(result.settlementId) || e.ledgerEntryIds.includes(result.ledgerEntryId)
       );
       
       if (truthEvent && result.discrepancyType === truthEvent.discrepancyType) {
         correctMatches++;
       } else if (truthEvent && result.status === 'MATCHED' && truthEvent.discrepancyType === 'exactMatch') {
         correctMatches++;
       }
    }
    
    res.json({ 
       ok: true,
       total: results.length,
       correct: correctMatches,
       accuracyPercent: results.length ? (correctMatches / results.length) * 100 : 0 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});
