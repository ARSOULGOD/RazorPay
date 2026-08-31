// Express server entry point — mounts API routes and starts listening.

import "dotenv/config";
import express from "express";
import { reconciliationRouter } from "./routes/reconciliation.routes";
import { metricsRouter } from "./routes/metrics.routes";
import { qnaRouter } from "./routes/qna.routes";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-finance-controller" });
});

app.use("/api/reconciliation", reconciliationRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/qna", qnaRouter);

app.listen(port, () => {
  console.log(`AI Finance Controller API listening on http://localhost:${port}`);
});
