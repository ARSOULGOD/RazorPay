import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma";
import { generateTrueEvents } from "./generateTrueEvents";
import { TAXONOMY_IDS, type DiscrepancyTaxonomyId } from "./taxonomy";
import { generateExactMatch } from "./discrepancies/exactMatch";
import { generateSettlementLag } from "./discrepancies/settlementLag";
import { generateFeeDeduction } from "./discrepancies/feeDeduction";
import { generatePartialCapture } from "./discrepancies/partialCapture";
import { generateSplitPayment } from "./discrepancies/splitPayment";
import { generateManyToOne } from "./discrepancies/manyToOne";
import { generateDuplicateEntry } from "./discrepancies/duplicateEntry";
import { generateCurrencyRounding } from "./discrepancies/currencyRounding";
import { generateTrueOrphan } from "./discrepancies/trueOrphan";
import type { DiscrepancyGenerationResult } from "./discrepancies/types";

const EVENT_COUNT = 75;
const SEED = 42;

const QUOTAS: Record<DiscrepancyTaxonomyId, number> = {
  exactMatch: 20,
  settlementLag: 8,
  feeDeduction: 8,
  partialCapture: 7,
  splitPayment: 6,
  manyToOne: 6,
  duplicateEntry: 6,
  currencyRounding: 8,
  trueOrphan: 6,
};

const GENERATORS: Record<
  DiscrepancyTaxonomyId,
  (event: ReturnType<typeof generateTrueEvents>[number], indexSeed: number) => DiscrepancyGenerationResult
> = {
  exactMatch: generateExactMatch,
  settlementLag: generateSettlementLag,
  feeDeduction: generateFeeDeduction,
  partialCapture: generatePartialCapture,
  splitPayment: generateSplitPayment,
  manyToOne: generateManyToOne,
  duplicateEntry: generateDuplicateEntry,
  currencyRounding: generateCurrencyRounding,
  trueOrphan: generateTrueOrphan,
};

function abort(message: string): never {
  throw new Error(`seedDatabase ABORT: ${message}`);
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAssignments(): DiscrepancyTaxonomyId[] {
  const ids = Object.keys(TAXONOMY_IDS) as DiscrepancyTaxonomyId[];
  for (const id of ids) {
    if (!(id in QUOTAS)) abort(`quota map missing ${id}`);
  }
  const sum = ids.reduce((acc, id) => acc + QUOTAS[id], 0);
  if (sum !== EVENT_COUNT) abort(`quota sum ${sum} !== EVENT_COUNT ${EVENT_COUNT} — fix the table, do not run`);

  const slots: DiscrepancyTaxonomyId[] = [];
  for (const id of ids) {
    for (let i = 0; i < QUOTAS[id]; i++) slots.push(id);
  }

  const rng = createSeededRng(SEED + 1);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots;
}

type MappingEvent = {
  eventId: string;
  discrepancyType: DiscrepancyTaxonomyId;
  bankTxnIds: string[];
  ledgerEntryIds: string[];
  settlementIds: string[];
};

async function main() {
  if (!process.env.DATABASE_URL) {
    abort("DATABASE_URL missing in server/.env");
  }

  const assignments = buildAssignments();
  const events = generateTrueEvents(EVENT_COUNT, SEED);
  assert.equal(events.length, EVENT_COUNT);

  const results: DiscrepancyGenerationResult[] = [];
  const mappingEvents: MappingEvent[] = [];

  for (let i = 0; i < EVENT_COUNT; i++) {
    const event = events[i]!;
    const assigned = assignments[i]!;
    const gen = GENERATORS[assigned];
    if (!gen) abort(`no generator for ${assigned}`);
    const result = gen(event, i);
    if (result.discrepancyType !== assigned) {
      abort(
        `generator type mismatch eventId=${event.eventId} expected=${assigned} actual=${result.discrepancyType}`,
      );
    }
    results.push(result);
    mappingEvents.push({
      eventId: event.eventId,
      discrepancyType: result.discrepancyType,
      bankTxnIds: result.bankRows.map((r) => r.bankTxnId),
      ledgerEntryIds: result.ledgerRows.map((r) => r.ledgerEntryId),
      settlementIds: result.settlementRows.map((r) => r.settlementId),
    });
  }

  const orphanMappings = mappingEvents.filter((e) => e.discrepancyType === TAXONOMY_IDS.trueOrphan);
  if (orphanMappings.length < 6) {
    abort(`orphan count ${orphanMappings.length} < 6 — Phase 2 gate fails, do not proceed to Phase 3`);
  }
  for (const o of orphanMappings) {
    const nonempty = [o.bankTxnIds, o.ledgerEntryIds, o.settlementIds].filter((a) => a.length > 0);
    if (nonempty.length !== 1) {
      abort(`corrupt orphan eventId=${o.eventId}: expected exactly one non-empty id array`);
    }
  }

  try {
    await prisma.$connect();
  } catch (err) {
    abort(`Prisma connect failed: ${String(err)} — Is aifc_postgres Up (healthy)?`);
  }

  await prisma.reconciliationResult.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.settlementRecord.deleteMany();

  const bankRows = results.flatMap((r) => r.bankRows);
  const ledgerRows = results.flatMap((r) => r.ledgerRows);
  const settlementRows = results.flatMap((r) => r.settlementRows);

  const bankCreate = await prisma.bankTransaction.createMany({ data: bankRows });
  const ledgerCreate = await prisma.ledgerEntry.createMany({ data: ledgerRows });
  const settlementCreate = await prisma.settlementRecord.createMany({
    data: settlementRows,
  });

  if (bankCreate.count !== bankRows.length) {
    abort(`bank insert count ${bankCreate.count} !== flattened ${bankRows.length}`);
  }
  if (ledgerCreate.count !== ledgerRows.length) {
    abort(`ledger insert count ${ledgerCreate.count} !== flattened ${ledgerRows.length}`);
  }
  if (settlementCreate.count !== settlementRows.length) {
    abort(`settlement insert count ${settlementCreate.count} !== flattened ${settlementRows.length}`);
  }

  const groundTruthPath = path.resolve(process.cwd(), "../ground-truth/event-mapping.json");
  if (!fs.existsSync(path.dirname(groundTruthPath))) {
    abort(`ground-truth directory missing at ${path.dirname(groundTruthPath)}`);
  }

  const payload = {
    seed: SEED,
    count: EVENT_COUNT,
    generatedAt: new Date().toISOString(),
    events: mappingEvents,
  };

  try {
    fs.writeFileSync(groundTruthPath, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    abort(`ground-truth write failed: ${String(err)}`);
  }

  const counts: Record<string, number> = {};
  for (const e of mappingEvents) {
    counts[e.discrepancyType] = (counts[e.discrepancyType] ?? 0) + 1;
  }
  console.log("seedDatabase: OK");
  console.log("counts:", counts);
  console.log(
    "orphan samples:",
    orphanMappings.slice(0, 3).map((o) => ({
      eventId: o.eventId,
      bankTxnIds: o.bankTxnIds,
      ledgerEntryIds: o.ledgerEntryIds,
      settlementIds: o.settlementIds,
    })),
  );
  const sampleTypes: DiscrepancyTaxonomyId[] = [
    TAXONOMY_IDS.feeDeduction,
    TAXONOMY_IDS.settlementLag,
    TAXONOMY_IDS.exactMatch,
  ];
  for (const t of sampleTypes) {
    const sample = mappingEvents.find((e) => e.discrepancyType === t);
    console.log(`sample ${t}:`, sample);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
