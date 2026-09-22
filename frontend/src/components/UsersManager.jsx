import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, KeyRound, Trash2, Loader2, ShieldCheck } from "lucide-react";

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [perms, setPerms] = useState({ permissions: [], labels: {} });
  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState(null);

  const load = async () => {
    try {
      const [u, p] = await Promise.all([api.get("/users"), api.get("/auth/permissions")]);
      setUsers(u.data);
      setPerms(p.data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };
  useEffect(() => { load(); }, []);

  const togglePerm = async (u, perm) => {
    const has = u.permissions.includes(perm);
    const next = has ? u.permissions.filter((x) => x !== perm) : [...u.permissions, perm];
    try {
      await api.put(`/users/${u.id}`, { permissions: next });
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const remove = async (u) => {
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Utente eliminato");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-blue-600" /> Utenti e permessi
        </h2>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="add-user-button">
          <UserPlus className="h-4 w-4 mr-1.5" /> Nuovo utente
        </Button>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl border border-slate-200 p-3" data-testid={`user-row-${u.id}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  {u.name}
                  {u.role === "admin" && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 rounded">ADMIN</span>}
                </p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {u.role !== "admin" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Attivo</span>
                    <Switch checked={u.is_active} onCheckedChange={() => toggleActive(u)} data-testid={`user-active-${u.id}`} />
                  </div>
                )}
                <Button size="sm" variant="ghost" onClick={() => setPwUser(u)} data-testid={`user-password-${u.id}`}>
                  <KeyRound className="h-4 w-4" />
                </Button>
                {u.role !== "admin" && (
                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => remove(u)} data-testid={`user-delete-${u.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {u.role !== "admin" && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.permissions.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox checked={u.permissions.includes(p)} onCheckedChange={() => togglePerm(u, p)} data-testid={`user-perm-${u.id}-${p}`} />
                    {perms.labels[p] || p}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {createOpen && <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} perms={perms} onSaved={load} />}
      {pwUser && <ResetPasswordDialog user={pwUser} onOpenChange={() => setPwUser(null)} />}
    </section>
  );
}

function CreateUserDialog({ open, onOpenChange, perms, onSaved }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: [] });
  const [loading, setLoading] = useState(false);
  const toggle = (p) => setForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/users", form);
      toast.success("Utente creato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="create-user-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Nuovo utente</DialogTitle>
          <DialogDescription>Crea un operatore e assegna i permessi.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="new-user-name" /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="new-user-email" /></div>
          <div className="space-y-1.5"><Label>Password iniziale</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="new-user-password" /></div>
          <div className="space-y-1.5">
            <Label>Permessi</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {perms.permissions.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={form.permissions.includes(p)} onCheckedChange={() => toggle(p)} data-testid={`new-user-perm-${p}`} />
                  {perms.labels[p] || p}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} data-testid="create-user-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea utente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onOpenChange }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { password });
      toast.success("Password aggiornata");
      onOpenChange();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="reset-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Reimposta password</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Nuova password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="reset-password-input" /></div>
          <DialogFooter>
            <Button type="submit" disabled={loading} data-testid="reset-password-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
