import {
  CheckCircle2,
  XCircle,
  Receipt,
  Wrench,
  ShieldCheck,
  Pencil,
  Trash2,
  FileSignature,
  CalendarClock,
  Paperclip,
  Clock,
  StickyNote,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { fmtDate, eur, POLICY_LABELS, stateBadge } from "@/lib/format";

function Row({ icon: Icon, label, date, state, extra, onClick }) {
  const b = stateBadge(state);
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      className={`flex items-center justify-between py-2 border-t border-slate-100 first:border-0 ${onClick ? "cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-slate-500 leading-tight">{label}</p>
          <p className="text-sm font-medium text-slate-800 truncate">{date}</p>
          {extra}
        </div>
      </div>
      <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
    </div>
  );
}

export default function VehicleCard({ v, onEdit, onPolicy, onCollaudo, onDelete, onDocs, onBollo, onHistory, onDuplicate }) {
  const { hasPerm } = useAuth();
  const can = v.can_circulate;
  const tid = v.id.slice(0, 8);
  const docCount = (v.documents || []).length;
  const showBollo = hasPerm("view_bollo");
  return (
    <div className={`rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden ${can ? "border-emerald-200" : "border-red-200"}`} data-testid={`vehicle-card-${tid}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${can ? "bg-emerald-50" : "bg-red-50"}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-targa text-sm font-bold uppercase tracking-wider bg-amber-300/30 text-slate-900 border border-amber-400/50 px-2 py-0.5 rounded">{v.targa}</span>
            {hasPerm("manage_vehicles") && (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-slate-800" title="Modifica" onClick={() => onEdit(v)} data-testid={`edit-vehicle-button-${tid}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-slate-800" title="Duplica" onClick={() => onDuplicate(v)} data-testid={`duplicate-vehicle-button-${tid}`}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 mt-1.5">{v.marca_modello}</p>
          <p className="text-xs text-slate-500">Imm. {fmtDate(v.data_immatricolazione)} · {v.tipo || "Auto"}</p>
        </div>
        <div className={`flex flex-col items-center gap-1 ${can ? "text-emerald-700" : "text-red-600"}`} data-testid={`circulation-badge-${tid}`}>
          {can ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
          <span className="text-[10px] font-bold text-center leading-tight max-w-[72px]">{can ? "PUÒ CIRCOLARE" : "NON PUÒ CIRCOLARE"}</span>
        </div>
      </div>

      <div className="px-4 py-2">
        <Row icon={Wrench} label="Collaudo / Revisione" date={fmtDate(v.collaudo_deadline)} state={v.collaudo_state} onClick={hasPerm("manage_payments") ? () => onCollaudo(v) : undefined} />
        <Row
          icon={ShieldCheck}
          label={v.policy ? `Polizza — ${v.policy.compagnia}${v.policy.numero_polizza ? ` (${v.policy.numero_polizza})` : ""}` : "Polizza assicurativa"}
          date={v.policy ? `${POLICY_LABELS[v.policy.tipologia] || v.policy.tipologia} · scad. ${fmtDate(v.policy.scadenza_contratto)}` : "Non inserita"}
          state={v.insurance_state}
          onClick={hasPerm("manage_policies") ? () => onPolicy(v) : undefined}
          extra={
            v.policy ? (
              <p className="text-[11px] text-slate-500">
                {v.policy.importo_premio != null ? `Premio ${eur(v.policy.importo_premio)}` : ""}
                {v.policy.status === "suspended" ? ` · Sospesa ${v.policy.cumulative_suspension_days}/${v.policy.max_suspension_days} gg` : ""}
              </p>
            ) : null
          }
        />
        {v.policy?.scadenza_rata_intermedia && (
          <Row icon={CalendarClock} label="Rata intermedia" date={fmtDate(v.policy.scadenza_rata_intermedia)} state={v.policy.rata_state} onClick={hasPerm("manage_policies") ? () => onPolicy(v) : undefined} />
        )}
        {showBollo && (
          <Row icon={Receipt} label="Bollo (non blocca la circolazione)" date={v.bollo_scadenza ? fmtDate(v.bollo_scadenza) : "Non inserito"} state={v.bollo_state} onClick={hasPerm("manage_payments") ? () => onBollo(v) : undefined} />
        )}
        {v.note && (
          <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-1" data-testid={`vehicle-note-${tid}`}>
            <StickyNote className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 italic line-clamp-2">{v.note}</p>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-1">
        {hasPerm("manage_policies") && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-600" onClick={() => onPolicy(v)} data-testid={`manage-policy-button-${tid}`}>
            <FileSignature className="h-3.5 w-3.5 mr-1" /> Polizza
          </Button>
        )}
        {hasPerm("manage_payments") && (
          <>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-600" onClick={() => onCollaudo(v)} data-testid={`register-collaudo-button-${tid}`}>
              <Wrench className="h-3.5 w-3.5 mr-1" /> Collaudo
            </Button>
            {showBollo && (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-600" onClick={() => onBollo(v)} data-testid={`bollo-button-${tid}`}>
                <Receipt className="h-3.5 w-3.5 mr-1" /> Bollo
              </Button>
            )}
          </>
        )}
        {hasPerm("manage_vehicles") && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-600" onClick={() => onDocs(v)} data-testid={`documents-button-${tid}`}>
            <Paperclip className="h-3.5 w-3.5 mr-1" /> Doc{docCount ? ` (${docCount})` : ""}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-600" onClick={() => onHistory(v)} data-testid={`history-button-${tid}`}>
          <Clock className="h-3.5 w-3.5 mr-1" /> Storico
        </Button>
        {hasPerm("delete_operations") && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto" onClick={() => onDelete(v)} data-testid={`delete-vehicle-button-${tid}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
