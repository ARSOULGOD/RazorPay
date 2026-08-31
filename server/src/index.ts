// Express server entry point — mounts API routes and starts listening.

import "dotenv/config";
import express from "express";
import { prisma } from "./db/prisma";
import { reconciliationRouter } from "./routes/reconciliation.routes";
import { metricsRouter } from "./routes/metrics.routes";
import { qnaRouter } from "./routes/qna.routes";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

/** Connection pool tracking (Issue 11: prevent exhaustion). */
let activeConnections = 0;
const maxConnections = Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? "10", 10);

/**
 * Middleware to track Prisma connection usage and return 503 if pool exhausted.
 * Note: This is a rough estimate; actual Prisma pool exhaustion is complex.
 * For production, use connection pooling proxy like PgBouncer.
 */
app.use((req, res, next) => {
  activeConnections++;
  if (activeConnections > maxConnections) {
    activeConnections--;
    return res.status(503).json({
      ok: false,
      error: `Service temporarily unavailable (${activeConnections}/${maxConnections} connections). Please retry.`,
    });
  }
  res.on("finish", () => {
    activeConnections--;
  });
  next();
});

/** Validate critical startup conditions before listening. */
async function validateStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("FATAL: DATABASE_URL not set in server/.env");
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✓ Database connection OK");
  } catch (err) {
    throw new Error(`FATAL: Database unreachable: ${err}`);
  }
}

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  // Default to localhost:5173 (Vite dev); override with CORS_ORIGIN in .env for production.
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
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

const server = app.listen(port, async () => {
  try {
    await validateStartup();
    console.log(`✓ AI Finance Controller API listening on http://localhost:${port}`);
  } catch (err) {
    console.error("Startup validation failed:", err);
    server.close(() => process.exit(1));
  }
});

// Set request timeout (5 minutes max) to prevent indefinite hangs.
server.setTimeout(5 * 60 * 1000);

// Graceful shutdown on SIGTERM.
process.on("SIGTERM", async () => {
  console.log("SIGTERM received; closing server...");
  server.close(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });
});
