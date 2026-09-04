/** Resolve Tier-2 parallelism. Spec default 10; LLM_CONCURRENCY overrides GEMINI_CONCURRENCY. */
export function resolveLlmConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.LLM_CONCURRENCY ?? env.GEMINI_CONCURRENCY;
  if (raw === undefined || raw === "") return 10;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return n;
}
