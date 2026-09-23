import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtDate } from "@/lib/format";
import { Receipt, Wrench, ShieldCheck, CalendarClock, ClipboardCheck, CalendarRange } from "lucide-react";

const ICONS = { bollo: Receipt, collaudo: Wrench, polizza: ShieldCheck, rata: CalendarClock, manutenzione: ClipboardCheck };

const GROUPS = [
  { key: "overdue", label: "Scadute", test: (d) => d < 0, cls: "border-red-200 bg-red-50 text-red-700" },
  { key: "w1", label: "Entro 7 giorni", test: (d) => d >= 0 && d <= 7, cls: "border-amber-200 bg-amber-50 text-amber-800" },
  { key: "w2", label: "8 – 14 giorni", test: (d) => d >= 8 && d <= 14, cls: "border-blue-200 bg-blue-50 text-blue-700" },
  { key: "w34", label: "15 – 28 giorni", test: (d) => d >= 15 && d <= 28, cls: "border-slate-200 bg-slate-50 text-slate-600" },
];

export default function Timeline4Weeks() {
  const { hasPerm } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/timeline?days=28")
      .then((res) => setEvents(res.data.events || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showBollo = hasPerm("view_bollo");
  const filtered = events.filter((e) => showBollo || e.type !== "bollo");

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="timeline-4-weeks">
      <div className="flex items-center gap-2 mb-4">
        <CalendarRange className="h-5 w-5 text-blue-600" />
        <h2 className="font-heading font-semibold text-slate-800">Prossime 4 settimane</h2>
        <span className="text-xs text-slate-400">bollo, collaudo, polizza e controlli in un'unica vista</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Nessuna scadenza nelle prossime 4 settimane.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {GROUPS.map((g) => {
            const items = filtered.filter((e) => g.test(e.days_left));
            return (
              <div key={g.key} className={`rounded-xl border p-3 ${g.cls}`} data-testid={`timeline-group-${g.key}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide">{g.label}</p>
                  <span className="text-xs font-bold">{items.length}</span>
                </div>
                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-[11px] opacity-60">—</p>
                  ) : items.map((e, i) => {
                    const Icon = ICONS[e.type] || CalendarClock;
                    return (
                      <div key={i} className="flex items-center gap-2 bg-white/70 rounded-md px-2 py-1.5" data-testid={`timeline-event-${e.type}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate">
                            <span className="font-targa">{e.targa}</span> · {e.label}
                          </p>
                          <p className="text-[10px] text-slate-500">{fmtDate(e.date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
