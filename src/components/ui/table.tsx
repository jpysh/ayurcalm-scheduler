import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A list shown as cards on a phone (`cards-sm`, #137) edits by tapping the
 * card: the tap goes to the row's own Edit button (or the one marked
 * data-row-tap), unless it landed on a
 * control of its own (#178).
 */
const tapCardToEdit = (e: React.MouseEvent<HTMLTableElement>) => {
  if (window.innerWidth >= 640) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, a, input, select, textarea, [role=combobox], [role=checkbox]")) return;
  target.closest("tr")?.querySelector<HTMLButtonElement>('button[data-row-tap], button[aria-label="Edit"]')?.click();
};

/** Each cell carries its column's name, so a card's edit sheet can label its fields (index.css). */
const labelCells = (table: HTMLTableElement | null) => {
  if (!table) return;
  const names = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() || "");
  table.querySelectorAll("tbody tr").forEach((tr) => [...tr.children].forEach((td, i) => { if (names[i]) td.setAttribute("data-label", names[i]); }));
};

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const own = React.useRef<HTMLTableElement | null>(null);
    const cards = className?.includes("cards-sm");
    // After every render: rows come and go with the list's filters.
    React.useLayoutEffect(() => { if (cards) labelCells(own.current); });
    return (
      <div className="relative w-full overflow-auto">
        <table ref={(el) => { own.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
          className={cn("w-full caption-bottom text-sm", className)}
          onClick={cards ? tapCardToEdit : undefined} {...props} />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 pl-2 pr-2 md:pl-4 md:pr-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("py-2 pl-2 pr-2 md:py-4 md:pl-4 md:pr-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
