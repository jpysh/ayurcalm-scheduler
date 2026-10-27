// ruta.jains.es (#245): the landing page, served from ./public by this Worker,
// and the sign-up at /start, passed through to the provisioner behind the tunnel.
// On jains.es itself it owns only /ruta* and /ayurcalm*, which move to ruta.jains.es;
// the rest of jains.es is another project and is never touched from here.
const HOME = 'https://ruta.jains.es';
// The provisioner's own paths: its form posts to /signup and its waiting page polls /status.
const SIGNUP = /^\/(start|signup|again|go|status|founding)(\/|$)/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname !== 'ruta.jains.es') {
      const rest = url.pathname.replace(/^\/(ruta|ayurcalm)\/?/, '');
      return Response.redirect(`${HOME}/${rest}${url.search}`, 301);
    }
    if (SIGNUP.test(url.pathname)) {
      // Same hostname, so this goes to the origin (the tunnel) with the visitor's IP kept.
      const to = new URL(url); to.pathname = url.pathname.replace(/^\/start\/?/, '/');
      return fetch(new Request(to, req));
    }
    if (url.pathname === '/pilot') return env.ASSETS.fetch(new Request(`${url.origin}/ruta/pilot`, req));
    if (url.pathname !== '/') return env.ASSETS.fetch(req);
    const page = await env.ASSETS.fetch(new Request(`${url.origin}/ruta/`, req));
    // Prices in rupees for every visitor: the centres it is for are in India.
    return new HTMLRewriter()
      .on('html', { element: (e) => e.setAttribute('data-cc', 'IN') })
      .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }));
  },
};
