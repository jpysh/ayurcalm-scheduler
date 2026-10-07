/**
 * A person's private link (#219), sent from a sheet (#413): Send on WhatsApp to
 * their phone with one line of text, or Copy link. The phone's own share sheet
 * was the only way before, and without one the admin got a raw URL to copy by hand.
 * renew makes a new link and stops the old one, for a lost phone or someone who has left.
 */
import { useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, Btn, LinkBtn } from "@/components/kit";

type Shared = { name: string; phone: string | null; url: string; renewed: boolean };

/** wa.me wants the number with its country code and no symbols; a 10-digit number is taken as Indian. */
export const waHref = (phone: string | null, text: string) => {
  let d = (phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) d = `91${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

export function useShareLink() {
  const [shared, setShared] = useState<Shared | null>(null);
  const share = async (kind: "staff" | "patients", id: string, name: string, renew = false) => {
    const res = await fetch(`${API_BASE}/${kind}/${id}/link${renew ? "?renew=1" : ""}`, { method: "POST" });
    if (!res.ok) { toast.error("The link could not be made."); return; }
    const body = await res.json();
    setShared({ name, phone: body.phone || null, url: `${window.location.origin}/l/${body.token}`, renewed: renew });
  };
  const first = shared?.name.split(" ")[0] ?? "";
  const text = shared ? `${first}, your day at the centre, always up to date: ${shared.url}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(shared!.url); toast.success("Link copied"); setShared(null); }
    catch { toast(shared!.url, { duration: 20000 }); }
  };
  const sheet = (
    <BottomSheet open={!!shared} onOpenChange={(o) => { if (!o) setShared(null); }} title={`${first}'s link`}
      note={shared?.renewed ? "A new link. The old one no longer works." : "Their day on their own phone, always up to date."}>
      <div className="flex flex-col gap-2 pb-2">
        <LinkBtn kind="primary" href={waHref(shared?.phone ?? null, text)} onClick={() => setShared(null)}>
          {shared?.phone ? `Send on WhatsApp to ${first}` : "Send on WhatsApp"}
        </LinkBtn>
        {shared && !shared.phone ? <p className="text-sm text-muted-foreground">No phone saved for {first}: WhatsApp will ask who to send it to.</p> : null}
        <Btn onClick={copy}>Copy link</Btn>
      </div>
    </BottomSheet>
  );
  return { share, sheet };
}
