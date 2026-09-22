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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { fmtDate, POLICY_LABELS } from "@/lib/format";
import { Loader2, PauseCircle, PlayCircle, AlertTriangle, History } from "lucide-react";

export default function PolicyDialog({ open, onOpenChange, vehicle, onSaved }) {
  const p = vehicle?.policy;
  const [form, setForm] = useState({
    compagnia: p?.compagnia || "",
    tipologia: p?.tipologia || "annuale",
    data_stipula: p?.data_stipula?.slice(0, 10) || "",
    scadenza_rata_intermedia: p?.scadenza_rata_intermedia?.slice(0, 10) || "",
    scadenza_contratto: p?.scadenza_contratto?.slice(0, 10) || "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const savePolicy = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/vehicles/${vehicle.id}/policy`, {
        compagnia: form.compagnia,
        tipologia: form.tipologia,
        data_stipula: form.data_stipula,
        scadenza_rata_intermedia: form.scadenza_rata_intermedia || null,
        scadenza_contratto: form.scadenza_contratto,
      });
      toast.success("Polizza salvata");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (action) => {
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/policy/${action}`);
      toast.success(action === "suspend" ? "Copertura sospesa" : "Copertura riattivata");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const days = p?.cumulative_suspension_days ?? 0;
  const maxDays = p?.max_suspension_days ?? 304;
  const pct = Math.min(100, (days / maxDays) * 100);
  const suspended = p?.status === "suspended";
  const limitReached = p?.suspension_limit_reached;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="policy-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Polizza — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>
            Gestisci i dati della polizza, le sospensioni della copertura e il conteggio dei giorni.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={savePolicy} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Compagnia assicurativa</Label>
            <Input
              value={form.compagnia}
              onChange={set("compagnia")}
              placeholder="Es. Generali, UnipolSai…"
              required
              data-testid="policy-company-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipologia</Label>
              <Select value={form.tipologia} onValueChange={(v) => setForm({ ...form, tipologia: v })}>
                <SelectTrigger data-testid="policy-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POLICY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data stipula</Label>
              <Input
                type="date"
                value={form.data_stipula}
                onChange={set("data_stipula")}
                required
                data-testid="policy-start-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scadenza rata intermedia</Label>
              <Input
                type="date"
                value={form.scadenza_rata_intermedia}
                onChange={set("scadenza_rata_intermedia")}
                data-testid="policy-rata-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza contratto</Label>
              <Input
                type="date"
                value={form.scadenza_contratto}
                onChange={set("scadenza_contratto")}
                required
                data-testid="policy-contract-input"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full" data-testid="policy-save-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva polizza"}
          </Button>
        </form>

        {p && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Sospensione copertura</p>
              <span className="text-xs font-medium text-slate-500">Max 10 mesi ({maxDays} gg)</span>
            </div>
            <Progress value={pct} className="h-2.5" data-testid="insurance-suspension-progress-bar" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Giorni sospensione cumulati:{" "}
                <b className="text-slate-900" data-testid="suspension-days-count">
                  {days}
                </b>{" "}
                / {maxDays}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                  suspended
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {suspended ? "SOSPESA" : "ATTIVA"}
              </span>
            </div>

            {limitReached && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2" data-testid="suspension-limit-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Limite massimo di 10 mesi raggiunto. La polizza è stata riattivata automaticamente e
                non sono più consentite sospensioni.
              </div>
            )}

            {!limitReached &&
              (suspended ? (
                <Button
                  onClick={() => toggle("reactivate")}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  data-testid="reactivate-button"
                >
                  <PlayCircle className="h-4 w-4 mr-2" /> Riattiva copertura
                </Button>
              ) : (
                <Button
                  onClick={() => toggle("suspend")}
                  disabled={loading}
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  data-testid="suspend-button"
                >
                  <PauseCircle className="h-4 w-4 mr-2" /> Sospendi copertura
                </Button>
              ))}

            {p.suspensions?.length > 0 && (
              <div className="pt-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
                  <History className="h-3.5 w-3.5" /> Registro sospensioni
                </p>
                <div className="space-y-1">
                  {p.suspensions.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1"
                    >
                      <span className="text-slate-600">
                        {fmtDate(s.suspended_at)} → {fmtDate(s.reactivated_at)}
                      </span>
                      <span className="font-medium text-slate-800">
                        {s.days} gg {s.auto ? "(auto)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
