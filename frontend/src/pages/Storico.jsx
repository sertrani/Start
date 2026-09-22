import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";
import {
  Receipt, Wrench, ShieldCheck, PauseCircle, PlayCircle, Pencil, Plus, Trash2, Undo2, RefreshCw, Search,
} from "lucide-react";

const ICON = {
  bollo_add: Receipt, bollo_delete: Trash2, collaudo_add: Wrench, collaudo_delete: Trash2,
  policy_set: ShieldCheck, policy_renew: RefreshCw, policy_suspend: PauseCircle, policy_reactivate: PlayCircle,
  vehicle_create: Plus, vehicle_update: Pencil, vehicle_delete: Trash2, undo: Undo2,
};

export default function Storico() {
  const { hasPerm } = useAuth();
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get("/audit", { params: { limit: 500 } });
      setEntries(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const undo = async (id) => {
    try {
      await api.post(`/audit/${id}/undo`);
      toast.success("Operazione annullata e stato ripristinato");
      load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const filtered = entries.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (e.targa || "").toLowerCase().includes(q) ||
      (e.action_label || "").toLowerCase().includes(q) ||
      (e.user_email || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900">Resoconto storico</h1>
          <p className="text-sm text-slate-500">Tutte le operazioni della flotta. Annullare ripristina lo stato e i contatori.</p>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca targa, operazione, utente…" className="pl-9" data-testid="storico-search" />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-16">Caricamento…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-400 py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white">Nessuna operazione.</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100" data-testid="storico-list">
          {filtered.map((e) => {
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
