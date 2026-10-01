/**
 * Settings → People with access and Your account, from the kit (#285 session 7).
 * People are rows; a tap opens one sheet for that person, and "Add someone" is
 * a row that opens one sheet. Staff run the schedule; administrators also change
 * settings and manage people.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmSheet } from "@/components/ConfirmSheet";
import { API_BASE } from "@/lib/apiBase";
import { BottomSheet, Empty, ListGroup, Row, Seg, SheetFoot, Switch, Text, noteText } from "@/components/kit";

type Role = "admin" | "staff";
type User = { id: string; email: string; name: string | null; role: Role; is_active: boolean; last_login: string | null };

const blankDraft = { email: "", name: "", role: "staff" as Role, password: "" };
const sent = (path: string, method: string, body?: unknown) => fetch(`${API_BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export const UsersSection = ({ onCount }: { onCount?: (n: number) => void }) => {
  const [users, setUsers] = useState<User[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [one, setOne] = useState<User | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch(`${API_BASE}/users`).then((r) => (r.ok ? r.json() : [])).then((u: User[]) => { setUsers(u); onCount?.(u.length); }).catch(() => toast.error("Could not load the people"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    try {
      const res = await sent("/users", "POST", { ...draft, name: draft.name || null });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not add them"); return; }
      toast.success(`Added ${data.email}`);
      setDraft(blankDraft); setAdding(false); load();
    } finally { setBusy(false); }
  };
  const patch = async (user: User, changes: Partial<Pick<User, "role" | "is_active">>) => {
    const res = await sent(`/users/${user.id}`, "PUT", changes);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data?.error || "Could not change them"); return; }
    setOne({ ...user, ...changes });
    load();
  };
  const setPass = async (user: User) => {
    setBusy(true);
    try {
      const res = await sent(`/users/${user.id}/set-password`, "POST", { new_password: password });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not set the password"); return; }
      toast.success(`Password updated for ${user.email}`);
      setPassword("");
    } finally { setBusy(false); }
  };
  const remove = async (user: User) => {
    setOne(null);
    if (!(await confirmSheet(`Delete ${user.email}?\n\nThis cannot be undone.`, "Delete"))) return;
    const res = await sent(`/users/${user.id}`, "DELETE");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data?.error || "Could not delete them"); return; }
    toast.success(`Deleted ${user.email}`);
    load();
  };

  return (
    <div>
      <p className={`mb-2 ${noteText}`}>Administrators can change settings and manage people. Staff run the schedule.</p>
      <ListGroup>
        <Row title={<span className="text-primary">Add someone</span>} trailing="›" onClick={() => setAdding(true)} />
        {users === null ? null : users.length ? users.map((u) => (
          <Row key={u.id} title={u.name || u.email} facts={u.name ? u.email : undefined} trailing={`${u.role === "admin" ? "Admin" : "Staff"}${u.is_active ? "" : " · off"}`} onClick={() => { setOne(u); setPassword(""); }} />
        )) : <Empty text="No one yet." />}
      </ListGroup>

      <BottomSheet open={adding} onOpenChange={setAdding} title="Add someone" note="Email and a temporary password are needed. Name is optional."
        foot={<SheetFoot busy={busy} ok={!!draft.email && draft.password.length >= 8} save={create} label={`Add ${draft.email || "them"}`} />}>
        <Text label="Email" type="email" inputMode="email" autoComplete="off" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <Text label="Name (optional)" autoComplete="off" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <div className="mt-3"><Seg<Role> options={[["staff", "Staff"], ["admin", "Admin"]]} value={draft.role} onChange={(role) => setDraft({ ...draft, role })} /></div>
        <Text label="Temporary password" autoComplete="off" note="At least 8 characters. Share it with them and ask them to change it from Your account." value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
      </BottomSheet>

      <BottomSheet open={!!one} onOpenChange={(o) => { if (!o) setOne(null); }} title={one?.name || one?.email || ""} note={one?.name ? one.email : undefined}
        foot={one ? <SheetFoot save={() => remove(one)} label="Delete this person" tone="destructive" /> : undefined}>
        {one ? (<>
          <div className="mt-1"><Seg<Role> options={[["staff", "Staff"], ["admin", "Admin"]]} value={one.role} onChange={(role) => patch(one, { role })} /></div>
          <Switch label="Can sign in" note={one.last_login ? `Last signed in ${new Date(one.last_login).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Has not signed in yet"} on={one.is_active} set={(v) => patch(one, { is_active: v })} />
          <Text label="New password" autoComplete="off" note="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" disabled={busy || password.length < 8} className="mt-2 min-h-11 w-full rounded-full border font-semibold disabled:opacity-50" onClick={() => setPass(one)}>Set their password</button>
        </>) : null}
      </BottomSheet>
    </div>
  );
};

/** Available to every signed-in user, including staff. */
export const ChangePasswordCard = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = confirm !== "" && next !== confirm;
  const submit = async () => {
    setBusy(true);
    try {
      const res = await sent("/account/change-password", "POST", { current_password: current, new_password: next });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not change your password"); return; }
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <Text label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Text label="New password" type="password" autoComplete="new-password" note="At least 8 characters." valid={next.length >= 8} value={next} onChange={(e) => setNext(e.target.value)} />
      <Text label="New password again" type="password" autoComplete="new-password" valid={!!confirm && !mismatch} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {mismatch ? <p role="alert" className="mt-1 text-[13px] font-semibold text-destructive">The two new passwords are different.</p> : null}
      <button type="button" disabled={busy || !current || next.length < 8 || next !== confirm} className="mt-4 min-h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50" onClick={submit}>{busy ? "Changing…" : "Change my password"}</button>
    </div>
  );
};
