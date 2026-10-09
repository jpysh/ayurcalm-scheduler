/** The photo of a guest's passport or ID (#510): shrunk on the phone, read from beside Form C. */
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { Loading } from "@/components/kit";

/** A JPEG of about 1200 px on its long side, so a phone's 4 MB camera file leaves as about 200 kb. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("No image"))), "image/jpeg", 0.8));
}

/** The kept photo; `kept` changes when it is retaken, so the picture follows. */
export function PhotoImg({ id, kept, small, quiet, onOpen }: { id: string; kept: string; small?: boolean; quiet?: boolean; onOpen?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  useEffect(() => {
    let url = ""; let dead = false;
    setNone(false);
    fetch(`${API_BASE}/patients/${id}/passport-photo`).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (dead) return; if (b) { url = URL.createObjectURL(b); setSrc(url); } else setNone(true); }).catch(() => { if (!dead) setNone(true); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [id, kept]);
  // Nobody kept one: nothing to show, and no spinner that never ends (#610).
  if (none) return null;
  if (!src) return quiet ? null : <Loading rows={2} />;
  const img = <img src={src} alt="Passport or ID" className={`w-full rounded-xl border ${small ? "max-h-40 object-contain" : ""}`} />;
  return <div className="mb-3">{onOpen ? <button type="button" className="block w-full" aria-label="Open the photo" onClick={onOpen}>{img}</button> : img}</div>;
}
