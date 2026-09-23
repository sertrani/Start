import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, Plus, Trash2, Check, X, Pencil } from "lucide-react";

export default function MaintenanceTypesManager() {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState(180);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/maintenance/types");
      setTypes(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return toast.error("Inserisci un nome");
    try {
      await api.post("/maintenance/types", { name: name.trim(), interval_days: Number(days) });
      setName(""); setDays(180);
      toast.success("Controllo aggiunto");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/maintenance/types/${editing.id}`, { name: editing.name, interval_days: Number(editing.interval_days) });
      setEditing(null);
      toast.success("Controllo aggiornato");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/maintenance/types/${id}`);
      toast.success("Controllo rimosso");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800"><Wrench className="h-4 w-4 text-blue-600" /> Controlli periodici (checklist)</h2>
      <p className="text-sm text-slate-500">Definisci i controlli da effettuare e ogni quanti giorni ripeterli. Sono usati nella pagina Manutenzione.</p>
      <div className="space-y-2" data-testid="maint-types-list">
        {types.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2" data-testid={`maint-type-${t.id.slice(0, 8)}`}>
            {editing?.id === t.id ? (
              <>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="flex-1" data-testid="maint-type-edit-name" />
                <Input type="number" min="1" value={editing.interval_days} onChange={(e) => setEditing({ ...editing, interval_days: e.target.value })} className="w-24" data-testid="maint-type-edit-days" />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={saveEdit} data-testid="maint-type-save"><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
                <span className="text-xs text-slate-500">ogni {t.interval_days} gg</span>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => setEditing({ ...t })} data-testid={`maint-type-edit-${t.id.slice(0, 8)}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => remove(t.id)} data-testid={`maint-type-delete-${t.id.slice(0, 8)}`}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1.5 flex-1 min-w-[160px]"><Label className="text-xs text-slate-500">Nuovo controllo</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Filtro aria" data-testid="maint-type-new-name" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-slate-500">Ogni (giorni)</Label><Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} className="w-28" data-testid="maint-type-new-days" /></div>
        <Button onClick={add} data-testid="maint-type-add"><Plus className="h-4 w-4 mr-1.5" /> Aggiungi</Button>
      </div>
    </section>
  );
}
