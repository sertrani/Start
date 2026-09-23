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
  Wrench, CheckCircle2, AlertTriangle, Clock, Plus, ClipboardCheck, ListTodo, BarChart3,
  FileSpreadsheet, FileText, Trash2, Loader2,
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
  const [checkTarget, setCheckTarget] = useState(null);

  const loadOverview = async () => {
    try {
      const res = await api.get("/maintenance/overview");
      setOverview(res.data);
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
        <p className="text-sm text-slate-500">Controlli periodici (olio, freni, luci…), interventi da fare e statistiche costi.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[["controlli", "Controlli", ClipboardCheck], ["interventi", "Interventi", ListTodo], ["stats", "Statistiche", BarChart3]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-medium border inline-flex items-center gap-1.5 ${tab === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`} data-testid={`maint-tab-${k}`}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      {tab === "controlli" && (
        <ControlliTab overview={overview} canMaint={canMaint} onCheck={setCheckTarget} />
      )}
      {tab === "interventi" && <InterventiTab canMaint={canMaint} vehicles={overview?.vehicles || []} hasPerm={hasPerm} />}
      {tab === "stats" && <StatsTab hasPerm={hasPerm} />}

      {checkTarget && (
        <CheckDialog target={checkTarget} onOpenChange={() => setCheckTarget(null)} onSaved={loadOverview} />
      )}
    </div>
  );
}

function ControlliTab({ overview, canMaint, onCheck }) {
  if (!overview) return <p className="text-center text-slate-400 py-16">Caricamento…</p>;
  if (!overview.vehicles.length) return <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white"><p className="text-slate-500">Nessun veicolo in flotta</p></div>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto" data-testid="maint-controls-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900 text-white text-left">
            <th className="px-3 py-2.5 font-semibold sticky left-0 bg-slate-900">Veicolo</th>
            {overview.types.map((t) => (
              <th key={t.id} className="px-3 py-2.5 font-semibold whitespace-nowrap">{t.name}<span className="block text-[10px] font-normal opacity-70">ogni {t.interval_days}gg</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {overview.vehicles.map((v) => (
            <tr key={v.vehicle_id} className="border-t border-slate-100 hover:bg-slate-50" data-testid={`maint-row-${v.vehicle_id.slice(0, 8)}`}>
              <td className="px-3 py-3 sticky left-0 bg-white">
                <span className="font-targa text-xs font-bold uppercase bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{v.targa}</span>
                <p className="text-xs text-slate-500 mt-1">{TIPO_LABELS[v.tipo] || "Auto"}{v.open_interventions ? ` · ${v.open_interventions} interv. aperti` : ""}</p>
              </td>
              {v.controls.map((c) => {
                const st = CTRL_STATE[c.state] || CTRL_STATE.never;
                return (
                  <td key={c.type_id} className="px-3 py-3">
                    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    <p className="text-[11px] text-slate-500 mt-1">{c.next_due ? `entro ${fmtDate(c.next_due)}` : "—"}</p>
                    {canMaint && (
                      <button className="mt-1 text-[11px] text-blue-600 hover:underline" onClick={() => onCheck({ vehicle: v, control: c })} data-testid={`maint-check-btn-${v.vehicle_id.slice(0, 8)}-${c.type_id.slice(0, 6)}`}>✓ effettuato</button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckDialog({ target, onOpenChange, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/maintenance/checks", {
        vehicle_id: target.vehicle.vehicle_id, type_id: target.control.type_id, checked_at: date, note: note || null,
      });
      toast.success("Controllo registrato");
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
          <DialogTitle className="font-heading">Controllo effettuato</DialogTitle>
          <DialogDescription>{target.control.type_name} · {target.vehicle.targa}. Il conteggio riparte da questa data (prossimo tra {target.control.interval_days} gg).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Data controllo</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-testid="maint-check-date" /></div>
          <div className="space-y-1.5"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="maint-check-note" /></div>
          <DialogFooter>
            <Button type="submit" disabled={loading} data-testid="maint-check-submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registra"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InterventiTab({ canMaint, vehicles, hasPerm }) {
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
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Effettuato {fmtDate(it.done_at)} · {eur(it.costo || 0)}</span>
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
      {addOpen && <AddInterventionDialog vehicles={vehicles} onOpenChange={setAddOpen} onSaved={load} />}
      {completeTarget && <CompleteInterventionDialog item={completeTarget} onOpenChange={() => setCompleteTarget(null)} onSaved={load} />}
    </div>
  );
}

function AddInterventionDialog({ vehicles, onOpenChange, onSaved }) {
  const [vehicleId, setVehicleId] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
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
            <Select value={vehicleId} onValueChange={setVehicleId}>
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
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/maintenance/interventions/${item.id}/complete`, { done_at: date, costo: Number(costo || 0), note: note || null });
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
