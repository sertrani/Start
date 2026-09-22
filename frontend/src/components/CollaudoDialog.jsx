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
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";

export default function CollaudoDialog({ open, onOpenChange, vehicle, onSaved }) {
  const { hasPerm } = useAuth();
  const [form, setForm] = useState({ data_collaudo: "", note: "" });
  const [loading, setLoading] = useState(false);
  const history = [...(vehicle?.collaudo_history || [])].sort((a, b) =>
    (b.data_collaudo || "").localeCompare(a.data_collaudo || "")
  );

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/collaudo`, {
        data_collaudo: form.data_collaudo,
        note: form.note || null,
      });
      toast.success("Collaudo registrato. Scadenza ricalcolata.");
      setForm({ data_collaudo: "", note: "" });
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/vehicles/${vehicle.id}/collaudo/${id}`);
      toast.success("Collaudo eliminato");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="collaudo-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Collaudi — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>
            Prossima scadenza: {fmtDate(vehicle?.collaudo_deadline)}. Registra la data effettiva del collaudo eseguito.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data collaudo</Label>
              <Input type="date" value={form.data_collaudo} onChange={(e) => setForm({ ...form, data_collaudo: e.target.value })} required data-testid="collaudo-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Opzionale" data-testid="collaudo-note-input" />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full" data-testid="collaudo-save-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" /> Registra collaudo</>}
          </Button>
        </form>
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nessun collaudo registrato.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2" data-testid={`collaudo-item-${h.id}`}>
                <Wrench className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{fmtDate(h.data_collaudo)}</p>
                  <p className="text-xs text-slate-500">{h.note || "—"}</p>
                </div>
                {hasPerm("delete_operations") && (
                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => remove(h.id)} data-testid={`collaudo-delete-${h.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
