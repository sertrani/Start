import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { fmtDate, eur } from "@/lib/format";
import { Loader2, Plus, Trash2, Receipt } from "lucide-react";

export default function BolloDialog({ open, onOpenChange, vehicle, onSaved }) {
  const [form, setForm] = useState({
    data_pagamento: "",
    importo: "",
    periodo: "",
    nuova_scadenza: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const history = [...(vehicle?.bollo_history || [])].sort((a, b) =>
    (b.data_pagamento || "").localeCompare(a.data_pagamento || "")
  );

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/bollo`, {
        data_pagamento: form.data_pagamento,
        importo: parseFloat(form.importo),
        periodo: form.periodo || null,
        nuova_scadenza: form.nuova_scadenza || null,
        note: form.note || null,
      });
      toast.success("Pagamento bollo registrato");
      setForm({ data_pagamento: "", importo: "", periodo: "", nuova_scadenza: "", note: "" });
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/vehicles/${vehicle.id}/bollo/${id}`);
      toast.success("Pagamento eliminato");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="bollo-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Storico bollo — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>Registra i pagamenti del bollo e aggiorna la scadenza.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Data pagamento</Label>
            <Input type="date" value={form.data_pagamento} onChange={set("data_pagamento")} required data-testid="bollo-date-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Importo (€)</Label>
            <Input type="number" step="0.01" value={form.importo} onChange={set("importo")} placeholder="215.50" required data-testid="bollo-amount-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Periodo / Anno</Label>
            <Input value={form.periodo} onChange={set("periodo")} placeholder="2026" data-testid="bollo-period-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Nuova scadenza bollo</Label>
            <Input type="date" value={form.nuova_scadenza} onChange={set("nuova_scadenza")} data-testid="bollo-newexpiry-input" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Note</Label>
            <Input value={form.note} onChange={set("note")} placeholder="Opzionale" data-testid="bollo-note-input" />
          </div>
          <div className="col-span-2">
            <Button type="submit" disabled={loading} className="w-full" data-testid="bollo-save-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" /> Registra pagamento</>}
            </Button>
          </div>
        </form>

        <div className="mt-1 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nessun pagamento registrato.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2" data-testid={`bollo-item-${h.id}`}>
                <Receipt className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {eur(h.importo)} {h.periodo ? `· ${h.periodo}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Pagato il {fmtDate(h.data_pagamento)} {h.note ? `· ${h.note}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => remove(h.id)} data-testid={`bollo-delete-${h.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
