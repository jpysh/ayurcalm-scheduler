/** Guest rooms (#456): the rooms patients sleep in. Pure, so the seed and the tests share it. */

/** "T1–T6" is six rooms, "101-104" four, "T1, T2, Hut A" three; anything else is one room by that name. */
export function expandRoomNames(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)(\d+)\s*[-–—]\s*(?:\1)?(\d+)$/);
    const [from, to] = m ? [Number(m[2]), Number(m[3])] : [0, -1];
    if (!m || to < from || to - from >= 50) { names.push(part); continue; }
    for (let n = from; n <= to; n++) names.push(`${m[1]}${String(n).padStart(m[2].length, '0')}`);
  }
  return [...new Set(names)];
}
