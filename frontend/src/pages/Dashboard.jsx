import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/context/AuthContext";
import VehicleCard from "@/components/VehicleCard";
import FleetTable from "@/components/FleetTable";
import Timeline4Weeks from "@/components/Timeline4Weeks";
import VehicleFormDialog from "@/components/VehicleFormDialog";
import PolicyDialog from "@/components/PolicyDialog";
import CollaudoDialog from "@/components/CollaudoDialog";
import DocumentsDialog from "@/components/DocumentsDialog";
import BolloDialog from "@/components/BolloDialog";
import VehicleHistoryDialog from "@/components/VehicleHistoryDialog";
import {
  Car,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Rows3,
  Lightbulb,
} from "lucide-react";

const FILTERS = [
  { key: "all", label: "Tutti", testid: "fleet-status-filter-all" },
  { key: "can", label: "Può circolare", testid: "fleet-status-filter-can-circulate" },
  { key: "cannot", label: "Non può circolare", testid: "fleet-status-filter-cannot-circulate" },
  { key: "expired", label: "Con scadenze scadute", testid: "fleet-status-filter-expired" },
  { key: "suspended", label: "Polizze sospese", testid: "fleet-status-filter-suspended" },
  { key: "bollo", label: "Bollo scaduto", testid: "fleet-status-filter-bollo" },
];

const SORTS = [
  { key: "deadline", label: "Scadenza più vicina" },
  { key: "targa", label: "Targa (A→Z)" },
  { key: "modello", label: "Modello (A→Z)" },
  { key: "circulation", label: "Stato circolazione" },
];

function nearestDays(v) {
  const vals = [v.collaudo_days, v.insurance_days, v.bollo_days, v.policy?.rata_days].filter(
    (d) => d !== null && d !== undefined
  );
  return vals.length ? Math.min(...vals) : Infinity;
}

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
  const { hasPerm } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [opportunities, setOpportunities] = useState(0);
  const [filter, setFilter] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [vtypes, setVtypes] = useState([]);
  const [sort, setSort] = useState("deadline");
  const [view, setView] = useState("grid");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState(false);
  const [policyVehicle, setPolicyVehicle] = useState(null);
  const [collaudoVehicle, setCollaudoVehicle] = useState(null);
  const [docsVehicle, setDocsVehicle] = useState(null);
  const [bolloVehicle, setBolloVehicle] = useState(null);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [deleteVehicle, setDeleteVehicle] = useState(null);

  const load = async () => {
    try {
      const [v, s] = await Promise.all([api.get("/vehicles"), api.get("/dashboard/stats")]);
      setVehicles(v.data);
      setStats(s.data);
      return v.data;
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.get("/strategy").then((res) => setOpportunities(res.data.opportunities || 0)).catch(() => {});
    api.get("/vehicle-types").then((res) => setVtypes(res.data)).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (filter === "can") list = list.filter((v) => v.can_circulate);
    else if (filter === "cannot") list = list.filter((v) => !v.can_circulate);
    else if (filter === "expired")
      list = list.filter(
        (v) =>
          v.collaudo_state === "expired" ||
          v.bollo_state === "expired" ||
          v.insurance_state === "expired" ||
          v.policy?.rata_state === "expired"
      );
    else if (filter === "suspended") list = list.filter((v) => v.policy?.status === "suspended");
    else if (filter === "bollo") list = list.filter((v) => v.bollo_state === "expired");
    if (tipo !== "all") list = list.filter((v) => (v.tipo || "Auto") === tipo);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((v) => v.targa.toLowerCase().includes(q) || v.marca_modello.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "deadline") sorted.sort((a, b) => nearestDays(a) - nearestDays(b));
    else if (sort === "targa") sorted.sort((a, b) => a.targa.localeCompare(b.targa));
    else if (sort === "modello") sorted.sort((a, b) => a.marca_modello.localeCompare(b.marca_modello));
    else if (sort === "circulation") sorted.sort((a, b) => Number(a.can_circulate) - Number(b.can_circulate));
    return sorted;
  }, [vehicles, filter, query, sort, tipo]);

  const syncOpen = (list) => {
    const find = (cur) => (cur ? list.find((x) => x.id === cur.id) || null : null);
    setPolicyVehicle((c) => find(c));
    setDocsVehicle((c) => find(c));
    setBolloVehicle((c) => find(c));
  };
  const refresh = async () => {
    const list = await load();
    if (list) syncOpen(list);
    api.get("/strategy").then((res) => setOpportunities(res.data.opportunities || 0)).catch(() => {});
  };

  const openNew = () => {
    setEditVehicle(null);
    setDuplicateMode(false);
    setFormOpen(true);
  };
  const openEdit = (veh) => {
    setEditVehicle(veh);
    setDuplicateMode(false);
    setFormOpen(true);
  };
  const openDuplicate = (veh) => {
    setEditVehicle(veh);
    setDuplicateMode(true);
    setFormOpen(true);
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

  const cardHandlers = {
    onEdit: openEdit,
    onDuplicate: openDuplicate,
    onPolicy: setPolicyVehicle,
    onCollaudo: setCollaudoVehicle,
    onDocs: setDocsVehicle,
    onBollo: setBolloVehicle,
    onHistory: setHistoryVehicle,
    onDelete: setDeleteVehicle,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900">Flotta veicoli</h1>
          <p className="text-sm text-slate-500">
            Circolabilità in tempo reale — collaudo e polizza (il bollo non blocca la circolazione).
          </p>
        </div>
        <div className="flex gap-2">
          {opportunities > 0 && (
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => navigate("/strategia")}
              data-testid="strategy-opportunity-button"
            >
              <Lightbulb className="h-4 w-4 mr-1.5" /> {opportunities} opportunità
            </Button>
          )}
          {hasPerm("export_reports") && (
            <>
              <Button variant="outline" onClick={() => download("excel")} data-testid="export-excel-button">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
              </Button>
              <Button variant="outline" onClick={() => download("pdf")} data-testid="export-pdf-button">
                <FileText className="h-4 w-4 mr-1.5" /> PDF
              </Button>
            </>
          )}
          {hasPerm("manage_vehicles") && (
            <Button onClick={openNew} data-testid="add-vehicle-button">
              <Plus className="h-4 w-4 mr-1.5" /> Veicolo
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={LayoutGrid} label="Totale flotta" value={stats?.total ?? "—"} tone="slate" testid="kpi-total" />
        <Kpi icon={CheckCircle2} label="Può circolare" value={stats?.can_circulate ?? "—"} tone="green" testid="kpi-can" />
        <Kpi icon={XCircle} label="Fermo flotta" value={stats?.cannot_circulate ?? "—"} tone="red" testid="kpi-cannot" />
        <Kpi icon={PauseCircle} label="Polizze sospese" value={stats?.suspended ?? "—"} tone="blue" testid="kpi-suspended" />
        <Kpi icon={CalendarClock} label="Scad. 30 gg" value={stats?.upcoming_30 ?? "—"} tone="amber" testid="kpi-upcoming" />
      </div>

      <Timeline4Weeks />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.filter((f) => f.key !== "bollo" || hasPerm("view_bollo")).map((f) => (
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
        <div className="flex gap-2 items-center">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-[150px]" data-testid="fleet-tipo-select"><SelectValue placeholder="Tipologia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le tipologie</SelectItem>
              {vtypes.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[190px]" data-testid="fleet-sort-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-2 ${view === "grid" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
              title="Griglia"
              data-testid="fleet-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2.5 py-2 ${view === "table" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
              title="Tabella"
              data-testid="fleet-view-table"
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
          <div className="relative sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca targa o modello…" className="pl-9" data-testid="search-input" />
          </div>
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
      ) : view === "table" ? (
        <FleetTable vehicles={filtered} {...cardHandlers} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="vehicle-grid">
          {filtered.map((v) => (
            <VehicleCard key={v.id} v={v} {...cardHandlers} />
          ))}
        </div>
      )}

      {formOpen && (
        <VehicleFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          vehicle={editVehicle}
          duplicate={duplicateMode}
          onSaved={load}
        />
      )}
      {policyVehicle && (
        <PolicyDialog open={!!policyVehicle} onOpenChange={(o) => !o && setPolicyVehicle(null)} vehicle={policyVehicle} onSaved={refresh} />
      )}
      {collaudoVehicle && (
        <CollaudoDialog open={!!collaudoVehicle} onOpenChange={(o) => !o && setCollaudoVehicle(null)} vehicle={collaudoVehicle} onSaved={load} />
      )}
      {docsVehicle && (
        <DocumentsDialog open={!!docsVehicle} onOpenChange={(o) => !o && setDocsVehicle(null)} vehicle={docsVehicle} onSaved={refresh} />
      )}
      {bolloVehicle && (
        <BolloDialog open={!!bolloVehicle} onOpenChange={(o) => !o && setBolloVehicle(null)} vehicle={bolloVehicle} onSaved={refresh} />
      )}
      {historyVehicle && (
        <VehicleHistoryDialog open={!!historyVehicle} onOpenChange={(o) => !o && setHistoryVehicle(null)} vehicle={historyVehicle} />
      )}

      <AlertDialog open={!!deleteVehicle} onOpenChange={(o) => !o && setDeleteVehicle(null)}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il veicolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <b>{deleteVehicle?.targa}</b> — {deleteVehicle?.marca_modello}. L'operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-button">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
