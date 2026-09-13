import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

/** The centre's own name from Settings; public, so the login page can show it too. */
export function useCentreName(fallback = "AyurCalm") {
  const [name, setName] = useState(fallback);
  useEffect(() => {
    fetch(`${API_BASE}/public/support`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { centre_name?: string } | null) => { if (d?.centre_name) setName(d.centre_name); })
      .catch(() => { /* keep the fallback */ });
  }, []);
  return name;
}
