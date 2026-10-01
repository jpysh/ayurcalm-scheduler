import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

export type Rule = {
  id: string; section: "Day" | "Patients" | "Team"; name: string; kind: "action" | "information"; on: boolean; locked?: boolean;
  hours?: number; from?: string; waiting?: string; default_on: boolean; default_hours?: number; count: number;
};
export type AttentionItem = {
  id: string; rule: string; section: "Patients" | "Team"; kind: "action" | "information"; who: string; what: string;
  patient_id?: string; action?: "card" | "diet" | "summary";
};
export type Attention = { rules: Rule[]; items: AttentionItem[] };

/** What needs the admin beyond the day's own problems (#288): the rules, today's counts and the patient and team items. */
export function useAttention() {
  const [data, setData] = useState<Attention>({ rules: [], items: [] });
  const reload = useCallback(() => {
    fetch(`${API_BASE}/attention`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); }).catch(() => { /* the pill still shows the day's own */ });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...data, reload };
}

/** The changes to keep: only what differs from a rule's default. */
export const changesOf = (rules: Rule[]) => Object.fromEntries(rules.flatMap((r) => {
  const c = { ...(!r.locked && r.on !== r.default_on ? { on: r.on } : {}), ...(r.hours !== undefined && r.hours !== r.default_hours ? { hours: r.hours } : {}) };
  return Object.keys(c).length ? [[r.id, c]] : [];
}));
