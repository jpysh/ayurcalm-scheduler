/**
 * Whether typed text finds a patient (#934). A desk question is a name in
 * either order ('das aarohi'), or a number a caller read out in any format
 * ('+91-92728 63339', '92728'). The browser only sends the text.
 */
const digits = (s: string) => s.replace(/\D/g, '');

export function patientMatches(p: { name: string; phone?: string | null; emergency_phone?: string | null }, q: string, extra = ''): boolean {
  const text = q.trim().toLowerCase();
  if (!text) return false;
  // Only digits and number punctuation: a phone. Three digits is enough to start, the tail of a long number is what counts.
  if (/^[\d\s+\-().]+$/.test(text)) {
    const d = digits(text);
    if (d.length < 3) return false;
    const tail = d.length > 10 ? d.slice(-10) : d;
    return [p.phone, p.emergency_phone].some((n) => n && digits(n).includes(tail));
  }
  const hay = `${p.name} ${extra}`.toLowerCase();
  return text.split(/\s+/).every((w) => hay.includes(w));
}
