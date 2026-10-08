import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // The next tap anywhere else clears the toast, so it never hides the row the admin reaches for next. Every change is in the history, so nothing is lost.
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.("[data-sonner-toast]")) toast.dismiss(); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, []);
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // Just above the bottom bar, full width on a phone, as the design puts it.
      // Four seconds, and only the latest shows: Undo applies to the last change alone.
      duration={4000}
      visibleToasts={1}
      position="bottom-center"
      offset="84px"
      // Sonner ignores offset at phone width and sits 16px from the edge, over the bar.
      mobileOffset={{ bottom: "84px", left: "16px", right: "16px" }}
      // An open sheet sets pointer-events: none on the page, so Undo under a card could be seen but not tapped (#354).
      style={{ pointerEvents: "auto" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-foreground group-[.toaster]:text-card group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:text-base",
          description: "group-[.toast]:text-muted-foreground",
          // The design's Undo: pale green text on the dark bar, not a filled button.
          actionButton: "group-[.toast]:!bg-transparent group-[.toast]:!text-on-dark group-[.toast]:!font-bold group-[.toast]:!text-base",
          // A second action (the doctors' sheet) reads like the first, not dark on dark (#265 P3).
          cancelButton: "group-[.toast]:!bg-transparent group-[.toast]:!text-on-dark group-[.toast]:!font-bold group-[.toast]:!text-base",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
