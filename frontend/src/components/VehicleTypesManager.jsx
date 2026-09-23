import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, Plus, Trash2, Check, X, Pencil } from "lucide-react";

export default function VehicleTypesManager() {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("0.7");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/vehicle-types");
      setTypes(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };
  useEffect(() => { load(); }, []);

  const clamp = (w) => Math.max(0, Math.min(1, Number(w) || 0));

  const add = async () => {
    if (!name.trim()) return toast.error("Inserisci un nome");
    try {
      await api.post("/vehicle-types", { name: name.trim(), weight: clamp(weight) });
      setName(""); setWeight("0.7");
      toast.success("Tipologia aggiunta");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/vehicle-types/${editing.id}`, { name: editing.name, weight: clamp(editing.weight) });
      setEditing(null);
      toast.success("Tipologia aggiornata");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/vehicle-types/${id}`);
      toast.success("Tipologia rimossa");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800"><Car className="h-4 w-4 text-blue-600" /> Tipologie veicolo</h2>
      <p className="text-sm text-slate-500">Definisci le tipologie (es. Auto, Scooter, Altro) e il <b>peso di sospensione</b> (0 = mai sospendere, 1 = candidato ideale). Usato nella strategia sospensioni.</p>
      <div className="space-y-2" data-testid="vehicle-types-list">
        {types.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2" data-testid={`vtype-${t.id.slice(0, 8)}`}>
            {editing?.id === t.id ? (
              <>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="flex-1" data-testid="vtype-edit-name" />
                <Input type="number" min="0" max="1" step="0.1" value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: e.target.value })} className="w-24" title="Peso sospensione (0-1)" data-testid="vtype-edit-weight" />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={saveEdit} data-testid="vtype-save"><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
                <span className="text-xs text-slate-500">peso {Number(t.weight ?? 1).toFixed(1)}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => setEditing({ ...t, weight: String(t.weight ?? 1) })} data-testid={`vtype-edit-${t.id.slice(0, 8)}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => remove(t.id)} data-testid={`vtype-delete-${t.id.slice(0, 8)}`}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1.5 flex-1 min-w-[160px]"><Label className="text-xs text-slate-500">Nuova tipologia</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Cabrio" data-testid="vtype-new-name" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-slate-500">Peso sospensione</Label><Input type="number" min="0" max="1" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-28" data-testid="vtype-new-weight" /></div>
        <Button onClick={add} data-testid="vtype-add"><Plus className="h-4 w-4 mr-1.5" /> Aggiungi</Button>
      </div>
    </section>
  );
}
