import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LoginLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/login-log", { params: { limit: 100 } })
      .then((r) => setLogs(r.data))
      .catch((e) => toast.error(apiErrorMessage(e)));
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4" data-testid="login-log-section">
      <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800">
        <LogIn className="h-4 w-4 text-blue-600" /> Log accessi
      </h2>
      {logs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Nessun accesso registrato.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 py-2" data-testid={`login-log-${l.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {l.name || l.email}
                  {l.role === "admin" && <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 rounded">ADMIN</span>}
                </p>
                <p className="text-xs text-slate-500">{l.email}{l.ip ? ` · ${l.ip}` : ""}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{fmtDateTime(l.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
