import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { API, apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import VehicleCard from "@/components/VehicleCard";
import VehicleFormDialog from "@/components/VehicleFormDialog";
import PolicyDialog from "@/components/PolicyDialog";
import CollaudoDialog from "@/components/CollaudoDialog";
import {
  Car,
  LogOut,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
} from "lucide-react";

const FILTERS = [
  { key: "all", label: "Tutti", testid: "fleet-status-filter-all" },
  { key: "can", label: "Può circolare", testid: "fleet-status-filter-can-circulate" },
  { key: "cannot", label: "Non può circolare", testid: "fleet-status-filter-cannot-circulate" },
  { key: "suspended", label: "Polizze sospese", testid: "fleet-status-filter-suspended" },
  { key: "bollo", label: "Bollo scaduto", testid: "fleet-status-filter-bollo" },
];

function Kpi({ icon: Icon, label, value, tone, testid }) {
  const tones = {
    slate: "text-slate-700 bg-slate-100",
    green: "text-emerald-700 bg-emerald-100",
    red: "text-red-600 bg-red-100",
    blue: "text-blue-700 bg-blue-100",
    amber: "text-amber-700 bg-amber-100",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4" data-testid={testid}>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-heading font-extrabold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [policyVehicle, setPolicyVehicle] = useState(null);
  const [collaudoVehicle, setCollaudoVehicle] = useState(null);
  const [deleteVehicle, setDeleteVehicle] = useState(null);

  const load = async () => {
    try {
      const [v, s] = await Promise.all([api.get("/vehicles"), api.get("/dashboard/stats")]);
      setVehicles(v.data);
      setStats(s.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (filter === "can") list = list.filter((v) => v.can_circulate);
    else if (filter === "cannot") list = list.filter((v) => !v.can_circulate);
    else if (filter === "suspended")
      list = list.filter((v) => v.policy?.status === "suspended");
    else if (filter === "bollo") list = list.filter((v) => v.bollo_state === "expired");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (v) =>
          v.targa.toLowerCase().includes(q) || v.marca_modello.toLowerCase().includes(q)
      );
    }
    return list;
  }, [vehicles, filter, query]);

  const refreshPolicyView = async () => {
    await load();
    if (policyVehicle) {
      const updated = (await api.get(`/vehicles/${policyVehicle.id}`)).data;
      setPolicyVehicle(updated);
    }
  };

  const download = async (kind) => {
    try {
      const res = await api.get(`/reports/${kind}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "excel" ? "flotta.xlsx" : "scadenziario.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Report generato");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/vehicles/${deleteVehicle.id}`);
      toast.success("Veicolo eliminato");
      setDeleteVehicle(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <Car className="h-5 w-5" />
          </div>
          <div>
            <p className="font-heading text-base font-extrabold text-slate-900 leading-none">
              FleetCare
            </p>
            <p className="text-[11px] text-slate-500">Gestione Scadenze Flotta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-sm text-slate-500 mr-1">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-button">
            <LogOut className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Esci</span>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-slate-900">Flotta veicoli</h1>
            <p className="text-sm text-slate-500">
              Stato di circolabilità in tempo reale — collaudo e polizza (il bollo non blocca la
              circolazione).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => download("excel")} data-testid="export-excel-button">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" onClick={() => download("pdf")} data-testid="export-pdf-button">
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button
              onClick={() => {
                setEditVehicle(null);
                setFormOpen(true);
              }}
              data-testid="add-vehicle-button"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Veicolo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={LayoutGrid} label="Totale flotta" value={stats?.total ?? "—"} tone="slate" testid="kpi-total" />
          <Kpi icon={CheckCircle2} label="Può circolare" value={stats?.can_circulate ?? "—"} tone="green" testid="kpi-can" />
          <Kpi icon={XCircle} label="Fermo flotta" value={stats?.cannot_circulate ?? "—"} tone="red" testid="kpi-cannot" />
          <Kpi icon={PauseCircle} label="Polizze sospese" value={stats?.suspended ?? "—"} tone="blue" testid="kpi-suspended" />
          <Kpi icon={CalendarClock} label="Scad. 30 gg" value={stats?.upcoming_30 ?? "—"} tone="amber" testid="kpi-upcoming" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  filter === f.key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
                data-testid={f.testid}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca targa o modello…"
              className="pl-9"
              data-testid="search-input"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-20">Caricamento flotta…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            <Car className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nessun veicolo trovato</p>
            <p className="text-sm text-slate-400">
              {vehicles.length === 0 ? "Aggiungi il primo veicolo alla flotta." : "Modifica i filtri di ricerca."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="vehicle-grid">
            {filtered.map((v) => (
              <VehicleCard
                key={v.id}
                v={v}
                onEdit={(veh) => {
                  setEditVehicle(veh);
                  setFormOpen(true);
                }}
                onPolicy={setPolicyVehicle}
                onCollaudo={setCollaudoVehicle}
                onDelete={setDeleteVehicle}
              />
            ))}
          </div>
        )}
      </main>

      {formOpen && (
        <VehicleFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          vehicle={editVehicle}
          onSaved={load}
        />
      )}
      {policyVehicle && (
        <PolicyDialog
          open={!!policyVehicle}
          onOpenChange={(o) => !o && setPolicyVehicle(null)}
          vehicle={policyVehicle}
          onSaved={refreshPolicyView}
        />
      )}
      {collaudoVehicle && (
        <CollaudoDialog
          open={!!collaudoVehicle}
          onOpenChange={(o) => !o && setCollaudoVehicle(null)}
          vehicle={collaudoVehicle}
          onSaved={load}
        />
      )}

      <AlertDialog open={!!deleteVehicle} onOpenChange={(o) => !o && setDeleteVehicle(null)}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il veicolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <b>{deleteVehicle?.targa}</b> — {deleteVehicle?.marca_modello}.
              L'operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-button"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
