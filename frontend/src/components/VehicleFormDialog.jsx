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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIPO_LABELS } from "@/lib/format";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function VehicleFormDialog({ open, onOpenChange, vehicle, onSaved, duplicate = false }) {
  const editing = !!vehicle && !duplicate;
  const [form, setForm] = useState({
    targa: duplicate ? "" : vehicle?.targa || "",
    marca_modello: vehicle?.marca_modello || "",
    data_immatricolazione: duplicate ? "" : vehicle?.data_immatricolazione?.slice(0, 10) || "",
    bollo_scadenza: duplicate ? "" : vehicle?.bollo_scadenza?.slice(0, 10) || "",
    tipo: vehicle?.tipo || "auto",
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
        tipo: form.tipo,
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

  const title = duplicate ? "Duplica veicolo" : editing ? "Modifica veicolo" : "Nuovo veicolo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="vehicle-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>
            {duplicate
              ? "Dati precompilati dal veicolo esistente: inserisci targa e immatricolazione del nuovo mezzo."
              : "Dati identificativi del veicolo. Il collaudo si gestisce dalla scheda dedicata."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Targa</Label>
            <Input value={form.targa} onChange={set("targa")} placeholder="AB123CD" className="uppercase font-targa" required data-testid="vehicle-targa-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Marca / Modello</Label>
              <Input value={form.marca_modello} onChange={set("marca_modello")} placeholder="Fiat Panda" required data-testid="vehicle-model-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo veicolo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger data-testid="vehicle-tipo-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
