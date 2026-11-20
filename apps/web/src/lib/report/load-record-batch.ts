export async function loadRecordBatch<T, R>(
  students: readonly T[],
  load: (student: T) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const records = new Array<R>(students.length);
  let next = 0;
  let failure: unknown;
  const workers = Array.from(
    { length: Math.min(concurrency, students.length) },
    async () => {
      while (failure === undefined && next < students.length) {
        const index = next++;
        try {
          records[index] = await load(students[index]);
        } catch (error) {
          failure ??= error;
        }
      }
    },
  );
  await Promise.all(workers);
  if (failure !== undefined) throw failure;
  return records;
}
