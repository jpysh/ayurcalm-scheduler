import type { ReactNode } from "react";

/** A page's one header line, as docs/design/phone.html's .pagehead: the name, and a short count beside it. */
export default function PageHead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-2 pt-3.5">
      <h1 className="m-0 text-lg font-semibold">{title}</h1>
      {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
    </div>
  );
}
