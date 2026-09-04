let locked = false;

export function tryAcquireRunLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}

export function releaseRunLock(): void {
  locked = false;
}

export function isRunInProgress(): boolean {
  return locked;
}
