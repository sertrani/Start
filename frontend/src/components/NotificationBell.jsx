import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Receipt, Wrench, ShieldCheck, CalendarClock } from "lucide-react";
import { fmtDate } from "@/lib/format";

const TYPE_ICON = { bollo: Receipt, collaudo: Wrench, polizza: ShieldCheck, rata: CalendarClock };

function Item({ e }) {
  const Icon = TYPE_ICON[e.type] || CalendarClock;
  const overdue = e.days_left < 0;
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50" data-testid={`bell-item-${e.vehicle_id}-${e.type}`}>
      <Icon className={`h-4 w-4 shrink-0 ${overdue ? "text-red-500" : "text-amber-500"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">
          <span className="font-targa">{e.targa}</span> · {e.label}
        </p>
        <p className="text-xs text-slate-500">{fmtDate(e.date)}</p>
      </div>
      <span className={`text-[11px] font-semibold ${overdue ? "text-red-600" : "text-amber-600"}`}>
        {overdue ? `${Math.abs(e.days_left)}gg fa` : e.days_left === 0 ? "oggi" : `${e.days_left}gg`}
      </span>
    </div>
  );
}

export default function NotificationBell() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/notifications/today").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const count = data?.count || 0;
  const all = [...(data?.overdue || []), ...(data?.today || []), ...(data?.upcoming || [])];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="notification-bell">
          <Bell className="h-5 w-5 text-slate-600" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid="bell-badge">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="bell-popover">
        <div className="px-3 py-2.5 border-b border-slate-100">
          <p className="font-heading font-semibold text-slate-800 text-sm">Scadenze da attenzionare</p>
          <p className="text-xs text-slate-500">{count} scadute o in giornata · prossimi 7 giorni inclusi</p>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
          {all.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nessuna scadenza imminente 🎉</p>
          ) : (
            all.map((e, i) => <Item key={i} e={e} />)
          )}
        </div>
        <button onClick={() => navigate("/calendario")} className="w-full text-center text-sm text-blue-600 font-medium py-2.5 hover:bg-slate-50 border-t border-slate-100" data-testid="bell-view-calendar">
          Apri il calendario
        </button>
      </PopoverContent>
    </Popover>
  );
}
