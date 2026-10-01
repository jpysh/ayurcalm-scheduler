import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";

/** A page's one header line, as docs/design/phone.html's .pagehead: the name, and a short count beside it. `gear` opens the rules for what this screen raises on the pill (#288). */
export default function PageHead({ title, note, gear }: { title: string; note?: ReactNode; gear?: { label: string; run: () => void } }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-3.5">
      <h1 className="m-0 text-lg font-semibold">{title}</h1>
      <span className="flex items-center gap-1">
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
        {gear ? <button type="button" aria-label={gear.label} onClick={gear.run} className="-my-2 -mr-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground active:bg-secondary"><Settings2 className="h-5 w-5" /></button> : null}
      </span>
    </div>
  );
}
