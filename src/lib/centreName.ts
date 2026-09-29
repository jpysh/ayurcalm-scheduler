import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { PRODUCT } from "../../server/src/product";


export type DemoInfo = { email: string; password: string; next_reset: string };
type Support = { centre_name?: string; demo?: DemoInfo };

// One request for the whole page: the login screen and the demo banner both read it.
let support: Promise<Support | null> | null = null;
const loadSupport = () => (support ??= fetch(`${API_BASE}/public/support`).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** The centre's own name from Settings; public, so the login page can show it too. */
export function useCentreName(fallback = PRODUCT) {
  const [name, setName] = useState(fallback);
  useEffect(() => { loadSupport().then((d) => { if (d?.centre_name) setName(d.centre_name); }); }, []);
  return name;
}

/** Set only on the public demo (#84): its sign-in and when it is next put back. */
export function useDemo() {
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  useEffect(() => { loadSupport().then((d) => setDemo(d?.demo ?? null)); }, []);
  return demo;
}
