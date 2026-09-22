import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import AuthImage from "@/components/AuthImage";
import { Button } from "@/components/ui/button";
import { Car, LogOut, LayoutGrid, CalendarDays, Grid3x3, Settings as SettingsIcon, ScrollText } from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const company = settings?.company_name || "FleetCare";

  const NAV = [
    { to: "/", label: "Flotta", icon: LayoutGrid, end: true, testid: "nav-flotta" },
    { to: "/calendario", label: "Calendario", icon: CalendarDays, testid: "nav-calendario" },
    { to: "/monitor", label: "Monitor", icon: Grid3x3, testid: "nav-monitor" },
    { to: "/storico", label: "Storico", icon: ScrollText, testid: "nav-storico" },
    { to: "/impostazioni", label: "Impostazioni", icon: SettingsIcon, testid: "nav-impostazioni" },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {settings?.logo_path ? (
              <AuthImage path={settings.logo_path} alt="logo" className="h-9 w-9 rounded-lg object-cover border border-slate-200"
                fallback={<div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white"><Car className="h-5 w-5" /></div>} />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white"><Car className="h-5 w-5" /></div>
            )}
            <div className="min-w-0">
              <p className="font-heading text-base font-extrabold text-slate-900 leading-none truncate">{company}</p>
              <p className="text-[11px] text-slate-500">Gestione Scadenze Flotta</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-sm text-slate-500 mr-1">{user?.name || user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => logout().then(() => navigate("/login"))} data-testid="logout-button">
              <LogOut className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Esci</span>
            </Button>
          </div>
        </div>
        <nav className="px-2 sm:px-4 flex gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
              <n.icon className="h-4 w-4" />{n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
