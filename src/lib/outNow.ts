/** Out at this minute on the centre's clock: an outage later today or one already over is not "out" (#743, #772). */
export const outNow = (e: { date?: string | null; start_date?: string | null; end_date?: string | null; start_time: string | null; end_time: string | null }, today: string, nowHM: string) =>
  (e.start_date ?? e.date ?? "").slice(0, 10) <= today && (e.end_date ?? e.date ?? "").slice(0, 10) >= today
  && (!e.start_time || !e.end_time || (e.start_time <= nowHM && nowHM < e.end_time));
