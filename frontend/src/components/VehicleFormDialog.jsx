import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function VehicleFormDialog({ open, onOpenChange, vehicle, onSaved }) {
  const editing = !!vehicle;
  const [form, setForm] = useState({
    targa: vehicle?.targa || "",
    marca_modello: vehicle?.marca_modello || "",
    data_immatricolazione: vehicle?.data_immatricolazione?.slice(0, 10) || "",
    bollo_scadenza: vehicle?.bollo_scadenza?.slice(0, 10) || "",
    note: vehicle?.note || "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        targa: form.targa,
        marca_modello: form.marca_modello,
        data_immatricolazione: form.data_immatricolazione,
        bollo_scadenza: form.bollo_scadenza || null,
        note: form.note || null,
      };
      if (editing) await api.put(`/vehicles/${vehicle.id}`, payload);
      else await api.post("/vehicles", payload);
      toast.success(editing ? "Veicolo aggiornato" : "Veicolo aggiunto");
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
      <DialogContent className="sm:max-w-md" data-testid="vehicle-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{editing ? "Modifica veicolo" : "Nuovo veicolo"}</DialogTitle>
          <DialogDescription>Dati identificativi del veicolo. Il collaudo si gestisce dalla scheda dedicata.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Targa</Label>
            <Input value={form.targa} onChange={set("targa")} placeholder="AB123CD" className="uppercase font-targa" required data-testid="vehicle-targa-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Marca / Modello</Label>
            <Input value={form.marca_modello} onChange={set("marca_modello")} placeholder="Fiat Panda" required data-testid="vehicle-model-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Immatricolazione</Label>
              <Input type="date" value={form.data_immatricolazione} onChange={set("data_immatricolazione")} required data-testid="vehicle-immatricolazione-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza bollo</Label>
              <Input type="date" value={form.bollo_scadenza} onChange={set("bollo_scadenza")} data-testid="vehicle-bollo-input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={form.note} onChange={set("note")} placeholder="Note libere sul veicolo (visibili anche nella scheda PDF)…" rows={3} data-testid="vehicle-note-input" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} data-testid="vehicle-save-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
