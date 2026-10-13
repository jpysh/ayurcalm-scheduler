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
    // Prices in rupees for every visitor: the centres it is for are in India.
    return new HTMLRewriter()
      .on('html', { element: (e) => e.setAttribute('data-cc', 'IN') })
      .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }));
  },
};

