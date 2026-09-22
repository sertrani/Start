import { useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { fmtDate, stateCell } from "@/lib/format";
import { Search, CheckCircle2, XCircle } from "lucide-react";

const COLS = [
  { key: "bollo", label: "Bollo" },
  { key: "collaudo", label: "Collaudo" },
  { key: "rata", label: "Rata polizza" },
  { key: "polizza", label: "Contratto polizza" },
];
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function cellData(v, key) {
  switch (key) {
    case "bollo": return { state: v.bollo_state, date: v.bollo_scadenza };
    case "collaudo": return { state: v.collaudo_state, date: v.collaudo_deadline };
    case "rata": return { state: v.policy?.rata_state || "none", date: v.policy?.scadenza_rata_intermedia };
    case "polizza": return { state: v.policy ? v.insurance_state : "none", date: v.policy?.scadenza_contratto };
    default: return { state: "none", date: null };
  }
}

function Donut({ can, cannot }) {
  const total = can + cannot || 1;
  const frac = can / total;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-5">
      <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
        <circle cx="65" cy="65" r={R} fill="none" stroke="#fecaca" strokeWidth="18" />
        <circle cx="65" cy="65" r={R} fill="none" stroke="#10b981" strokeWidth="18"
          strokeDasharray={`${C * frac} ${C}`} strokeLinecap="round" />
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Può circolare <b className="ml-auto">{can}</b></div>
        <div className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full bg-red-300" /> Fermo flotta <b className="ml-auto">{cannot}</b></div>
        <p className="text-2xl font-heading font-extrabold text-slate-900 pt-1">{Math.round(frac * 100)}%<span className="text-sm font-medium text-slate-400"> circolabili</span></p>
      </div>
    </div>
  );
}

export default function Monitor() {
  const [vehicles, setVehicles] = useState([]);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/vehicles"), api.get("/deadlines")])
      .then(([v, e]) => { setVehicles(v.data); setEvents(e.data); })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const can = vehicles.filter((v) => v.can_circulate).length;
  const cannot = vehicles.length - can;

  const monthBars = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({ y: d.getFullYear(), m: d.getMonth(), count: 0 });
    }
    for (const e of events) {
      const d = e.date?.slice(0, 10);
      if (!d) continue;
      const [y, m] = d.split("-").map(Number);
      const b = buckets.find((x) => x.y === y && x.m === m - 1);
      if (b) b.count++;
    }
    return buckets;
  }, [events]);
  const maxCount = Math.max(1, ...monthBars.map((b) => b.count));

  const filtered = useMemo(() => {
    if (!query.trim()) return vehicles;
    const q = query.toLowerCase();
    return vehicles.filter((v) => v.targa.toLowerCase().includes(q) || v.marca_modello.toLowerCase().includes(q));
  }, [vehicles, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900">Monitor flotta</h1>
          <p className="text-sm text-slate-500">Visione completa: grafici riepilogativi e stato di ogni scadenza.</p>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca targa o modello…" className="pl-9" data-testid="monitor-search" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="chart-circulation">
          <h2 className="font-heading font-semibold text-slate-800 mb-4">Circolabilità</h2>
          <Donut can={can} cannot={cannot} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="chart-deadlines">
          <h2 className="font-heading font-semibold text-slate-800 mb-4">Scadenze prossimi 6 mesi</h2>
          <div className="flex items-end justify-between gap-2 h-40">
            {monthBars.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">{b.count}</span>
                <div className="w-full bg-blue-100 rounded-t-md relative" style={{ height: `${(b.count / maxCount) * 100}%`, minHeight: b.count ? "6px" : "2px" }}>
                  <div className="absolute inset-0 bg-blue-600 rounded-t-md" />
                </div>
                <span className="text-[11px] text-slate-500">{MONTHS[b.m]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {[["Regolare", "bg-emerald-100 text-emerald-800 border-emerald-200"], ["In scadenza", "bg-yellow-100 text-yellow-800 border-yellow-200"],
          ["In comporto", "bg-orange-100 text-orange-800 border-orange-200"], ["Scaduto", "bg-red-100 text-red-800 border-red-200"],
          ["Sospesa", "bg-blue-100 text-blue-800 border-blue-200"]].map(([l, cls]) => (
          <span key={l} className={`px-2 py-0.5 rounded border ${cls}`}>{l}</span>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto" data-testid="monitor-table">
        {loading ? (
          <p className="text-center text-slate-400 py-16">Caricamento…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 py-16">Nessun veicolo.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-900 text-white text-left">
                <th className="px-4 py-3 font-semibold">Veicolo</th>
                <th className="px-4 py-3 font-semibold text-center">Circolazione</th>
                {COLS.map((c) => <th key={c.key} className="px-4 py-3 font-semibold">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0" data-testid={`monitor-row-${v.id.slice(0, 8)}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-targa text-xs font-bold uppercase bg-amber-300/30 border border-amber-400/50 px-1.5 py-0.5 rounded">{v.targa}</span>
                    <p className="text-xs text-slate-500 mt-1">{v.marca_modello}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {v.can_circulate ? <CheckCircle2 className="h-5 w-5 text-emerald-600 inline" /> : <XCircle className="h-5 w-5 text-red-500 inline" />}
                  </td>
                  {COLS.map((c) => {
                    const { state, date } = cellData(v, c.key);
                    return (
                      <td key={c.key} className="px-2 py-2.5">
                        <div className={`rounded-md border px-2 py-1.5 text-center ${stateCell(state)}`}>
                          <p className="text-xs font-medium">{date ? fmtDate(date) : "—"}</p>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
