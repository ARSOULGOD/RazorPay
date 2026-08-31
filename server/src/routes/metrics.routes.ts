// HTTP routes exposing match rate, tier split, discrepancy breakdown, and exceptions.

import { Router } from "express";
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
