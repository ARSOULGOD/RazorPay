// Routes each candidate to Tier-1 deterministic matching or Tier-2 LLM reasoning.

import { resolveLlmConcurrency } from "./llmConcurrency";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { emitLog, emitProgress, type RunEventSink } from "./runEvents";
import { findExactMatchesWithCoverage } from "./tier1-deterministic/exactMatcher";
import { buildReconciliationPrompt } from "./tier2-llm/buildReconciliationPrompt";
import {
  getGeminiApiKey,
  getGeminiClient,
  getGeminiModelName,
  sleep,
} from "./tier2-llm/geminiClient";
import {
  getGroqApiKey,
  getGroqClient,
  getGroqModelName,
  failoverRetryDelayMs,
  isQuotaOrRateLimitError,
} from "./tier2-llm/groqClient";
import {
  decisionFromParsedObject,
  extractFailedGeneration,
  isJsonValidateFailedError,
  parseReconciliationResponse,
  tryParseJsonObject,
} from "./tier2-llm/parseReconciliationResponse";
import type {
  BankTxnView,
  LedgerView,
  ReconciliationCandidate,
  ReconciliationDecision,
  SettlementView,
} from "../types/reconciliation.types";

function buildAmbiguousCandidates(
  banks: BankTxnView[],
  ledgers: LedgerView[],
  settlements: SettlementView[],
  usedBank: Set<string>,
  usedLedger: Set<string>,
  usedSettlement: Set<string>,
): ReconciliationCandidate[] {
  const ledgerById = new Map(ledgers.map((l) => [l.ledgerEntryId, l]));
  const bankById = new Map(banks.map((b) => [b.bankTxnId, b]));
  const settlementById = new Map(settlements.map((s) => [s.settlementId, s]));

  const candidates: ReconciliationCandidate[] = [];
  const queuedLedger = new Set<string>();
  const queuedBank = new Set<string>();
  const queuedSettlement = new Set<string>();

  const push = (c: ReconciliationCandidate) => {
    if (c.ledger) queuedLedger.add(c.ledger.ledgerEntryId);
    if (c.bank) queuedBank.add(c.bank.bankTxnId);
    if (c.settlement) queuedSettlement.add(c.settlement.settlementId);
    candidates.push(c);
  };

  // Prefer ledger-anchored candidates with whatever linked peers remain.
  for (const ledger of ledgers) {
    if (usedLedger.has(ledger.ledgerEntryId) || queuedLedger.has(ledger.ledgerEntryId)) {
      continue;
    }

    const bank =
      (ledger.linkedBankTxnId &&
        !usedBank.has(ledger.linkedBankTxnId) &&
        bankById.get(ledger.linkedBankTxnId)) ||
      null;

    const settlement =
      (ledger.linkedSettlementId &&
        !usedSettlement.has(ledger.linkedSettlementId) &&
        settlementById.get(ledger.linkedSettlementId)) ||
      null;

    // Also try bank→ledger link if ledger didn't point at bank.
    let resolvedBank = bank;
    if (!resolvedBank) {
      const viaBank = banks.find(
        (b) =>
          !usedBank.has(b.bankTxnId) &&
          !queuedBank.has(b.bankTxnId) &&
          b.linkedLedgerId === ledger.ledgerEntryId,
      );
      resolvedBank = viaBank ?? null;
    }

    let resolvedSettlement = settlement;
    if (!resolvedSettlement) {
      const viaSet = settlements.find(
        (s) =>
          !usedSettlement.has(s.settlementId) &&
          !queuedSettlement.has(s.settlementId) &&
          s.linkedLedgerId === ledger.ledgerEntryId,
      );
      resolvedSettlement = viaSet ?? null;
    }

    push({
      bank: resolvedBank,
      ledger,
      settlement: resolvedSettlement,
      deferralReason:
        "Tier-1 could not prove exact ID+amount+timestamp equality across a full 3-way triangle.",
    });
  }

  // Remaining unused banks (orphans / extras).
  for (const bank of banks) {
    if (usedBank.has(bank.bankTxnId) || queuedBank.has(bank.bankTxnId)) continue;
    const ledger =
      (bank.linkedLedgerId && ledgerById.get(bank.linkedLedgerId)) || null;
    push({
      bank,
      ledger: ledger && !usedLedger.has(ledger.ledgerEntryId) ? ledger : null,
      settlement: null,
      deferralReason: "Unmatched bank transaction after Tier-1 pass.",
    });
  }

  // Remaining unused settlements.
  for (const settlement of settlements) {
    if (
      usedSettlement.has(settlement.settlementId) ||
      queuedSettlement.has(settlement.settlementId)
    ) {
      continue;
    }
    const ledger =
      (settlement.linkedLedgerId && ledgerById.get(settlement.linkedLedgerId)) ||
      null;
    push({
      bank: null,
      ledger: ledger && !usedLedger.has(ledger.ledgerEntryId) ? ledger : null,
      settlement,
      deferralReason: "Unmatched settlement record after Tier-1 pass.",
    });
  }

  // Deduplicate identical candidate triples (split/many-to-one leftover paths
  // can enqueue the same ledger more than once).
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = [
      c.bank?.bankTxnId ?? "",
      c.ledger?.ledgerEntryId ?? "",
      c.settlement?.settlementId ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveViaGemini(
  candidate: ReconciliationCandidate,
  prompt: string,
): Promise<ReconciliationDecision> {
  const model = getGeminiClient().getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const maxAttempts = 4;
  const timeoutMs = 30_000; // 30-second timeout per call
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let result;
      try {
        result = await model.generateContent(prompt);
      } finally {
        clearTimeout(timeout);
      }
      const text = result.response.text();
      const decision = parseReconciliationResponse(text, candidate);
      return {
        ...decision,
        reasoning: `[via gemini-fallback/${getGeminiModelName()}] ${decision.reasoning}`,
      };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!isQuotaOrRateLimitError(message) || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = failoverRetryDelayMs(message);
      console.warn(
        `Tier-2 Gemini transient error (attempt ${attempt}/${maxAttempts}); waiting ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resolveViaGroq(
  candidate: ReconciliationCandidate,
  prompt: string,
): Promise<ReconciliationDecision> {
  const maxAttempts = 4;
  const timeoutMs = 30_000; // 30-second timeout per call
  let lastError: unknown;
  let jsonRepairAttempted = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let completion;
      try {
        completion = await getGroqClient().chat.completions.create({
          model: getGroqModelName(),
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a finance-operations reconciliation agent. Reply with a single JSON object only.",
            },
            { role: "user", content: prompt },
          ],
        });
      } finally {
        clearTimeout(timeout);
      }

      const text = completion.choices[0]?.message?.content ?? "";
      const decision = parseReconciliationResponse(text, candidate);
      return {
        ...decision,
        reasoning: `[via groq/${getGroqModelName()}] ${decision.reasoning}`,
      };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);

      // Recover near-valid JSON from Groq's failed_generation payload.
      if (isJsonValidateFailedError(message)) {
        const failedGen = extractFailedGeneration(message);
        if (failedGen) {
          const recovered = tryParseJsonObject(failedGen);
          if (recovered) {
            const decision = decisionFromParsedObject(
              recovered,
              candidate,
              failedGen,
            );
            console.warn(
              "Tier-2 Groq json_validate_failed — recovered from failed_generation",
            );
            return {
              ...decision,
              reasoning: `[via groq-repaired/${getGroqModelName()}] ${decision.reasoning}`,
            };
          }
        }

        if (!jsonRepairAttempted) {
          jsonRepairAttempted = true;
          console.warn(
            "Tier-2 Groq json_validate_failed — retrying once with repair prompt",
          );
          try {
            const repair = await getGroqClient().chat.completions.create({
              model: getGroqModelName(),
              temperature: 0,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content:
                    "Return ONLY a valid JSON object with keys status, confidence, discrepancyType, reasoning. No markdown.",
                },
                {
                  role: "user",
                  content: `Fix this into valid JSON matching the schema. Broken output:\n${failedGen ?? message.slice(0, 1500)}\n\nOriginal task:\n${prompt.slice(0, 4000)}`,
                },
              ],
            });
            const repairedText = repair.choices[0]?.message?.content ?? "";
            const decision = parseReconciliationResponse(repairedText, candidate);
            if (
              decision.status !== "EXCEPTION" ||
              !decision.reasoning.startsWith("Tier-2 parse failure")
            ) {
              return {
                ...decision,
                reasoning: `[via groq-repaired/${getGroqModelName()}] ${decision.reasoning}`,
              };
            }
          } catch {
            // fall through to failover throw
          }
        }
        // Let resolveViaLlm fall back to Gemini.
        throw err;
      }

      const isModelMissing =
        /model_not_found/i.test(message) ||
        /does not exist or you do not have access/i.test(message);
      if (isModelMissing || !isQuotaOrRateLimitError(message) || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = failoverRetryDelayMs(message);
      console.warn(
        `Tier-2 Groq transient error (attempt ${attempt}/${maxAttempts}); waiting ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Tier-2 LLM resolution: Groq primary → Gemini on quota/429/503 exhaustion
 * (or if GROQ_API_KEY missing). Never force-matches when both fail.
 */
async function resolveViaLlm(
  candidate: ReconciliationCandidate,
): Promise<ReconciliationDecision> {
  const prompt = buildReconciliationPrompt(candidate);
  const hasGemini = Boolean(getGeminiApiKey());
  const hasGroq = Boolean(getGroqApiKey());

  if (!hasGemini && !hasGroq) {
    return {
      status: "EXCEPTION",
      confidence: 0,
      discrepancyType: null,
      reasoning:
        "Tier-2 deferred: neither GROQ_API_KEY nor GEMINI_API_KEY is set. Record left unresolved rather than force-matched.",
      bankTxnId: candidate.bank?.bankTxnId ?? null,
      ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
      settlementId: candidate.settlement?.settlementId ?? null,
      resolvedByLLM: true,
    };
  }

  if (hasGroq) {
    try {
      return await resolveViaGroq(candidate, prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!hasGemini || !isQuotaOrRateLimitError(message)) {
        throw err;
      }
      console.warn(
        `Tier-2 Groq unavailable/quota; falling back to Gemini (${getGeminiModelName()})`,
      );
    }
  } else {
    console.warn("Tier-2: GROQ_API_KEY missing; using Gemini directly");
  }

  try {
    return await resolveViaGemini(candidate, prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "EXCEPTION",
      confidence: 0,
      discrepancyType: null,
      reasoning: `Tier-2 failed on Groq and Gemini; left unresolved rather than force-matched. Last error: ${message}`,
      bankTxnId: candidate.bank?.bankTxnId ?? null,
      ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
      settlementId: candidate.settlement?.settlementId ?? null,
      resolvedByLLM: true,
    };
  }
}

/**
 * Full routing: Tier-1 exact matches first, then Tier-2 for remaining candidates.
 */
export async function routeReconciliation(
  banks: BankTxnView[],
  ledgers: LedgerView[],
  settlements: SettlementView[],
  options?: { skipLlm?: boolean; onEvent?: RunEventSink },
): Promise<ReconciliationDecision[]> {
  const { decisions: tier1, usedBankIds, usedLedgerIds, usedSettlementIds } =
    findExactMatchesWithCoverage(banks, ledgers, settlements);

  const candidates = buildAmbiguousCandidates(
    banks,
    ledgers,
    settlements,
    usedBankIds,
    usedLedgerIds,
    usedSettlementIds,
  );

  const tier2: ReconciliationDecision[] = [];
  const total = candidates.length;
  emitLog(
    options?.onEvent,
    `routeReconciliation: Tier-1 resolved ${tier1.length}; Tier-2 candidates ${total}`,
  );
  emitProgress(options?.onEvent, "tier1", 1, 1);

  if (options?.skipLlm) {
    emitLog(options?.onEvent, `Tier-2 skipped (skipLlm=true); ${total} left unresolved`);
    for (const candidate of candidates) {
      tier2.push({
        status: "EXCEPTION",
        confidence: 0,
        discrepancyType: null,
        reasoning:
          "Tier-2 skipped (skipLlm=true). Unresolved after Tier-1; not force-matched.",
        bankTxnId: candidate.bank?.bankTxnId ?? null,
        ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
        settlementId: candidate.settlement?.settlementId ?? null,
        resolvedByLLM: false,
      });
    }
    return [...tier1, ...tier2];
  }

  const concurrency = resolveLlmConcurrency();
  
  const tier2Wrapped = await mapWithConcurrency(
    candidates,
    concurrency,
    async (candidate, index) => {
      const label =
        candidate.ledger?.ledgerEntryId ??
        candidate.bank?.bankTxnId ??
        candidate.settlement?.settlementId ??
        `idx_${index}`;
      const t0 = Date.now();
      try {
        const decision = await resolveViaLlm(candidate);
        const duration = Date.now() - t0;
        return {
          label,
          decision: { ...decision, llmDurationMs: duration },
        };
      } catch (err) {
        const duration = Date.now() - t0;
        const message = err instanceof Error ? err.message : String(err);
        return {
          label,
          decision: {
            status: "EXCEPTION" as const,
            confidence: 0,
            discrepancyType: null,
            reasoning: `Tier-2 API failure: ${message}`,
            bankTxnId: candidate.bank?.bankTxnId ?? null,
            ledgerEntryId: candidate.ledger?.ledgerEntryId ?? null,
            settlementId: candidate.settlement?.settlementId ?? null,
            resolvedByLLM: true,
            llmDurationMs: duration,
          },
        };
      }
    },
    ({ completed, total: t, result }) => {
      const duration = result.decision.llmDurationMs ?? 0;
      emitLog(
        options?.onEvent,
        `Tier-2 ${completed}/${t} ${result.label} → ${result.decision.status} (${duration}ms)`,
      );
      emitProgress(options?.onEvent, "tier2", completed, t);
    },
  );
  
  const finalTier2 = tier2Wrapped.map((w) => w.decision);
  return [...tier1, ...finalTier2];
}
