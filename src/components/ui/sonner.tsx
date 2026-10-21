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
      // Six seconds so Undo can be reached (#988), and only the latest shows: Undo applies to the last change alone.
      duration={6000}
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
            "group toast group-[.toaster]:bg-foreground group-[.toaster]:text-card group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:text-base group-[.toaster]:flex-wrap",
          // At large text a long action (Undo anyway) would squeeze the words to a few letters a line; it goes under them instead (#902).
          content: "group-[.toast]:min-w-[min(10rem,100%)] group-[.toast]:flex-1",
          description: "group-[.toast]:text-muted-foreground",
          // The design's Undo: pale green text on the dark bar, not a filled button.
          actionButton: "group-[.toast]:!bg-transparent group-[.toast]:!text-on-dark group-[.toast]:!font-bold group-[.toast]:!text-base group-[.toast]:!h-11",
          // A second action (Open card) reads like the first, not dark on dark (#265 P3); Sonner puts it before Undo, which stays last (#1024).
          // Sonner draws both 24px high; 44px is the tap target (#1024).
          cancelButton: "group-[.toast]:!bg-transparent group-[.toast]:!text-on-dark group-[.toast]:!font-bold group-[.toast]:!text-base group-[.toast]:!h-11",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
