/** What people see the product called (#253). The web app, index.html and the API all read this one line. */
export const PRODUCT = 'Ruta';

/** The line on every sheet and link page (#249): always on, unless a paying centre turned it off. */
export const MADE_WITH = `Made with ${PRODUCT} · try it free for 30 days · jains.es/ruta`;
export const madeWith = (s: { plan?: string | null; show_footer?: boolean } | null) => (s?.plan && s.show_footer === false ? '' : MADE_WITH);

/** Plans (#250) and where "Choose a plan" goes while billing is manual: the maintainer's WhatsApp. */
export const SALES_WHATSAPP = '420777558262';
export const PLANS = [
  { id: 'cloud', name: 'Cloud + support', price: '₹1,499 a month' },
  { id: 'onprem', name: 'On-premise + support', price: '₹999 a month' },
  { id: 'founding', name: 'Founding centre', price: '₹999 a month for life, first 10 centres' },
];
