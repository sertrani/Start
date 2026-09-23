import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
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
import { Lightbulb, PauseCircle, Sun, Snowflake, CloudSun, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

const LEVELS = {
  high: { label: "Sospendi ora", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  medium: { label: "Valuta", cls: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  low: { label: "Mantieni attivo", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  suspended: { label: "Già sospesa", cls: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  none: { label: "N/D", cls: "bg-slate-50 text-slate-400 border-slate-200", dot: "bg-slate-300" },
};

const PHASE_ICON = { closed: Snowflake, shoulder: CloudSun, peak: Sun };
const PHASE_CLS = {
  closed: "bg-blue-50 border-blue-200 text-blue-800",
  shoulder: "bg-amber-50 border-amber-200 text-amber-800",
  peak: "bg-red-50 border-red-200 text-red-800",
};

export default function Strategia() {
  const { hasPerm } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/strategy");
      setData(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  const PhaseIcon = data ? PHASE_ICON[data.season.phase] || CloudSun : CloudSun;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-amber-500" /> Strategia sospensioni
        </h1>
        <p className="text-sm text-slate-500">
          Suggerimenti su quali veicoli conviene sospendere per risparmiare su polizze e collaudi, in base a stagione e scadenze.
        </p>
      </div>

      {data && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${PHASE_CLS[data.season.phase]}`} data-testid="strategy-season-banner">
          <PhaseIcon className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-semibold">{data.season.phase_label}</p>
            <p className="text-xs opacity-80">
              Stagione operativa: mese {data.season.start} → {data.season.end}. {data.opportunities} veicolo/i da sospendere ora.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-400 py-20">Analisi della flotta…</p>
      ) : !data?.items?.length ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
          <p className="text-slate-500 font-medium">Nessun veicolo da analizzare</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="strategy-list">
          {data.items.map((it) => {
            const lv = LEVELS[it.level] || LEVELS.none;
            return (
              <div key={it.vehicle_id} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`strategy-item-${it.vehicle_id.slice(0, 8)}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-targa text-sm font-bold uppercase tracking-wider bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{it.targa}</span>
                      <span className="text-sm font-semibold text-slate-800">{it.marca_modello}</span>
                      <span className="text-xs text-slate-500">{TIPO_LABELS[it.tipo] || "Auto"}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${lv.cls}`} data-testid={`strategy-level-${it.vehicle_id.slice(0, 8)}`}>
                        <span className={`h-2 w-2 rounded-full ${lv.dot}`} /> {it.recommendation}
                      </span>
                      <span className="text-xs text-slate-500">Punteggio {it.score}/100</span>
                      {it.estimated_saving != null && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <TrendingDown className="h-3.5 w-3.5" /> risparmio stimato ~{eur(it.estimated_saving)}
                        </span>
                      )}
                    </div>
                  </div>
                  {hasPerm("manage_policies") && it.policy?.can_suspend && it.level !== "low" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0"
                      onClick={() => setConfirm(it)}
                      data-testid={`strategy-suspend-button-${it.vehicle_id.slice(0, 8)}`}
                    >
                      <PauseCircle className="h-4 w-4 mr-1.5" /> Sospendi dal {fmtDate(it.suggested_from)}
                    </Button>
                  )}
                </div>

                {it.reasons?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {it.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /> {r}
                      </li>
                    ))}
                  </ul>
                )}

                {it.blockers?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {it.blockers.map((b, i) => (
                      <p key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {b}
                      </p>
                    ))}
                  </div>
                )}

                {it.policy && it.suggested_from && it.suggested_until && (
                  <p className="mt-2 text-xs text-slate-400">
                    Finestra suggerita: {fmtDate(it.suggested_from)} → {fmtDate(it.suggested_until)}
                    {it.policy.scadenza_contratto ? ` · scad. polizza ${fmtDate(it.policy.scadenza_contratto)}` : ""}
                  </p>
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
            <AlertDialogDescription>
              Stai per sospendere la polizza di <b>{confirm?.targa}</b> a partire dal {fmtDate(confirm?.suggested_from)}.
              Potrai riattivarla in qualsiasi momento dalla scheda polizza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={doSuspend} disabled={busy} className="bg-blue-600 hover:bg-blue-700" data-testid="strategy-confirm-suspend-button">
              Sospendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
