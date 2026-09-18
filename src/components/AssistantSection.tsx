import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type Status = { connected: boolean; created_at: string | null; last_used_at: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

/**
 * Settings → connect the admin's own AI assistant (#119). One download for
 * Claude Desktop on this computer; the key is inside the file and never shown.
 */
export const AssistantSection = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`${API_BASE}/mcp-key`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => { load(); }, []);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/mcp-key/extension`, { method: "POST" });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "AyurCalm.mcpb";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded. Double-click AyurCalm.mcpb to add it to Claude Desktop.");
      load();
    } catch {
      toast.error("Could not create the download");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm("Disconnect Claude? It stops working until you download the extension again.")) return;
    const res = await fetch(`${API_BASE}/mcp-key`, { method: "DELETE" });
    if (res.ok) { toast.success("Disconnected"); load(); } else toast.error("Could not disconnect");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">Your AI assistant</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ask Claude about your centre: today's day, who is in house, who is free, what is wrong with a day, and the day sheet.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Install Claude Desktop on this computer, if you have not.</li>
          <li>Download the AyurCalm extension below and double-click it. Claude asks to install it: click Install.</li>
          <li>In Claude, ask: "What's on tomorrow at the centre?"</li>
        </ol>
        {status?.connected && (
          <p className="text-sm">Connected {when(status.created_at)}. Last used: {when(status.last_used_at)}. Downloading again replaces the old connection.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy}>
            {status?.connected ? "Download again" : "Download for Claude Desktop"}
          </Button>
          {status?.connected && <Button variant="outline" onClick={revoke}>Disconnect</Button>}
        </div>
      </CardContent>
    </Card>
  );
};
