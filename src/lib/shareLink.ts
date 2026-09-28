import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

/**
 * A person's private link (#219), shared through the phone's own share sheet
 * (WhatsApp, SMS), or copied where there is none. renew makes a new link and
 * stops the old one, for a lost phone or someone who has left.
 */
export async function shareLink(kind: "staff" | "patients", id: string, name: string, renew = false) {
  const res = await fetch(`${API_BASE}/${kind}/${id}/link${renew ? "?renew=1" : ""}`, { method: "POST" });
  if (!res.ok) { toast.error("The link could not be made."); return; }
  const url = `${window.location.origin}/l/${(await res.json()).token}`;
  const text = `${name}: your day at the centre`;
  try {
    if (navigator.share) { await navigator.share({ title: text, url }); return; }
  } catch { return; /* closed the share sheet */ }
  try { await navigator.clipboard.writeText(url); toast.success(renew ? "New link copied. The old one no longer works." : "Link copied"); }
  catch { toast(url, { duration: 20000 }); }
}
