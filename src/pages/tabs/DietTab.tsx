import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { fetchJsonWithTimeout } from "./shared";
import PageHead from "@/components/PageHead";
import { Empty, ListGroup, Loading, Row } from "@/components/kit";
import { BLANK_PLAN, PlanEditor, type Plan } from "@/components/CardSheets";

/**
 * Diet plans (#285 story 7): the centre's list of plans, each opening the same editor
 * the patient card uses. Who eats what, and from when, is set on the patient's card.
 */
export function useDietScreen({ active }: { active: boolean }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const load = () => fetchJsonWithTimeout<Plan[]>(`${API_BASE}/diet-templates`).then((r) => setPlans(Array.isArray(r) ? r : [])).catch(() => setPlans([]));
  useEffect(() => { if (active) load(); }, [active]);
  const row = (p: Plan) => <Row key={p.id} title={p.name} facts={p.description || undefined} trailing={p.patients ? `${p.patients} ${p.patients === 1 ? "patient" : "patients"}` : "Not used"} onClick={() => setEditing(p)} />;
  const live = (plans || []).filter((p) => p.is_active);
  const retired = (plans || []).filter((p) => !p.is_active);
  const tab = active ? (
    <div>
      <PageHead title="Diet plans" note={plans === null ? "" : `${live.length} plans`} />
      {plans === null ? <Loading /> : live.length === 0 ? <Empty text="No diet plans yet. Tap + to add one." /> : (<>
        <ListGroup title="Plans" count={live.length}>{live.map(row)}</ListGroup>
        {retired.length ? <ListGroup title="Retired" count={retired.length}>{retired.map(row)}</ListGroup> : null}
      </>)}
    </div>
  ) : null;
  const dialogs = editing ? <PlanEditor plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null;
  return { tab, dialogs, openAdd: () => setEditing(BLANK_PLAN) };
}
