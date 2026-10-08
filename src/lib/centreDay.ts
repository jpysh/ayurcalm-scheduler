/** The day the admin is planning: today, or tomorrow once today is past the centre's closing time (#546, #586). */
export function planningDay(today: string, closing: string, timeZone: string, at = new Date()): string {
  const [ch, cm] = String(closing || "").split(":").map(Number);
  if (!Number.isFinite(ch)) return today;
  try {
    const [h, m] = at.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
    if (h * 60 + m < ch * 60 + (cm || 0)) return today;
  } catch { return today; }
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
