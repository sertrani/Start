export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const POLICY_LABELS = {
  annuale: "Annuale",
  semestrale: "Semestrale",
  quadrimestrale: "Quadrimestrale",
  trimestrale: "Trimestrale",
  mensile: "Mensile",
  a_data_fissa: "A data fissa",
};

export function stateBadge(state) {
  switch (state) {
    case "valid":
      return { label: "Regolare", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "upcoming":
      return { label: "In scadenza", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
    case "expired":
      return { label: "Scaduto", cls: "bg-red-50 text-red-700 border-red-200" };
    case "suspended":
      return { label: "Sospesa", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    default:
      return { label: "N/D", cls: "bg-slate-100 text-slate-500 border-slate-200" };
  }
}
