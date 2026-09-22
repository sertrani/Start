import { useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { stateBadge } from "@/lib/format";
import { ChevronLeft, ChevronRight, Receipt, Wrench, ShieldCheck, CalendarClock } from "lucide-react";

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const TYPE_ICON = { bollo: Receipt, collaudo: Wrench, polizza: ShieldCheck, rata: CalendarClock };
const DOT = { valid: "bg-emerald-500", upcoming: "bg-yellow-500", grace: "bg-orange-500", expired: "bg-red-500", suspended: "bg-blue-500", none: "bg-slate-400" };

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  useEffect(() => {
    api
      .get("/deadlines")
      .then((res) => setEvents(res.data))
      .catch((e) => toast.error(apiErrorMessage(e)));
  }, []);

  const byDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      const d = e.date?.slice(0, 10);
      if (!d) continue;
      const [y, m] = d.split("-").map(Number);
      if (y === cursor.y && m - 1 === cursor.m) {
        const day = Number(d.slice(8, 10));
        (map[day] = map[day] || []).push(e);
      }
    }
    return map;
  }, [events, cursor]);

  const firstDay = new Date(cursor.y, cursor.m, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const move = (delta) => {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setCursor({ y, m });
  };

  const monthEvents = Object.values(byDay).flat().length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900">Calendario scadenze</h1>
          <p className="text-sm text-slate-500">{monthEvents} scadenze in {MONTHS[cursor.m]} {cursor.y}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)} data-testid="calendar-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-heading font-semibold text-slate-800 w-40 text-center" data-testid="calendar-label">
            {MONTHS[cursor.m]} {cursor.y}
          </span>
          <Button variant="outline" size="icon" onClick={() => move(1)} data-testid="calendar-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="calendar-grid">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-xs font-semibold text-slate-500 text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div key={i} className="min-h-[92px] border-b border-r border-slate-100 p-1.5 last:border-r-0">
              {d && (
                <>
                  <div className="text-xs font-medium text-slate-500 mb-1">{d}</div>
                  <div className="space-y-1">
                    {(byDay[d] || []).map((e, idx) => {
                      const Icon = TYPE_ICON[e.type] || CalendarClock;
                      const b = stateBadge(e.state);
                      return (
                        <div
                          key={idx}
                          title={`${e.targa} · ${e.label}`}
                          className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}
                          data-testid={`calendar-event-${e.vehicle_id}-${e.type}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${DOT[e.state] || DOT.none}`} />
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="font-targa font-bold truncate">{e.targa}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {[
          ["Bollo", Receipt],
          ["Collaudo", Wrench],
          ["Polizza", ShieldCheck],
          ["Rata", CalendarClock],
        ].map(([l, Icon]) => (
          <span key={l} className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-slate-400" /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}
