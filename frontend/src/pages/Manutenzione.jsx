import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtDate, eur, TIPO_LABELS } from "@/lib/format";
import {
  Wrench, CheckCircle2, XCircle, Clock, Plus, ClipboardCheck, ListTodo, BarChart3,
  FileSpreadsheet, FileText, Trash2, Loader2, ClipboardList, Gauge,
} from "lucide-react";

const CTRL_STATE = {
  overdue: { cls: "bg-red-100 text-red-700 border-red-200", label: "Scaduto" },
  upcoming: { cls: "bg-amber-100 text-amber-800 border-amber-200", label: "In scadenza" },
  ok: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "OK" },
  never: { cls: "bg-slate-100 text-slate-500 border-slate-200", label: "Mai" },
};

export default function Manutenzione() {
  const { hasPerm } = useAuth();
  const canMaint = hasPerm("manage_maintenance");
  const [tab, setTab] = useState("controlli");
  const [overview, setOverview] = useState(null);
  const [sheetVehicle, setSheetVehicle] = useState(null);

  const loadOverview = async () => {
    try {
      const res = await api.get("/maintenance/overview");
      setOverview(res.data);
      setSheetVehicle((cur) => (cur ? res.data.vehicles.find((v) => v.vehicle_id === cur.vehicle_id) || null : null));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };
  useEffect(() => { loadOverview(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Wrench className="h-6 w-6 text-blue-600" /> Manutenzione e controlli
        </h1>
        <p className="text-sm text-slate-500">Apri la scheda di un veicolo per spuntare i controlli (OK/KO), registrare il km e vedere lo storico.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[["controlli", "Controlli", ClipboardCheck], ["interventi", "Interventi", ListTodo], ["stats", "Statistiche", BarChart3]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-medium border inline-flex items-center gap-1.5 ${tab === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`} data-testid={`maint-tab-${k}`}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      {tab === "controlli" && <ControlliTab overview={overview} onOpenSheet={setSheetVehicle} />}
      {tab === "interventi" && <InterventiTab canMaint={canMaint} vehicles={overview?.vehicles || []} hasPerm={hasPerm} onChanged={loadOverview} />}
      {tab === "stats" && <StatsTab hasPerm={hasPerm} />}

      {sheetVehicle && (
        <VehicleControlsDialog vehicle={sheetVehicle} canMaint={canMaint} hasPerm={hasPerm} onOpenChange={() => setSheetVehicle(null)} onSaved={loadOverview} />
      )}
    </div>
  );
}

function ControlliTab({ overview, onOpenSheet }) {
  if (!overview) return <p className="text-center text-slate-400 py-16">Caricamento…</p>;
  if (!overview.vehicles.length) return <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white"><p className="text-slate-500">Nessun veicolo in flotta</p></div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="maint-controls-grid">
      {overview.vehicles.map((v) => {
        const worst = v.controls.find((c) => c.state === "overdue") || v.controls.find((c) => c.state === "upcoming");
        return (
          <button key={v.vehicle_id} onClick={() => onOpenSheet(v)} className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition" data-testid={`maint-vehicle-card-${v.vehicle_id.slice(0, 8)}`}>
            <div className="flex items-center justify-between">
              <span className="font-targa text-sm font-bold uppercase bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{v.targa}</span>
              <ClipboardList className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-800 mt-2">{v.marca_modello}</p>
            <p className="text-xs text-slate-500">{TIPO_LABELS[v.tipo] || "Auto"}{v.last_km != null ? ` · ${v.last_km.toLocaleString("it-IT")} km` : ""}</p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {worst ? (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${CTRL_STATE[worst.state].cls}`}>{worst.type_name}: {CTRL_STATE[worst.state].label}</span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">Tutti a posto</span>
              )}
              {v.open_interventions > 0 && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-200">{v.open_interventions} interventi</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function VehicleControlsDialog({ vehicle, canMaint, hasPerm, onOpenChange, onSaved }) {
  const [history, setHistory] = useState([]);
  const [checkTarget, setCheckTarget] = useState(null); // {control, outcome}
  const [interv, setInterv] = useState(null); // prefill for KO

  const loadHistory = async () => {
    try {
      const res = await api.get("/maintenance/checks", { params: { vehicle_id: vehicle.vehicle_id } });
      setHistory(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };
  useEffect(() => { loadHistory(); }, [vehicle.vehicle_id]); // eslint-disable-line

  const afterCheck = (outcome, control) => {
    loadHistory();
    onSaved();
    if (outcome === "ko") {
      setInterv({ vehicleId: vehicle.vehicle_id, descrizione: `Controllo ${control.type_name}: esito KO — intervento da effettuare` });
    }
  };

  const download = async (kind) => {
    try {
      const res = await api.get(`/reports/maintenance/checks/${kind}`, { params: { vehicle_id: vehicle.vehicle_id }, responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `controlli_${vehicle.targa}.${kind === "excel" ? "xlsx" : "pdf"}`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="vehicle-controls-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <span className="font-targa text-sm font-bold uppercase bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{vehicle.targa}</span>
            {vehicle.marca_modello}
          </DialogTitle>
          <DialogDescription>
            {TIPO_LABELS[vehicle.tipo] || "Auto"}{vehicle.last_km != null ? ` · ultimo km rilevato: ${vehicle.last_km.toLocaleString("it-IT")}` : " · nessun km registrato"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Controlli da effettuare</h3>
          {vehicle.controls.map((c) => {
            const st = CTRL_STATE[c.state] || CTRL_STATE.never;
            return (
              <div key={c.type_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2" data-testid={`ctrl-row-${c.type_id.slice(0, 6)}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{c.type_name} <span className="text-xs text-slate-400">· ogni {c.interval_days}gg</span></p>
                  <p className="text-xs text-slate-500">{c.last_check ? `ultimo ${fmtDate(c.last_check)} · prossimo ${fmtDate(c.next_due)}` : "mai registrato"}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                  {canMaint && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" title="Esito OK" onClick={() => setCheckTarget({ control: c, outcome: "ok" })} data-testid={`ctrl-ok-${c.type_id.slice(0, 6)}`}><CheckCircle2 className="h-5 w-5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" title="Esito KO" onClick={() => setCheckTarget({ control: c, outcome: "ko" })} data-testid={`ctrl-ko-${c.type_id.slice(0, 6)}`}><XCircle className="h-5 w-5" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Storico controlli</h3>
            {hasPerm("export_reports") && history.length > 0 && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => download("excel")} data-testid="ctrl-history-excel"><FileSpreadsheet className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => download("pdf")} data-testid="ctrl-history-pdf"><FileText className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">Nessun controllo registrato.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden" data-testid="ctrl-history-list">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-100 text-slate-600 text-left"><th className="px-2 py-1.5">Data</th><th className="px-2 py-1.5">Controllo</th><th className="px-2 py-1.5">Esito</th><th className="px-2 py-1.5">Km</th><th className="px-2 py-1.5">Operatore</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{fmtDate(h.checked_at)}</td>
                      <td className="px-2 py-1.5">{h.type_name}</td>
                      <td className="px-2 py-1.5">{(h.outcome || "ok") === "ok" ? <span className="text-emerald-700 font-medium">OK</span> : <span className="text-red-600 font-medium">KO</span>}</td>
                      <td className="px-2 py-1.5">{h.km != null ? h.km.toLocaleString("it-IT") : "—"}</td>
                      <td className="px-2 py-1.5 text-slate-500">{h.user_name || h.user_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>

      {checkTarget && (
        <CheckDialog vehicle={vehicle} control={checkTarget.control} outcome={checkTarget.outcome}
          onOpenChange={() => setCheckTarget(null)}
          onSaved={() => afterCheck(checkTarget.outcome, checkTarget.control)} />
      )}
      {interv && (
        <AddInterventionDialog vehicles={[vehicle]} prefill={interv} onOpenChange={() => setInterv(null)} onSaved={onSaved} />
      )}
    </Dialog>
  );
}

function CheckDialog({ vehicle, control, outcome, onOpenChange, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState(vehicle.last_km != null ? String(vehicle.last_km) : "");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const ko = outcome === "ko";
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/maintenance/checks", {
        vehicle_id: vehicle.vehicle_id, type_id: control.type_id, checked_at: date,
        outcome, km: km === "" ? null : Number(km), note: note || null,
      });
      toast.success(ko ? "Controllo KO registrato" : "Controllo OK registrato");
      onSaved();
      onOpenChange();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="maint-check-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {ko ? <XCircle className="h-5 w-5 text-red-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            Controllo {ko ? "KO" : "OK"}
          </DialogTitle>
          <DialogDescription>{control.type_name} · {vehicle.targa}. {ko ? "Al salvataggio si aprirà la scheda intervento." : `Il conteggio riparte da questa data (prossimo tra ${control.interval_days} gg).`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Data controllo</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-testid="maint-check-date" /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Chilometraggio (facoltativo)</Label><Input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} placeholder="es. 84500" data-testid="maint-check-km" /></div>
          <div className="space-y-1.5"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="maint-check-note" /></div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className={ko ? "bg-red-600 hover:bg-red-700" : ""} data-testid="maint-check-submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registra"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InterventiTab({ canMaint, vehicles, hasPerm, onChanged }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);

  const load = async () => {
    try {
      const params = status === "all" ? {} : { status };
      const res = await api.get("/maintenance/interventions", { params });
      setItems(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line

  const remove = async (id) => {
    try {
      await api.delete(`/maintenance/interventions/${id}`);
      toast.success("Intervento eliminato");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {[["all", "Tutti"], ["open", "Da fare"], ["done", "Effettuati"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${status === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`} data-testid={`interv-filter-${k}`}>{l}</button>
          ))}
        </div>
        {canMaint && <Button size="sm" onClick={() => setAddOpen(true)} data-testid="interv-add-button"><Plus className="h-4 w-4 mr-1.5" /> Nuovo intervento</Button>}
      </div>
      {items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white"><p className="text-slate-500">Nessun intervento</p></div>
      ) : (
        <div className="space-y-2" data-testid="interv-list">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3" data-testid={`interv-item-${it.id.slice(0, 8)}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-targa text-xs font-bold uppercase bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{it.targa}</span>
                  <span className="text-sm font-medium text-slate-800">{it.descrizione}</span>
                  {it.status === "done"
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Effettuato {fmtDate(it.done_at)} · {eur(it.costo || 0)}{it.km != null ? ` · ${it.km.toLocaleString("it-IT")} km` : ""}</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><Clock className="h-3.5 w-3.5" /> Da fare</span>}
                </div>
                {it.note && <p className="text-xs text-slate-500 mt-1">{it.note}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {canMaint && it.status === "open" && <Button size="sm" variant="outline" onClick={() => setCompleteTarget(it)} data-testid={`interv-complete-${it.id.slice(0, 8)}`}>Segna fatto</Button>}
                {hasPerm("delete_operations") && <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => remove(it.id)} data-testid={`interv-delete-${it.id.slice(0, 8)}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {addOpen && <AddInterventionDialog vehicles={vehicles} onOpenChange={setAddOpen} onSaved={() => { load(); onChanged && onChanged(); }} />}
      {completeTarget && <CompleteInterventionDialog item={completeTarget} onOpenChange={() => setCompleteTarget(null)} onSaved={() => { load(); onChanged && onChanged(); }} />}
    </div>
  );
}

function AddInterventionDialog({ vehicles, prefill, onOpenChange, onSaved }) {
  const [vehicleId, setVehicleId] = useState(prefill?.vehicleId || "");
  const [descrizione, setDescrizione] = useState(prefill?.descrizione || "");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const locked = !!prefill?.vehicleId;
  const submit = async (e) => {
    e.preventDefault();
    if (!vehicleId) return toast.error("Seleziona un veicolo");
    setLoading(true);
    try {
      await api.post("/maintenance/interventions", { vehicle_id: vehicleId, descrizione, note: note || null });
      toast.success("Intervento segnalato");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="interv-add-dialog">
        <DialogHeader><DialogTitle className="font-heading">Nuovo intervento</DialogTitle><DialogDescription>Segnala un intervento da fare su un veicolo.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Veicolo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId} disabled={locked}>
              <SelectTrigger data-testid="interv-vehicle-select"><SelectValue placeholder="Seleziona veicolo" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => <SelectItem key={v.vehicle_id} value={v.vehicle_id}>{v.targa} — {v.marca_modello}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} required placeholder="es. Sostituzione pastiglie freni" data-testid="interv-desc-input" /></div>
          <div className="space-y-1.5"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="interv-note-input" /></div>
          <DialogFooter><Button type="submit" disabled={loading} data-testid="interv-add-submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteInterventionDialog({ item, onOpenChange, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [costo, setCosto] = useState("");
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/maintenance/interventions/${item.id}/complete`, { done_at: date, costo: Number(costo || 0), km: km === "" ? null : Number(km), note: note || null });
      toast.success("Intervento completato");
      onSaved();
      onOpenChange();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="interv-complete-dialog">
        <DialogHeader><DialogTitle className="font-heading">Intervento effettuato</DialogTitle><DialogDescription>{item.descrizione} · {item.targa}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-testid="interv-complete-date" /></div>
          <div className="space-y-1.5"><Label>Costo (€)</Label><Input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" data-testid="interv-complete-cost" /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Chilometraggio (facoltativo)</Label><Input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} placeholder="es. 84500" data-testid="interv-complete-km" /></div>
          <div className="space-y-1.5"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="interv-complete-note" /></div>
          <DialogFooter><Button type="submit" disabled={loading} data-testid="interv-complete-submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conferma"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatsTab({ hasPerm }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stats, setStats] = useState(null);
  const load = async () => {
    try {
      const params = {};
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const res = await api.get("/maintenance/stats", { params });
      setStats(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const download = async (kind) => {
    try {
      const params = {};
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const res = await api.get(`/reports/maintenance/${kind}`, { params, responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = kind === "excel" ? "manutenzione.xlsx" : "manutenzione.pdf"; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5"><Label className="text-xs text-slate-500">Dal</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="maint-stats-from" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-slate-500">Al</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="maint-stats-to" /></div>
        <Button variant="outline" onClick={load} data-testid="maint-stats-apply">Applica</Button>
        {hasPerm("export_reports") && (
          <>
            <Button variant="outline" onClick={() => download("excel")} data-testid="maint-export-excel"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
            <Button variant="outline" onClick={() => download("pdf")} data-testid="maint-export-pdf"><FileText className="h-4 w-4 mr-1.5" /> PDF</Button>
          </>
        )}
      </div>
      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="maint-stat-cost"><p className="text-2xl font-heading font-extrabold text-slate-900">{eur(stats.total_cost)}</p><p className="text-xs text-slate-500 mt-1">Costo totale interventi</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-heading font-extrabold text-emerald-700">{stats.done}</p><p className="text-xs text-slate-500 mt-1">Effettuati</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-heading font-extrabold text-amber-600">{stats.open}</p><p className="text-xs text-slate-500 mt-1">Da fare</p></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm" data-testid="maint-stats-table">
              <thead><tr className="bg-slate-900 text-white text-left"><th className="px-3 py-2.5">Veicolo</th><th className="px-3 py-2.5">Effettuati</th><th className="px-3 py-2.5">Da fare</th><th className="px-3 py-2.5 text-right">Costo</th></tr></thead>
              <tbody>
                {stats.by_vehicle.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Nessun dato nel periodo</td></tr>
                ) : stats.by_vehicle.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2.5"><span className="font-targa text-xs font-bold uppercase">{r.targa}</span> <span className="text-slate-500">{r.marca_modello}</span></td><td className="px-3 py-2.5">{r.done}</td><td className="px-3 py-2.5">{r.open}</td><td className="px-3 py-2.5 text-right font-semibold">{eur(r.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
