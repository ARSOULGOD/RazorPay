import assert from "node:assert/strict";
import { resolveLlmConcurrency } from "./llmConcurrency";

assert.equal(resolveLlmConcurrency({}), 10, "default must be 10");
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "8" }), 8);
assert.equal(resolveLlmConcurrency({ GEMINI_CONCURRENCY: "3" }), 3);
assert.equal(
  resolveLlmConcurrency({ LLM_CONCURRENCY: "12", GEMINI_CONCURRENCY: "2" }),
  12,
  "LLM_CONCURRENCY wins over GEMINI_CONCURRENCY",
);
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "0" }), 10, "0 is invalid → default");
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "-1" }), 10);
assert.equal(resolveLlmConcurrency({ LLM_CONCURRENCY: "nope" }), 10);

console.log("verifyLlmConcurrency: OK");
