import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import {
  Receipt,
  Wrench,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  RefreshCw,
} from "lucide-react";

const ICON = {
  bollo_add: Receipt,
  bollo_delete: Trash2,
  collaudo_add: Wrench,
  collaudo_delete: Trash2,
  policy_set: ShieldCheck,
  policy_renew: RefreshCw,
  policy_suspend: PauseCircle,
  policy_reactivate: PlayCircle,
  vehicle_create: Plus,
  vehicle_update: Pencil,
  vehicle_delete: Trash2,
  undo: Undo2,
};

export default function VehicleHistoryDialog({ open, onOpenChange, vehicle }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    if (!vehicle) return;
    api
      .get(`/vehicles/${vehicle.id}/history`)
      .then((res) => setEntries(res.data))
      .catch((e) => toast.error(apiErrorMessage(e)));
  }, [vehicle]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="vehicle-history-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Scheda storica — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>Tutte le operazioni con data, operatore e ricalcolo scadenze.</DialogDescription>
        </DialogHeader>
        {entries === null ? (
          <p className="text-center text-slate-400 py-6">Caricamento…</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-slate-400 py-6">Nessuna operazione registrata.</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200" />
            <div className="space-y-3">
              {entries.map((e) => {
                const Icon = ICON[e.action] || Pencil;
                return (
                  <div key={e.id} className="relative" data-testid={`history-entry-${e.id}`}>
                    <div className={`absolute -left-[18px] top-0.5 h-4 w-4 rounded-full flex items-center justify-center ${e.reverted ? "bg-slate-300" : "bg-blue-600"}`}>
                      <Icon className="h-2.5 w-2.5 text-white" />
                    </div>
                    <div className={`rounded-lg border px-3 py-2 ${e.reverted ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">{e.action_label}</p>
                        <span className="text-[11px] text-slate-400">{fmtDate(e.effective_date)}</span>
                      </div>
                      <p className="text-xs text-slate-600">{e.description}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {e.user_name || e.user_email}
                        {e.reverted ? " · ANNULLATA" : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
