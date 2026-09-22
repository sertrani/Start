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

function cellData(v, key) {
  switch (key) {
    case "bollo":
      return { state: v.bollo_state, date: v.bollo_scadenza };
    case "collaudo":
      return { state: v.collaudo_state, date: v.collaudo_deadline };
    case "rata":
      return { state: v.policy?.rata_state || "none", date: v.policy?.scadenza_rata_intermedia };
    case "polizza":
      return { state: v.policy ? v.insurance_state : "none", date: v.policy?.scadenza_contratto };
    default:
      return { state: "none", date: null };
  }
}

export default function Monitor() {
  const [vehicles, setVehicles] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/vehicles")
      .then((res) => setVehicles(res.data))
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

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
          <p className="text-sm text-slate-500">Visione completa: ogni scadenza per veicolo, colorata per stato.</p>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca targa o modello…" className="pl-9" data-testid="monitor-search" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {[
          ["Regolare", "bg-emerald-100 text-emerald-800 border-emerald-200"],
          ["In scadenza", "bg-yellow-100 text-yellow-800 border-yellow-200"],
          ["In comporto", "bg-orange-100 text-orange-800 border-orange-200"],
          ["Scaduto", "bg-red-100 text-red-800 border-red-200"],
          ["Sospesa", "bg-blue-100 text-blue-800 border-blue-200"],
        ].map(([l, cls]) => (
          <span key={l} className={`px-2 py-0.5 rounded border ${cls}`}>
            {l}
          </span>
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
                {COLS.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-semibold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0" data-testid={`monitor-row-${v.id.slice(0, 8)}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-targa text-xs font-bold uppercase bg-amber-300/30 border border-amber-400/50 px-1.5 py-0.5 rounded">
                      {v.targa}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{v.marca_modello}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {v.can_circulate ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 inline" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 inline" />
                    )}
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
