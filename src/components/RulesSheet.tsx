/**
 * Settings → What needs you (#288): every rule is the same row, a name, one line
 * of state and a switch. The "when" sits in the sentence as a tappable value that
 * opens the phone's own list. A changed value is amber; Reset puts every rule
 * back. Each row says how many items it would raise today. Opened from Settings
 * and from the gear on Patients and Team, scrolled to that section.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, ListGroup, SwitchRow, noteText, field, Btn } from "@/components/kit";
import { changesOf, type Attention, type Rule } from "@/lib/attention";

const HOURS = [4, 12, 24, 48];
const hours = (h?: number) => `${h} hour${h === 1 ? "" : "s"}`;

function When({ rule, set }: { rule: Rule; set: (h: number) => void }) {
  const [other, setOther] = useState(false);
  const changed = rule.hours !== rule.default_hours;
  const custom = !HOURS.includes(rule.hours!);
  return (
    <p className={`mt-0.5 pb-1 ${noteText}`}>
      Raise it after{" "}
      <span className="relative inline-block">
        <span className={`font-semibold underline decoration-dotted underline-offset-2 ${changed ? "text-notice" : "text-primary"}`}>{hours(rule.hours)} ⌄</span>
        <select aria-label={`When: ${rule.name}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={other ? "other" : rule.hours}
          onChange={(e) => { if (e.target.value === "other") setOther(true); else { setOther(false); set(Number(e.target.value)); } }}>
          {HOURS.map((h) => <option key={h} value={h}>{hours(h)}</option>)}
          {custom ? <option value={rule.hours}>{hours(rule.hours)}</option> : null}
          <option value="other">Other…</option>
        </select>
      </span>{" "}{rule.from}
      {other ? (
        <input type="number" inputMode="numeric" min={1} max={720} aria-label="Hours" autoFocus placeholder="Hours" className={`${field} mt-1.5 max-w-[8rem]`}
          onBlur={(e) => { const h = Math.round(Number(e.target.value)); if (h >= 1 && h <= 720) set(h); setOther(false); }} />
      ) : null}
    </p>
  );
}

export function RulesSheet({ open, onOpenChange, section, attention, reload }: {
  open: boolean; onOpenChange: (o: boolean) => void; section?: "Day" | "Patients" | "Team" | null; attention: Attention; reload: () => void;
}) {
  const [rules, setRules] = useState<Rule[]>(attention.rules);
  useEffect(() => { if (open) setRules(attention.rules); }, [open, attention.rules]);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && section) setTimeout(() => body.current?.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ block: "start" }), 50);
  }, [open, section]);

  const put = async (next: Rule[]) => {
    setRules(next);
    const res = await fetch(`${API_BASE}/attention/rules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changesOf(next)) });
    if (!res.ok) { toast.error("That was not saved. Try again."); setRules(attention.rules); return; }
    setRules((await res.json()).rules);
    reload();
  };
  const change = (id: string, patch: Partial<Rule>) => put(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const changed = changesOf(rules);
  const on = rules.filter((r) => r.on).length;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="What needs you" note={`${on} of ${rules.length} on. Only what needs action counts on the pill; information shows in grey.`}
      foot={Object.keys(changed).length ? <Btn kind="quiet" onClick={() => put(rules.map((r) => ({ ...r, on: r.default_on, hours: r.default_hours })))}>Reset to the defaults</Btn> : undefined}>
      <div ref={body}>
        {(["Day", "Patients", "Team"] as const).map((s) => (
          <div key={s} data-section={s}>
            <ListGroup title={s}>
              {rules.filter((r) => r.section === s).map((r) => (
                <SwitchRow key={r.id} title={r.name} on={r.on} locked={r.locked} set={(v) => change(r.id, { on: v })}
                  facts={r.on ? [r.kind === "information" ? "Information only, not counted" : "Counts on the pill", r.waiting ?? (r.kind === "information" ? (r.count ? `${r.count} today` : "nobody today") : r.count ? `would raise ${r.count} today` : "nothing today")].join(" · ") : `Off · ${r.kind === "information" ? "not shown" : "not on the pill"}${r.count ? `, ${r.count} today` : ""}`}
                  flag={r.on !== r.default_on ? `Changed from ${r.default_on ? "on" : "off"}` : undefined}>
                  {r.hours !== undefined && r.on ? <When rule={r} set={(h) => change(r.id, { hours: h })} /> : null}
                </SwitchRow>
              ))}
            </ListGroup>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
