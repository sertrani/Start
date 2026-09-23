import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { fmtDate, POLICY_LABELS, stateBadge } from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  FileSignature,
  Wrench,
  Receipt,
  Paperclip,
  Clock,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";

function Pill({ state, text }) {
  const b = stateBadge(state);
  return <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${b.cls}`}>{text}</span>;
}

export default function FleetTable({ vehicles, onEdit, onPolicy, onCollaudo, onDelete, onDocs, onBollo, onHistory, onDuplicate }) {
  const { hasPerm } = useAuth();
  const showBollo = hasPerm("view_bollo");
  const canVehicles = hasPerm("manage_vehicles");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto" data-testid="fleet-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900 text-white text-left">
            <th className="px-3 py-2.5 font-semibold">Targa</th>
            <th className="px-3 py-2.5 font-semibold">Veicolo</th>
            <th className="px-3 py-2.5 font-semibold">Circolazione</th>
            <th className="px-3 py-2.5 font-semibold">Collaudo</th>
            <th className="px-3 py-2.5 font-semibold">Polizza</th>
            {showBollo && <th className="px-3 py-2.5 font-semibold">Bollo</th>}
            <th className="px-3 py-2.5 font-semibold text-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => {
            const tid = v.id.slice(0, 8);
            const docCount = (v.documents || []).length;
            return (
              <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50 align-top" data-testid={`fleet-row-${tid}`}>
                <td className="px-3 py-3">
                  <span className="font-targa text-xs font-bold uppercase tracking-wider bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{v.targa}</span>
                  {canVehicles && (
                    <div className="flex items-center gap-0.5 mt-1.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Modifica" onClick={() => onEdit(v)} data-testid={`table-edit-button-${tid}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Duplica" onClick={() => onDuplicate(v)} data-testid={`table-duplicate-button-${tid}`}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-800">{v.marca_modello}</p>
                  <p className="text-xs text-slate-500">{v.tipo || "Auto"} · Imm. {fmtDate(v.data_immatricolazione)}</p>
                </td>
                <td className="px-3 py-3">
                  {v.can_circulate ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs" data-testid={`table-circulation-${tid}`}>
                      <CheckCircle2 className="h-4 w-4" /> Può circolare
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs" data-testid={`table-circulation-${tid}`}>
                      <XCircle className="h-4 w-4" /> Fermo
                    </span>
                  )}
                </td>
                <td className={`px-3 py-3 ${hasPerm("manage_payments") ? "cursor-pointer" : ""}`} onClick={hasPerm("manage_payments") ? () => onCollaudo(v) : undefined}>
                  <p className="text-slate-700">{fmtDate(v.collaudo_deadline)}</p>
                  <Pill state={v.collaudo_state} text={stateBadge(v.collaudo_state).label} />
                </td>
                <td className={`px-3 py-3 ${hasPerm("manage_policies") ? "cursor-pointer" : ""}`} onClick={hasPerm("manage_policies") ? () => onPolicy(v) : undefined}>
                  {v.policy ? (
                    <>
                      <p className="text-slate-700 truncate max-w-[180px]">{v.policy.compagnia} · {POLICY_LABELS[v.policy.tipologia] || v.policy.tipologia}</p>
                      <p className="text-xs text-slate-500">Scad. {fmtDate(v.policy.scadenza_contratto)}</p>
                      <Pill state={v.insurance_state} text={v.policy.status === "suspended" ? `Sospesa ${v.policy.cumulative_suspension_days}/${v.policy.max_suspension_days}gg` : stateBadge(v.insurance_state).label} />
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Non inserita</span>
                  )}
                </td>
                {showBollo && (
                  <td className={`px-3 py-3 ${hasPerm("manage_payments") ? "cursor-pointer" : ""}`} onClick={hasPerm("manage_payments") ? () => onBollo(v) : undefined}>
                    <p className="text-slate-700">{v.bollo_scadenza ? fmtDate(v.bollo_scadenza) : "—"}</p>
                    {v.bollo_scadenza && <Pill state={v.bollo_state} text={stateBadge(v.bollo_state).label} />}
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-0.5 flex-wrap">
                    {hasPerm("manage_policies") && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Polizza" onClick={() => onPolicy(v)} data-testid={`table-policy-button-${tid}`}>
                        <FileSignature className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {hasPerm("manage_payments") && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Collaudo" onClick={() => onCollaudo(v)} data-testid={`table-collaudo-button-${tid}`}>
                          <Wrench className="h-3.5 w-3.5" />
                        </Button>
                        {showBollo && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Bollo" onClick={() => onBollo(v)} data-testid={`table-bollo-button-${tid}`}>
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {hasPerm("manage_vehicles") && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Documenti" onClick={() => onDocs(v)} data-testid={`table-documents-button-${tid}`}>
                        <Paperclip className="h-3.5 w-3.5" />{docCount ? <span className="text-[9px]">{docCount}</span> : null}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Storico" onClick={() => onHistory(v)} data-testid={`table-history-button-${tid}`}>
                      <Clock className="h-3.5 w-3.5" />
                    </Button>
                    {hasPerm("delete_operations") && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Elimina" onClick={() => onDelete(v)} data-testid={`table-delete-button-${tid}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
