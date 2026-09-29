// jains.es/ruta (#245): the landing page, served from ./public by this Worker.
// The only jains.es routes it owns are /ruta* and /ayurcalm*; the rest of
// jains.es is another project and is never touched from here.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/ayurcalm')) return Response.redirect(`${url.origin}/ruta${url.search}`, 301);
    if (url.pathname === '/ruta/') return Response.redirect(`${url.origin}/ruta${url.search}`, 301);
    if (url.pathname !== '/ruta') return env.ASSETS.fetch(req);
    const page = await env.ASSETS.fetch(new Request(`${url.origin}/ruta/`, req));
    const left = await foundingLeft();
    // Prices in INR for India, USD elsewhere; the founding counter from the real number.
    return new HTMLRewriter()
      .on('html', { element: (e) => e.setAttribute('data-cc', req.cf?.country === 'IN' || !req.cf?.country ? 'IN' : 'XX') })
      .on('#left', { element: (e) => { if (left != null) { e.removeAttribute('hidden'); e.setInnerContent(left > 0 ? `${left} of 10 founding places left` : 'Founding places are taken'); } } })
      .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', vary: 'cf-ipcountry' } }));
  },
};

async function foundingLeft() {
  try {
    const r = await fetch('https://signup.jains.es/founding', { cf: { cacheTtl: 300 } });
    return r.ok ? (await r.json()).left : null;
  } catch { return null; }
}
