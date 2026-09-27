/**
 * The one confirmation the app asks, as a bottom sheet in the app's own look
 * rather than the browser's pop-up (#67). Only for what cannot be undone;
 * anything that can is done at once with Undo instead.
 *
 *   if (!(await confirmSheet("Delete Asha?", "Delete"))) return;
 */
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomBar";

type Ask = { text: string; ok: string; resolve: (yes: boolean) => void };
let show: ((a: Ask) => void) | null = null;

export const confirmSheet = (text: string, ok = "Yes") =>
  new Promise<boolean>((resolve) => (show ? show({ text, ok, resolve }) : resolve(false)));

/** Mounted once, in App. */
export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => { show = setAsk; return () => { show = null; }; }, []);
  const answer = (yes: boolean) => { ask?.resolve(yes); setAsk(null); };
  const [first, ...rest] = (ask?.text || "").split("\n\n");
  return (
    <BottomSheet open={!!ask} onOpenChange={(o) => { if (!o) answer(false); }} title="">
      <p className="text-[16px] font-semibold">{first}</p>
      {rest.map((r) => <p key={r} className="mt-1 text-sm text-muted-foreground">{r}</p>)}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded-full border-[1.5px] border-border bg-card font-semibold" onClick={() => answer(false)}>Cancel</button>
        <button type="button" className="min-h-11 rounded-full border-[1.5px] border-destructive font-semibold text-destructive" onClick={() => answer(true)}>{ask?.ok}</button>
      </div>
    </BottomSheet>
  );
}
