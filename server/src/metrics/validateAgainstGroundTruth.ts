// Internal accuracy check of agent output against hidden ground-truth event mapping.

import fs from "node:fs";
import path from "node:path";
import type { GroundTruthValidationSummary } from "../types/reconciliation.types";

interface MappingEvent {
  eventId: string;
  discrepancyType: string;
  bankTxnIds: string[];
  ledgerEntryIds: string[];
  settlementIds: string[];
}

interface MappingFile {
  events: MappingEvent[];
}

export interface ResultRowForValidation {
  bankTxnId: string | null;
  ledgerEntryId: string | null;
  settlementId: string | null;
  status: string;
  discrepancyType: string | null;
}

function defaultMappingPath(): string {
  return path.resolve(__dirname, "../../../ground-truth/event-mapping.json");
}

/**
 * Compares ReconciliationResult rows to ground-truth mapping.
 * Never used by the agent loop itself — internal validation only.
 */
export function validateAgainstGroundTruth(
  results: ResultRowForValidation[],
  mappingPath: string = defaultMappingPath(),
): GroundTruthValidationSummary {
  const raw = fs.readFileSync(mappingPath, "utf8");
  const mapping = JSON.parse(raw) as MappingFile;
  const notes: string[] = [];

  let exactMatchEventsFullyMatched = 0;
  let orphanEventsMarkedException = 0;
  let orphanEventsNotException = 0;

  const byBank = new Map(
    results.filter((r) => r.bankTxnId).map((r) => [r.bankTxnId!, r]),
  );
  const byLedger = new Map(
    results.filter((r) => r.ledgerEntryId).map((r) => [r.ledgerEntryId!, r]),
  );

  for (const event of mapping.events ?? []) {
    if (event.discrepancyType === "exactMatch") {
      const bankId = event.bankTxnIds[0];
      const hit = bankId ? byBank.get(bankId) : undefined;
      if (hit?.status === "MATCHED" && hit.discrepancyType === "exactMatch") {
        exactMatchEventsFullyMatched += 1;
      } else {
        notes.push(
          `exactMatch ${event.eventId}: expected MATCHED/exactMatch, got ${hit?.status ?? "missing"}/${hit?.discrepancyType ?? "n/a"}`,
        );
      }
    }

    if (event.discrepancyType === "trueOrphan") {
      const ids = [
        ...event.bankTxnIds,
        ...event.ledgerEntryIds,
        ...event.settlementIds,
      ];
      const related = ids
        .map((id) => byBank.get(id) ?? byLedger.get(id) ?? results.find((r) => r.settlementId === id))
        .filter(Boolean);

      const anyException = related.some((r) => r?.status === "EXCEPTION");
      if (anyException || related.length === 0) {
        orphanEventsMarkedException += 1;
      } else {
        orphanEventsNotException += 1;
        notes.push(
          `trueOrphan ${event.eventId}: expected EXCEPTION, got statuses=${related.map((r) => r?.status).join(",")}`,
        );
      }
    }
  }

  return {
    eventsChecked: mapping.events?.length ?? 0,
    exactMatchEventsFullyMatched,
    orphanEventsMarkedException,
    orphanEventsNotException,
    notes,
  };
}
