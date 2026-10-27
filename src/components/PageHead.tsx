import { Search, Settings2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

/** Where ‹ goes (#313): the screen the admin came from, the day if they came from nowhere. Set by the dashboard. */
export const BackContext = createContext<{ label: string; run: () => void } | null>(null);

/** A page's one header line, as docs/design/DESIGN.md's .pagehead: the name, and a short count beside it. `gear` opens the rules for what this screen raises on the pill (#288); `search` sits beside it, clear of the floating buttons at large text (#1314). */
export default function PageHead({ title, note, gear, search }: { title: string; note?: ReactNode; gear?: { label: string; run: () => void }; search?: { label: string; run: () => void } }) {
  const find = search ? <button type="button" aria-label={search.label} onClick={search.run} className="-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"><Search className="h-5 w-5" /></button> : null;
  const back = useContext(BackContext);
  // With Back the title is centred between Back and the gear; Back keeps its own width and a long title wraps beside it at large text (#1150); and the count sits centred under it on the full width so it wraps cleanly (#989).
  if (back) return (
    <div className="grid grid-cols-[minmax(max-content,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 px-1 pb-2 pt-1.5">
      <button type="button" aria-label={`Back to ${back.label}`} onClick={back.run} className="-ml-2 min-h-11 justify-self-start whitespace-nowrap rounded-full px-2 text-base font-semibold text-primary active:bg-secondary">‹ {back.label}</button>
      <h1 className="m-0 break-words text-center text-lg font-semibold">{title}</h1>
      <span className="flex min-w-0 items-center justify-end">
        {find}
        {gear ? <button type="button" aria-label={gear.label} onClick={gear.run} className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"><Settings2 className="h-5 w-5" /></button> : null}
      </span>
      {note ? <p className="col-span-3 m-0 text-center text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 px-1 pb-2 pt-1.5">
      <span className="flex min-w-0 items-center gap-1">
        {back ? <button type="button" aria-label={`Back to ${back.label}`} onClick={back.run} className="-ml-2 min-h-11 shrink-0 rounded-full px-2 text-base font-semibold text-primary active:bg-secondary">‹ {back.label}</button> : null}
        <h1 className="m-0 break-words text-lg font-semibold">{title}</h1>
      </span>
      <span className="flex items-center gap-1">
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
        {find}
        {gear ? <button type="button" aria-label={gear.label} onClick={gear.run} className="-my-2 -mr-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground active:bg-secondary"><Settings2 className="h-5 w-5" /></button> : null}
      </span>
    </div>
  );
}
