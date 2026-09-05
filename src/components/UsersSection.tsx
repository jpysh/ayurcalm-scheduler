import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  last_login: string | null;
};

const blankDraft = { email: "", name: "", role: "staff" as const, password: "" };

/** Administrator-only list of logins, plus the form to add one. */
export const UsersSection = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<typeof blankDraft>(blankDraft);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`${API_BASE}/users`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => toast.error("Could not load users"));

  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, name: draft.name || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not add the user");
        return;
      }
      toast.success(`Added ${data.email}`);
      setDraft(blankDraft);
      load();
    } finally {
      setBusy(false);
    }
  };

  const patch = async (user: User, changes: Partial<Pick<User, "role" | "is_active">>) => {
    const res = await fetch(`${API_BASE}/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Could not update the user");
      return;
    }
    load();
  };

  const setPassword = async (user: User) => {
    const next = window.prompt(`New password for ${user.email} (at least 8 characters)`);
    if (!next) return;
    const res = await fetch(`${API_BASE}/users/${user.id}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Could not set the password");
      return;
    }
    toast.success(`Password updated for ${user.email}`);
  };

  const remove = async (user: User) => {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    const res = await fetch(`${API_BASE}/users/${user.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Could not delete the user");
      return;
    }
    toast.success(`Deleted ${user.email}`);
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">People with access</CardTitle>
        <p className="text-xs text-muted-foreground">
          Administrators can change settings and manage users. Staff can run the schedule.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>{u.name || "—"}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => patch(u, { role: v as User["role"] })}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => patch(u, { is_active: !u.is_active })}>
                      {u.is_active ? "Active" : "Disabled"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setPassword(u)}>Set password</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(u)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Add someone</p>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="new_email" className="text-xs">Email</Label>
              <Input id="new_email" type="email" value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_name" className="text-xs">Name</Label>
              <Input id="new_name" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as "staff" })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_password" className="text-xs">Temporary password</Label>
              <Input id="new_password" type="text" value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })} className="h-9" />
            </div>
          </div>
          <Button
            onClick={create}
            disabled={busy || !draft.email || draft.password.length < 8}
            className="h-9"
          >
            {busy ? "Adding…" : "Add user"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Share the temporary password with them and ask them to change it from
            <span className="font-medium"> Your account</span> after signing in.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

/** Available to every signed-in user, including staff. */
export const ChangePasswordCard = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next !== confirm) {
      toast.error("The new passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/account/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not change your password");
        return;
      }
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">Your account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="current_password">Current password</Label>
          <Input id="current_password" type="password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="next_password">New password</Label>
          <Input id="next_password" type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input id="confirm_password" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={busy || !current || next.length < 8}>
          {busy ? "Changing…" : "Change password"}
        </Button>
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </CardContent>
    </Card>
  );
};
