// Text a reader cannot see whole (#665), run in the page: wider than its own box, clipped by an
// ancestor that hides overflow, or drawn over other text. An ellipsis is only one of these, which
// is why counting ellipses missed cut room names and overlapping week days.
// Off-screen content inside a scroller (the week strip's other weeks) is not cut, and the list
// scrolling under a sticky header or a floating button is not text drawn over text. Text for a
// screen reader only (a sheet's Close) is meant to be clipped (#796).
export function cutText() {
  const texts = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    // The words' own box, not the element's: a tall tap target around a short label is not text.
    // Only the part a reader can see counts: a clamped description hides its later lines, and a
    // sheet's list scrolls out of sight under its foot (#798).
    .map((e) => { const g = document.createRange(); g.selectNodeContents(e); let r = g.getBoundingClientRect(); for (let a = e; a; a = a.parentElement) { if (getComputedStyle(a).overflowY === 'visible') continue; const o = a.getBoundingClientRect(); r = new DOMRect(r.left, Math.max(r.top, o.top), r.width, Math.max(0, Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top))); } return { e, r }; })
    .filter(({ e, r }) => r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.sr-only'));
  const pinnedBy = (e) => { for (let a = e; a; a = a.parentElement) if (['sticky', 'fixed'].includes(getComputedStyle(a).position)) return a; return null; };
  const pinned = (e) => !!pinnedBy(e);
  // A sticky header leaving at the end of its group slides under the opaque bar above it (#1160): hidden, not drawn over.
  const hidden = (a, b, x, y) => { const top = document.elementFromPoint(x, y); const bar = top && [pinnedBy(a), pinnedBy(b)].find((p) => p && p.contains(top)); if (!bar || pinnedBy(a) === pinnedBy(b)) return false; for (let c = top; c && c !== bar.parentElement; c = c.parentElement) if (getComputedStyle(c).backgroundColor.replace(/\s/g, '').match(/^rgba?\((\d+,){2}\d+(,(1|0\.9\d*))?\)$/)) return true; return false; };
  const out = new Set();
  for (const { e, r } of texts) {
    let cut = e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible';
    // Words spilling out of a sticky bar end up under whatever sticks below it (#1160).
    const bar = pinnedBy(e);
    if (bar && getComputedStyle(bar).position === 'sticky') { const c = bar.getBoundingClientRect(); cut ||= r.bottom > c.bottom + 1 || r.top < c.top - 1; }
    for (let a = e.parentElement; a && !cut; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === 'auto' || o === 'scroll') break;
      if (o === 'hidden' || o === 'clip') { const c = a.getBoundingClientRect(); cut = r.right > c.right + 1 || r.left < c.left - 1; break; }
    }
    if (cut) out.add(e.textContent.trim().slice(0, 40));
  }
  for (const [i, a] of texts.entries()) for (const b of texts.slice(i + 1)) {
    if (a.e.contains(b.e) || b.e.contains(a.e) || pinned(a.e) !== pinned(b.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 2 && !hidden(a.e, b.e, Math.max(a.r.left, b.r.left) + w / 2, Math.max(a.r.top, b.r.top) + h / 2)) out.add(`${a.e.textContent.trim().slice(0, 20)} over ${b.e.textContent.trim().slice(0, 20)}`);
  }
  return [...out];
}
