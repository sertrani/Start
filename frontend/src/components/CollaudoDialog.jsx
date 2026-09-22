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
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function CollaudoDialog({ open, onOpenChange, vehicle, onSaved }) {
  const [dateVal, setDateVal] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/vehicles/${vehicle.id}/collaudo`, { data_collaudo: dateVal });
      toast.success("Collaudo registrato. Prossima scadenza ricalcolata.");
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
      <DialogContent className="sm:max-w-sm" data-testid="collaudo-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Registra collaudo eseguito</DialogTitle>
          <DialogDescription>
            La prossima scadenza sarà ricalcolata automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-500">
            Inserisci la data dell'ultimo collaudo effettuato. La prossima scadenza sarà calcolata a
            fine mese, 2 anni dopo.
          </p>
          <div className="space-y-1.5">
            <Label>Data collaudo</Label>
            <Input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              required
              data-testid="collaudo-date-input"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} data-testid="collaudo-save-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
