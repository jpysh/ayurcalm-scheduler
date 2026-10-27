/**
 * Days in a row with a printed sheet, ending today (#1305). A morning not yet
 * printed does not break it, so the line still reads true before the first print.
 */
export function printStreak(dates: Iterable<string>, today: string): number {
  const printed = new Set(dates);
  const back = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  let day = printed.has(today) ? today : back(today);
  let n = 0;
  while (printed.has(day)) { n++; day = back(day); }
  return n;
}
