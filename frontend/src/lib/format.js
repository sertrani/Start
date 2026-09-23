export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function eur(v) {
  if (v == null || v === "") return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

export const POLICY_LABELS = {
  annuale: "Annuale",
  quadrimestrale: "Quadrimestrale",
  trimestrale: "Trimestrale",
  mensile: "Mensile",
  a_data_fissa: "A data fissa",
};

export const FRAZIONAMENTO_LABELS = {
  unica: "Premio unico",
  semestrale: "Semestrale",
  quadrimestrale: "Quadrimestrale",
  trimestrale: "Trimestrale",
  mensile: "Mensile",
};

export const TIPO_LABELS = {
  auto: "Auto",
  Auto: "Auto",
  scooter: "Scooter",
  Scooter: "Scooter",
  furgone: "Furgone / Commerciale",
  altro: "Altro",
  Altro: "Altro",
};

export const DOC_LABELS = {
  libretto: "Libretto",
  carta_circolazione: "Carta di circolazione",
  polizza: "Polizza",
  altro: "Altro",
};

export const ACTION_LABELS = {
  vehicle_create: "Creazione veicolo",
  vehicle_update: "Modifica veicolo",
  vehicle_delete: "Eliminazione veicolo",
  bollo_add: "Pagamento bollo",
  bollo_delete: "Eliminazione bollo",
  collaudo_add: "Collaudo eseguito",
  collaudo_delete: "Eliminazione collaudo",
  policy_set: "Polizza salvata",
  policy_renew: "Rinnovo / nuova polizza",
  policy_suspend: "Sospensione copertura",
  policy_reactivate: "Riattivazione copertura",
  undo: "Annullamento operazione",
};

export function stateBadge(state) {
  switch (state) {
    case "valid":
      return { label: "Regolare", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "upcoming":
      return { label: "In scadenza", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
    case "grace":
      return { label: "In comporto", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    case "expired":
      return { label: "Scaduto", cls: "bg-red-50 text-red-700 border-red-200" };
    case "suspended":
      return { label: "Sospesa", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "paid":
      return { label: "Pagata", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "unpaid":
      return { label: "Da pagare", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    default:
      return { label: "N/D", cls: "bg-slate-100 text-slate-500 border-slate-200" };
  }
}

export function stateCell(state) {
  switch (state) {
    case "valid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "upcoming":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "grace":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "expired":
      return "bg-red-100 text-red-800 border-red-200";
    case "suspended":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "unpaid":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-slate-50 text-slate-400 border-slate-200";
  }
}
