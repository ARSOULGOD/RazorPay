import assert from "node:assert/strict";
import { mapWithConcurrency } from "./mapWithConcurrency";

async function main() {
  let inFlight = 0;
  let maxInFlight = 0;
  const progress: number[] = [];

  const items = Array.from({ length: 10 }, (_, i) => i);
  const results = await mapWithConcurrency(
    items,
    3,
    async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return item * 2;
    },
    ({ completed }) => {
      progress.push(completed);
    },
  );

  assert.deepEqual(results, items.map((i) => i * 2));
  assert.ok(maxInFlight <= 3, `maxInFlight=${maxInFlight} expected ≤ 3`);
  assert.ok(maxInFlight >= 2, `maxInFlight=${maxInFlight} expected some parallelism`);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // concurrency < 1 must behave like 1
  const single = await mapWithConcurrency([1, 2], 0, async (x) => x);
  assert.deepEqual(single, [1, 2]);

  console.log("verifyMapWithConcurrency: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
