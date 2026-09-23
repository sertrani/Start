import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { fmtDate, POLICY_LABELS, FRAZIONAMENTO_LABELS, stateBadge } from "@/lib/format";
import { Loader2, PauseCircle, PlayCircle, AlertTriangle, History, ShieldCheck, RefreshCw, Calculator, FileDown, CheckCircle2, CircleDollarSign } from "lucide-react";

const AUTO_GRACE = ["annuale"];
const todayStr = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso, m) => { const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000));

export default function PolicyDialog({ open, onOpenChange, vehicle, onSaved }) {
  const { hasPerm } = useAuth();
  const p = vehicle?.policy;
  const [form, setForm] = useState({
    compagnia: p?.compagnia || "",
    tipologia: p?.tipologia || "annuale",
    numero_polizza: p?.numero_polizza || "",
    data_stipula: p?.data_stipula?.slice(0, 10) || "",
    scadenza_rata_intermedia: p?.scadenza_rata_intermedia?.slice(0, 10) || "",
    scadenza_contratto: p?.scadenza_contratto?.slice(0, 10) || "",
    importo_premio: p?.importo_premio ?? "",
    importo_rata: p?.importo_rata ?? "",
    grace_period: p?.grace_period ?? false,
    frazionamento: p?.frazionamento || "unica",
  });
  const [resetSusp, setResetSusp] = useState(true);
  const [effDate, setEffDate] = useState(p?.current_suspension_start?.slice(0, 10) || todayStr());
  const [plannedReact, setPlannedReact] = useState("");
  const [shiftDeadlines, setShiftDeadlines] = useState(true);
  const [newContract, setNewContract] = useState("");
  const [newRata, setNewRata] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const autoGrace = AUTO_GRACE.includes(form.tipologia);
  const graceEffective = autoGrace || form.grace_period;

  const days = p?.cumulative_suspension_days ?? 0;
  const maxDays = p?.max_suspension_days ?? 304;
  const pct = Math.min(100, (days / maxDays) * 100);
  const suspended = p?.status === "suspended";
  const limitReached = p?.suspension_limit_reached;
  const canManage = hasPerm("manage_policies");
  const remaining = Math.max(0, maxDays - days);

  // Proposte automatiche di data
  useEffect(() => {
    if (!suspended) {
      setPlannedReact(effDate ? addDays(effDate, remaining) : "");
    } else if (p?.current_suspension_start && effDate) {
      const rec = daysBetween(p.current_suspension_start.slice(0, 10), effDate);
      setNewContract(p?.scadenza_contratto ? addDays(p.scadenza_contratto.slice(0, 10), rec) : "");
      setNewRata(p?.scadenza_rata_intermedia ? addDays(p.scadenza_rata_intermedia.slice(0, 10), rec) : "");
    }
    // eslint-disable-next-line
  }, [effDate, suspended]);

  const onStipulaChange = (e) => {
    const val = e.target.value;
    setForm((f) => {
      const next = { ...f, data_stipula: val };
      if (val && f.tipologia === "annuale") {
        if (!f.scadenza_contratto) next.scadenza_contratto = addMonths(val, 12);
        if (f.frazionamento === "semestrale" && !f.scadenza_rata_intermedia) next.scadenza_rata_intermedia = addMonths(val, 6);
      }
      return next;
    });
  };

  const recalcDates = () => {
    if (!form.data_stipula) return toast.error("Inserisci prima la data di stipula");
    setForm((f) => ({
      ...f,
      scadenza_contratto: addMonths(f.data_stipula, 12),
      scadenza_rata_intermedia: f.frazionamento === "semestrale" ? addMonths(f.data_stipula, 6) : f.scadenza_rata_intermedia,
    }));
    toast.success("Date ricalcolate dalla data di stipula");
  };

  const payload = () => ({
    compagnia: form.compagnia,
    tipologia: form.tipologia,
    numero_polizza: form.numero_polizza || null,
    data_stipula: form.data_stipula,
    scadenza_rata_intermedia: form.scadenza_rata_intermedia || null,
    scadenza_contratto: form.scadenza_contratto,
    importo_premio: form.importo_premio === "" ? null : parseFloat(form.importo_premio),
    importo_rata: form.importo_rata === "" ? null : parseFloat(form.importo_rata),
    grace_period: autoGrace ? true : !!form.grace_period,
    frazionamento: form.tipologia === "annuale" ? form.frazionamento : null,
  });

  const savePolicy = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/vehicles/${vehicle.id}/policy`, payload());
      toast.success("Polizza salvata");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const renew = async () => {
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/policy/renew`, { ...payload(), reset_suspensions: resetSusp });
      toast.success(`Nuova polizza creata${resetSusp ? " · contatore azzerato" : ""}`);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const suspend = async () => {
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/policy/suspend`, { effective_date: effDate, planned_reactivation: plannedReact || null });
      toast.success("Copertura sospesa");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reactivate = async () => {
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/policy/reactivate`, {
        effective_date: effDate,
        new_scadenza_contratto: shiftDeadlines ? (newContract || null) : null,
        new_scadenza_rata: shiftDeadlines ? (newRata || null) : null,
      });
      toast.success("Copertura riattivata");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const markRata = async (paid) => {
    setLoading(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/policy/rata-paid`, { paid });
      toast.success(paid ? "Rata segnata come pagata" : "Rata segnata come non pagata");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadSuspensionPdf = async () => {
    try {
      const res = await api.get(`/vehicles/${vehicle.id}/policy/suspension-pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `sospensione_${vehicle.targa}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const rataBadge = p ? stateBadge(p.rata_state) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="policy-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Polizza — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>Dati, numero polizza, importi, comporto, rinnovo e sospensioni.</DialogDescription>
        </DialogHeader>

        <form onSubmit={savePolicy} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Compagnia</Label>
              <Input value={form.compagnia} onChange={set("compagnia")} placeholder="Generali…" required data-testid="policy-company-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Numero polizza</Label>
              <Input value={form.numero_polizza} onChange={set("numero_polizza")} placeholder="POL-000123" data-testid="policy-number-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipologia</Label>
              <Select value={form.tipologia} onValueChange={(v) => setForm({ ...form, tipologia: v })}>
                <SelectTrigger data-testid="policy-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(POLICY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data stipula</Label>
              <Input type="date" value={form.data_stipula} onChange={onStipulaChange} required data-testid="policy-start-input" />
            </div>
          </div>
          {form.tipologia === "annuale" && (
            <div className="space-y-1.5" data-testid="policy-frazionamento-wrap">
              <Label>Frazionamento premio</Label>
              <Select value={form.frazionamento} onValueChange={(v) => setForm({ ...form, frazionamento: v })}>
                <SelectTrigger data-testid="policy-frazionamento-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FRAZIONAMENTO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">Rateizzazione del premio annuale: unica soluzione, semestrale, mensile…</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scadenza rata intermedia</Label>
              <Input type="date" value={form.scadenza_rata_intermedia} onChange={set("scadenza_rata_intermedia")} data-testid="policy-rata-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza contratto</Label>
              <Input type="date" value={form.scadenza_contratto} onChange={set("scadenza_contratto")} required data-testid="policy-contract-input" />
            </div>
          </div>
          <button type="button" onClick={recalcDates} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700" data-testid="policy-recalc-dates">
            <Calculator className="h-3.5 w-3.5" /> Ricalcola scadenze dalla data di stipula
          </button>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Premio totale (€)</Label>
              <Input type="number" step="0.01" value={form.importo_premio} onChange={set("importo_premio")} placeholder="580.00" data-testid="policy-premium-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Importo rata (€)</Label>
              <Input type="number" step="0.01" value={form.importo_rata} onChange={set("importo_rata")} placeholder="290.00" data-testid="policy-installment-input" />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start gap-2">
            <Checkbox id="grace" checked={graceEffective} disabled={autoGrace} onCheckedChange={(c) => setForm({ ...form, grace_period: !!c })} data-testid="policy-grace-checkbox" />
            <div>
              <Label htmlFor="grace" className="text-sm">Conteggia il comporto (15 giorni)</Label>
              <p className="text-xs text-slate-500 mt-0.5">
                {autoGrace ? "Automatico per le polizze annuali." : "Per questa tipologia decidi se estendere la copertura di 15 giorni oltre la scadenza."}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1" data-testid="policy-save-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva polizza"}
              </Button>
            </div>
          )}
        </form>

        {p && p.scadenza_rata_intermedia && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-2" data-testid="policy-rata-status">
            <div className="flex items-center gap-2 min-w-0">
              <CircleDollarSign className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Rata intermedia · {fmtDate(p.scadenza_rata_intermedia)}</p>
                <p className="text-xs text-slate-500">{p.rata_pagata_at ? `Pagata il ${fmtDate(p.rata_pagata_at)}` : "Non ancora pagata"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${rataBadge.cls}`}>{rataBadge.label}</span>
              {canManage && (
                p.rata_pagata ? (
                  <Button size="sm" variant="outline" disabled={loading} onClick={() => markRata(false)} data-testid="rata-unpaid-button">Segna non pagata</Button>
                ) : (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={() => markRata(true)} data-testid="rata-paid-button">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Segna pagata
                  </Button>
                )
              )}
            </div>
          </div>
        )}

        {p && canManage && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-indigo-800">
              <RefreshCw className="h-4 w-4" /> Rinnovo / nuova polizza
            </p>
            <p className="text-xs text-indigo-700">La polizza attuale verrà archiviata. Compila i campi sopra con i nuovi dati, poi conferma.</p>
            <div className="flex items-center gap-2">
              <Checkbox id="reset" checked={resetSusp} onCheckedChange={(c) => setResetSusp(!!c)} data-testid="policy-reset-suspensions-checkbox" />
              <Label htmlFor="reset" className="text-sm text-indigo-800">Azzera il contatore delle sospensioni</Label>
            </div>
            <Button onClick={renew} disabled={loading} variant="outline" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100" data-testid="policy-renew-button">
              Crea nuova polizza
            </Button>
          </div>
        )}

        {p && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            {p.grace_applies && (
              <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Comporto attivo: copertura fino al {fmtDate(p.grace_end)} (15 gg oltre la scadenza).
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Sospensione copertura</p>
              <span className="text-xs font-medium text-slate-500">Max 10 mesi ({maxDays} gg)</span>
            </div>
            <Progress value={pct} className="h-2.5" data-testid="insurance-suspension-progress-bar" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Giorni cumulati: <b className="text-slate-900" data-testid="suspension-days-count">{days}</b> / {maxDays}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${suspended ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                {suspended ? "SOSPESA" : "ATTIVA"}
              </span>
            </div>

            {suspended && p.planned_reactivation && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2" data-testid="planned-reactivation-info">
                Riattivazione automatica programmata per il {fmtDate(p.planned_reactivation)}: il sistema riattiverà il veicolo da solo.
              </div>
            )}

            {limitReached && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2" data-testid="suspension-limit-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Limite di 10 mesi raggiunto. Polizza riattivata automaticamente: nessuna ulteriore sospensione consentita.
              </div>
            )}

            {!limitReached && canManage && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data operazione</Label>
                  <Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} data-testid="suspension-effective-date-input" />
                </div>
                {suspended ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-2" data-testid="reactivate-shift-box">
                      <label className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                        <Checkbox checked={shiftDeadlines} onCheckedChange={(c) => setShiftDeadlines(!!c)} data-testid="reactivate-shift-checkbox" />
                        Slitta le scadenze dei giorni recuperati
                      </label>
                      {shiftDeadlines && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-emerald-700">Nuova scad. contratto</Label>
                            <Input type="date" value={newContract} onChange={(e) => setNewContract(e.target.value)} data-testid="reactivate-new-contract" />
                          </div>
                          {p.scadenza_rata_intermedia && (
                            <div className="space-y-1">
                              <Label className="text-[11px] text-emerald-700">Nuova scad. rata</Label>
                              <Input type="date" value={newRata} onChange={(e) => setNewRata(e.target.value)} data-testid="reactivate-new-rata" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Button onClick={reactivate} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="reactivate-button">
                      <PlayCircle className="h-4 w-4 mr-2" /> Riattiva copertura
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data prevista riattivazione (auto)</Label>
                      <Input type="date" value={plannedReact} onChange={(e) => setPlannedReact(e.target.value)} data-testid="planned-reactivation-input" />
                      <p className="text-[11px] text-slate-400">Proposta: data massima del periodo residuo ({remaining} gg). Il veicolo si riattiverà da solo a questa data.</p>
                    </div>
                    <Button onClick={suspend} disabled={loading} variant="outline" className="w-full border-blue-300 text-blue-700 hover:bg-blue-50" data-testid="suspend-button">
                      <PauseCircle className="h-4 w-4 mr-2" /> Sospendi copertura
                    </Button>
                  </>
                )}
                {hasPerm("export_reports") && (
                  <Button type="button" variant="ghost" onClick={downloadSuspensionPdf} className="w-full text-slate-600" data-testid="suspension-pdf-button">
                    <FileDown className="h-4 w-4 mr-2" /> Modulo sospensione (PDF)
                  </Button>
                )}
              </div>
            )}

            {p.suspensions?.length > 0 && (
              <div className="pt-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
                  <History className="h-3.5 w-3.5" /> Registro sospensioni
                </p>
                <div className="space-y-1">
                  {p.suspensions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1">
                      <span className="text-slate-600">{fmtDate(s.suspended_at)} → {fmtDate(s.reactivated_at)}</span>
                      <span className="font-medium text-slate-800">{s.days} gg {s.auto ? "(auto)" : ""}</span>
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
