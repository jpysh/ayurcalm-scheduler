import { Btn } from "@/components/kit";
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
    <BottomSheet open={!!ask} onOpenChange={(o) => { if (!o) answer(false); }} title="" label="Please confirm">
      <p className="text-base font-semibold">{first}</p>
      {rest.map((r) => <p key={r} className="mt-1 text-sm text-muted-foreground">{r}</p>)}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn kind="secondary" inline onClick={() => answer(false)}>Cancel</Btn>
        <Btn kind="destructive" inline className="border-[1.5px] border-destructive" onClick={() => answer(true)}>{ask?.ok}</Btn>
      </div>
    </BottomSheet>
  );
}
