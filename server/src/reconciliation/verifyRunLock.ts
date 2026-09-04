import assert from "node:assert/strict";
import {
  tryAcquireRunLock,
  releaseRunLock,
  isRunInProgress,
} from "./runLock";

assert.equal(isRunInProgress(), false);
assert.equal(tryAcquireRunLock(), true);
assert.equal(isRunInProgress(), true);
assert.equal(tryAcquireRunLock(), false, "second acquire must fail");
releaseRunLock();
assert.equal(isRunInProgress(), false);
assert.equal(tryAcquireRunLock(), true);
releaseRunLock();

console.log("verifyRunLock: OK");
