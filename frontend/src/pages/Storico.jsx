import { useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtDate, ACTION_LABELS } from "@/lib/format";
import {
  Receipt, Wrench, ShieldCheck, PauseCircle, PlayCircle, Pencil, Plus, Trash2, Undo2, RefreshCw,
  FileSpreadsheet, FileText, Filter,
} from "lucide-react";

const ICON = {
  bollo_add: Receipt, bollo_delete: Trash2, collaudo_add: Wrench, collaudo_delete: Trash2,
  policy_set: ShieldCheck, policy_renew: RefreshCw, policy_suspend: PauseCircle, policy_reactivate: PlayCircle,
  vehicle_create: Plus, vehicle_update: Pencil, vehicle_delete: Trash2, undo: Undo2,
};
const ALL = "__all__";

export default function Storico() {
  const { hasPerm } = useAuth();
  const [entries, setEntries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ vehicle_id: ALL, action: ALL, user_email: ALL, date_from: "", date_to: "" });

  const params = useMemo(() => {
    const p = { limit: 500 };
    if (filters.vehicle_id !== ALL) p.vehicle_id = filters.vehicle_id;
    if (filters.action !== ALL) p.action = filters.action;
    if (filters.user_email !== ALL) p.user_email = filters.user_email;
    if (filters.date_from) p.date_from = filters.date_from;
    if (filters.date_to) p.date_to = filters.date_to;
    return p;
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/audit", { params });
      setEntries(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);
  useEffect(() => { api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get("/audit/operators").then((r) => setOperators(r.data)).catch(() => {}); }, []);

  const undo = async (id) => {
    try {
      await api.post(`/audit/${id}/undo`);
      toast.success("Operazione annullata e stato ripristinato");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const download = async (kind) => {
    try {
      const res = await api.get(`/reports/audit/${kind}`, { params, responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "excel" ? "storico.xlsx" : "storico.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Report generato");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const reset = () => setFilters({ vehicle_id: ALL, action: ALL, user_email: ALL, date_from: "", date_to: "" });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900">Resoconto storico</h1>
          <p className="text-sm text-slate-500">Tutte le operazioni della flotta. Annullare ripristina lo stato e i contatori.</p>
        </div>
        {hasPerm("export_reports") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => download("excel")} data-testid="storico-export-excel">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" onClick={() => download("pdf")} data-testid="storico-export-pdf">
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" data-testid="storico-filters">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Veicolo</Label>
          <Select value={filters.vehicle_id} onValueChange={(v) => setFilters({ ...filters, vehicle_id: v })}>
            <SelectTrigger data-testid="filter-vehicle"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i veicoli</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.targa} — {v.marca_modello}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo operazione</Label>
          <Select value={filters.action} onValueChange={(v) => setFilters({ ...filters, action: v })}>
            <SelectTrigger data-testid="filter-action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le operazioni</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Operatore</Label>
          <Select value={filters.user_email} onValueChange={(v) => setFilters({ ...filters, user_email: v })}>
            <SelectTrigger data-testid="filter-operator"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti gli operatori</SelectItem>
              {operators.map((o) => (
                <SelectItem key={o.email} value={o.email}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Dal</Label>
          <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} data-testid="filter-date-from" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Al</Label>
          <div className="flex gap-2">
            <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} data-testid="filter-date-to" />
            <Button variant="ghost" onClick={reset} data-testid="filter-reset">Azzera</Button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-16">Caricamento…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-slate-400 py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white">Nessuna operazione per i filtri selezionati.</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100" data-testid="storico-list">
          {entries.map((e) => {
            const Icon = ICON[e.action] || Pencil;
            const undoable = !e.reverted && e.action !== "undo";
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3" data-testid={`storico-entry-${e.id}`}>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${e.reverted ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-600"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{e.action_label}</p>
                    {e.targa && <span className="font-targa text-[11px] font-bold bg-amber-300/30 border border-amber-400/50 px-1.5 rounded">{e.targa}</span>}
                    {e.reverted && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">ANNULLATA</span>}
                  </div>
                  <p className="text-xs text-slate-600 truncate">{e.description}</p>
                  <p className="text-[11px] text-slate-400">{fmtDate(e.effective_date)} · {e.user_name || e.user_email}</p>
                </div>
                {hasPerm("delete_operations") && undoable && (
                  <Button size="sm" variant="outline" className="shrink-0 text-red-600 border-red-200 hover:bg-red-50" onClick={() => undo(e.id)} data-testid={`undo-button-${e.id}`}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Annulla
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
