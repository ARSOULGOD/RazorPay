// HTTP routes for the stretch settlement Q&A endpoint (stub handler for now).

import { Router } from "express";

export const qnaRouter = Router();

qnaRouter.post("/ask", async (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      "Settlement Q&A stretch layer is not implemented yet. Use /api/metrics/exceptions for stored reasoning.",
  });
});
