import { PRODUCT } from "../../server/src/product";
import { useEffect, useState } from "react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { noteText, wide } from "@/components/kit";

type Status = { connected: boolean; created_at: string | null; last_used_at: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

/**
 * Settings → connect the admin's own AI assistant (#119). Optional: every job
 * works in the app without it. One download for Claude Desktop on this
 * computer; the key is inside the file and never shown.
 */
export const AssistantSection = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`${API_BASE}/mcp-key`).then((r) => (r.ok ? r.json() : null)).then(setStatus).catch(() => setStatus(null));
  useEffect(() => { load(); }, []);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/mcp-key/extension`, { method: "POST" });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${PRODUCT}.mcpb`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded. Double-click ${PRODUCT}.mcpb to add it to Claude Desktop.`);
      load();
    } catch { toast.error("Could not create the download"); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!(await confirmSheet("Disconnect Claude?\n\nIt stops working until you download the extension again.", "Disconnect"))) return;
    const res = await fetch(`${API_BASE}/mcp-key`, { method: "DELETE" });
    if (res.ok) { toast.success("Disconnected"); load(); } else toast.error("Could not disconnect");
  };
  return (
    <div>
      <p className={noteText}>Optional. Ask Claude about your centre: today's day, who is in house, who is free, what is wrong with a day, and the day sheet.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px]">
        <li>Install Claude Desktop on this computer, if you have not.</li>
        <li>Download the {PRODUCT} extension below and double-click it. Claude asks to install it: tap Install.</li>
        <li>In Claude, ask: "What's on tomorrow at the centre?"</li>
      </ol>
      {status?.connected ? <p className={`mt-2 ${noteText}`}>Connected {when(status.created_at)}. Last used: {when(status.last_used_at)}. Downloading again replaces the old connection.</p> : null}
      <button type="button" disabled={busy} className={`${wide} mt-3 bg-primary text-primary-foreground disabled:opacity-50`} onClick={download}>{status?.connected ? "Download again" : "Download for Claude Desktop"}</button>
      {status?.connected ? <button type="button" className={`${wide} mt-1 text-sm text-destructive`} onClick={revoke}>Disconnect Claude</button> : null}
    </div>
  );
};
