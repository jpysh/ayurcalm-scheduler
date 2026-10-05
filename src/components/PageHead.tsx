import { Settings2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

/** Where ‹ goes (#313): the screen the admin came from, the day if they came from nowhere. Set by the dashboard. */
export const BackContext = createContext<{ label: string; run: () => void } | null>(null);

/** A page's one header line, as docs/design/phone.html's .pagehead: the name, and a short count beside it. `gear` opens the rules for what this screen raises on the pill (#288). */
export default function PageHead({ title, note, gear }: { title: string; note?: ReactNode; gear?: { label: string; run: () => void } }) {
  const back = useContext(BackContext);
  return (
    <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-1.5">
      <span className="flex min-w-0 items-center gap-1">
        {back ? <button type="button" aria-label={`Back to ${back.label}`} onClick={back.run} className="-ml-2 min-h-11 shrink-0 rounded-full px-2 text-base font-semibold text-primary active:bg-secondary">‹ {back.label}</button> : null}
        <h1 className="m-0 truncate text-lg font-semibold">{title}</h1>
      </span>
      <span className="flex items-center gap-1">
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
        {gear ? <button type="button" aria-label={gear.label} onClick={gear.run} className="-my-2 -mr-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground active:bg-secondary"><Settings2 className="h-5 w-5" /></button> : null}
      </span>
    </div>
  );
}
