// Text a reader cannot see whole (#665), run in the page: wider than its own box, clipped by an
// ancestor that hides overflow, or drawn over other text. An ellipsis is only one of these, which
// is why counting ellipses missed cut room names and overlapping week days.
// Off-screen content inside a scroller (the week strip's other weeks) is not cut, and the list
// scrolling under a sticky header or a floating button is not text drawn over text.
export function cutText() {
  const texts = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    // The words' own box, not the element's: a tall tap target around a short label is not text.
    .map((e) => { const g = document.createRange(); g.selectNodeContents(e); return { e, r: g.getBoundingClientRect() }; })
    .filter(({ e, r }) => r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(e).visibility !== 'hidden');
  const pinned = (e) => { for (let a = e; a; a = a.parentElement) if (['sticky', 'fixed'].includes(getComputedStyle(a).position)) return true; return false; };
  const out = new Set();
  for (const { e, r } of texts) {
    let cut = e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible';
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
    if (w > 2 && h > 2) out.add(`${a.e.textContent.trim().slice(0, 20)} over ${b.e.textContent.trim().slice(0, 20)}`);
  }
  return [...out];
}
