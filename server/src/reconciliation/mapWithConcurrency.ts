/**
 * Run async mapper over items with a fixed concurrency cap.
 * Results preserve input order. onItemDone fires as each item finishes
 * (completion order, not input order) with a monotonic completed count.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemDone?: (info: {
    completed: number;
    total: number;
    index: number;
    result: R;
  }) => void,
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];

  const limit = Math.max(1, Math.floor(concurrency) || 1);
  const results: R[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      const result = await mapper(items[index]!, index);
      results[index] = result;
      completed += 1;
      onItemDone?.({ completed, total, index, result });
    }
  }

  const workers = Array.from({ length: Math.min(limit, total) }, () => worker());
  await Promise.all(workers);
  return results;
}
