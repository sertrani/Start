import { useEffect, useState, useCallback } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDate, eur, TIPO_LABELS } from "@/lib/format";
import {
  Lightbulb, PauseCircle, Sun, Snowflake, CloudSun, TrendingDown, AlertTriangle,
  CheckCircle2, BookmarkPlus, PlayCircle, XCircle, Trash2, FileSpreadsheet, FileText, Sparkles,
} from "lucide-react";

const LEVELS = {
  high: { cls: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  medium: { cls: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  low: { cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  suspended: { cls: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  none: { cls: "bg-slate-50 text-slate-400 border-slate-200", dot: "bg-slate-300" },
};
const PHASE_ICON = { closed: Snowflake, shoulder: CloudSun, peak: Sun };
const PHASE_CLS = {
  closed: "bg-blue-50 border-blue-200 text-blue-800",
  shoulder: "bg-amber-50 border-amber-200 text-amber-800",
  peak: "bg-red-50 border-red-200 text-red-800",
};
const PLAN_STATUS = {
  planned: { label: "Pianificata", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  applied: { label: "Applicata", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Annullata", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export default function Strategia() {
  const { hasPerm } = useAuth();
  const canPolicy = hasPerm("manage_policies");
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("suggestions");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState("");
  const [needs, setNeeds] = useState({ auto: "", furgone: "", altro: "" });

  const load = useCallback(async () => {
    try {
      const params = {};
      if (until) params.until = until;
      if (needs.auto !== "") params.need_auto = Number(needs.auto);
      if (needs.furgone !== "") params.need_furgone = Number(needs.furgone);
      if (needs.altro !== "") params.need_altro = Number(needs.altro);
      const [s, p] = await Promise.all([api.get("/strategy", { params }), api.get("/strategy/plan")]);
      setData(s.data);
      setPlans(p.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [until, needs]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  const simulate = () => load();

  const savePlan = async (it) => {
    try {
      await api.post("/strategy/plan", {
        vehicle_id: it.vehicle_id,
        suggested_from: it.suggested_from,
        suggested_until: it.suggested_until,
        estimated_saving: it.estimated_saving,
      });
      toast.success(`${it.targa} aggiunto al piano`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const doSuspend = async () => {
    setBusy(true);
    try {
      await api.post(`/vehicles/${confirm.vehicle_id}/policy/suspend`, { effective_date: confirm.suggested_from });
      toast.success(`Copertura sospesa — ${confirm.targa}`);
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const planAction = async (id, action) => {
    try {
      if (action === "delete") await api.delete(`/strategy/plan/${id}`);
      else await api.post(`/strategy/plan/${id}/${action}`);
      toast.success("Piano aggiornato");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const download = async (kind) => {
    try {
      const res = await api.get(`/reports/strategy/${kind}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "excel" ? "strategia.xlsx" : "strategia.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const PhaseIcon = data ? PHASE_ICON[data.season.phase] || CloudSun : CloudSun;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-amber-500" /> Strategia sospensioni
          </h1>
          <p className="text-sm text-slate-500">Quali veicoli conviene sospendere per risparmiare su polizze e collaudi.</p>
        </div>
        {hasPerm("export_reports") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => download("excel")} data-testid="strategy-export-excel"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
            <Button variant="outline" onClick={() => download("pdf")} data-testid="strategy-export-pdf"><FileText className="h-4 w-4 mr-1.5" /> PDF</Button>
          </div>
        )}
      </div>

      {data && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${PHASE_CLS[data.season.phase]}`} data-testid="strategy-season-banner">
          <PhaseIcon className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-semibold">{data.season.phase_label}</p>
            <p className="text-xs opacity-80">Stagione operativa: mese {data.season.start} → {data.season.end}. {data.opportunities} veicolo/i consigliati per la sospensione.</p>
          </div>
        </div>
      )}

      {/* Simulatore */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="strategy-simulator">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h2 className="font-heading font-semibold text-slate-800">Simulatore risparmio</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label className="text-xs text-slate-500">Sospendi fino al</Label>
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} data-testid="sim-until-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Auto necessarie</Label>
            <Input type="number" min="0" value={needs.auto} onChange={(e) => setNeeds({ ...needs, auto: e.target.value })} placeholder="—" data-testid="sim-need-auto" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Furgoni necessari</Label>
            <Input type="number" min="0" value={needs.furgone} onChange={(e) => setNeeds({ ...needs, furgone: e.target.value })} placeholder="—" data-testid="sim-need-furgone" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Altri necessari</Label>
            <Input type="number" min="0" value={needs.altro} onChange={(e) => setNeeds({ ...needs, altro: e.target.value })} placeholder="—" data-testid="sim-need-altro" />
          </div>
          <Button onClick={simulate} data-testid="sim-run-button"><TrendingDown className="h-4 w-4 mr-1.5" /> Simula</Button>
        </div>
        {data && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold" data-testid="sim-total-saving">
              <TrendingDown className="h-4 w-4" /> Risparmio potenziale ~{eur(data.simulation.total_saving)}
            </span>
            <span className="text-slate-500">su <b>{data.simulation.count}</b> mezzi, sospendendo fino al {fmtDate(data.simulation.until)}</span>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">Indica quanti mezzi ti servono per tipo: il sistema propone di sospendere l'eccedenza (tenendo i più necessari).</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("suggestions")} className={`px-4 py-2 rounded-lg text-sm font-medium border ${tab === "suggestions" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`} data-testid="strategy-tab-suggestions">Suggerimenti</button>
        <button onClick={() => setTab("plan")} className={`px-4 py-2 rounded-lg text-sm font-medium border ${tab === "plan" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`} data-testid="strategy-tab-plan">
          Piano {plans.filter((p) => p.status === "planned").length > 0 && <span className="ml-1 text-xs bg-amber-400 text-slate-900 rounded-full px-1.5">{plans.filter((p) => p.status === "planned").length}</span>}
        </button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-20">Analisi della flotta…</p>
      ) : tab === "suggestions" ? (
        !data?.items?.length ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white"><p className="text-slate-500 font-medium">Nessun veicolo da analizzare</p></div>
        ) : (
          <div className="space-y-3" data-testid="strategy-list">
            {data.items.map((it) => {
              const lv = LEVELS[it.level] || LEVELS.none;
              const tid = it.vehicle_id.slice(0, 8);
              return (
                <div key={it.vehicle_id} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`strategy-item-${tid}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-targa text-sm font-bold uppercase tracking-wider bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{it.targa}</span>
                        <span className="text-sm font-semibold text-slate-800">{it.marca_modello}</span>
                        <span className="text-xs text-slate-500">{TIPO_LABELS[it.tipo] || "Auto"}</span>
                        {it.planned && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 rounded" data-testid={`strategy-planned-${tid}`}>IN PIANO</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${lv.cls}`} data-testid={`strategy-level-${tid}`}>
                          <span className={`h-2 w-2 rounded-full ${lv.dot}`} /> {it.recommendation}
                        </span>
                        <span className="text-xs text-slate-500">Punteggio {it.score}/100</span>
                        {it.estimated_saving != null && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><TrendingDown className="h-3.5 w-3.5" /> ~{eur(it.estimated_saving)}</span>
                        )}
                      </div>
                    </div>
                    {canPolicy && it.policy?.can_suspend && it.level !== "low" && (
                      <div className="flex gap-2 shrink-0">
                        {!it.planned && (
                          <Button size="sm" variant="outline" onClick={() => savePlan(it)} data-testid={`strategy-save-plan-${tid}`}>
                            <BookmarkPlus className="h-4 w-4 mr-1.5" /> Al piano
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setConfirm(it)} data-testid={`strategy-suspend-button-${tid}`}>
                          <PauseCircle className="h-4 w-4 mr-1.5" /> Sospendi dal {fmtDate(it.suggested_from)}
                        </Button>
                      </div>
                    )}
                  </div>
                  {it.reasons?.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {it.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /> {r}</li>
                      ))}
                    </ul>
                  )}
                  {it.blockers?.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {it.blockers.map((b, i) => (
                        <p key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {b}</p>
                      ))}
                    </div>
                  )}
                  {it.policy && it.suggested_from && it.suggested_until && (
                    <p className="mt-2 text-xs text-slate-400">Finestra: {fmtDate(it.suggested_from)} → {fmtDate(it.suggested_until)}{it.policy.scadenza_contratto ? ` · scad. polizza ${fmtDate(it.policy.scadenza_contratto)}` : ""}</p>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : plans.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white"><p className="text-slate-500 font-medium">Nessuna sospensione pianificata</p><p className="text-sm text-slate-400">Salva un suggerimento nel piano per ritrovarlo qui.</p></div>
      ) : (
        <div className="space-y-3" data-testid="plan-list">
          {plans.map((pl) => {
            const st = PLAN_STATUS[pl.status] || PLAN_STATUS.planned;
            const tid = pl.id.slice(0, 8);
            return (
              <div key={pl.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid={`plan-item-${tid}`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-targa text-sm font-bold uppercase tracking-wider bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{pl.targa}</span>
                    <span className="text-sm font-semibold text-slate-800">{pl.marca_modello}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Sospendere dal {fmtDate(pl.suggested_from)} al {fmtDate(pl.suggested_until)}{pl.estimated_saving != null ? ` · risparmio ~${eur(pl.estimated_saving)}` : ""}</p>
                </div>
                {canPolicy && (
                  <div className="flex gap-2 shrink-0">
                    {pl.status === "planned" && (
                      <>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => planAction(pl.id, "apply")} data-testid={`plan-apply-${tid}`}><PlayCircle className="h-4 w-4 mr-1.5" /> Applica</Button>
                        <Button size="sm" variant="outline" onClick={() => planAction(pl.id, "cancel")} data-testid={`plan-cancel-${tid}`}><XCircle className="h-4 w-4 mr-1.5" /> Annulla</Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => planAction(pl.id, "delete")} data-testid={`plan-delete-${tid}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent data-testid="strategy-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Sospendere la copertura?</AlertDialogTitle>
            <AlertDialogDescription>Stai per sospendere la polizza di <b>{confirm?.targa}</b> dal {fmtDate(confirm?.suggested_from)}. Potrai riattivarla in qualsiasi momento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={doSuspend} disabled={busy} className="bg-blue-600 hover:bg-blue-700" data-testid="strategy-confirm-suspend-button">Sospendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
