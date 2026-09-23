import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import AuthImage from "@/components/AuthImage";
import UsersManager from "@/components/UsersManager";
import LoginLog from "@/components/LoginLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Mail, Building2, ImageUp, Send, Bell, CalendarRange } from "lucide-react";

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function Settings() {
  const { settings, reload } = useSettings();
  const { hasPerm } = useAuth();
  const canSettings = hasPerm("manage_settings");
  const [company, setCompany] = useState("");
  const [days, setDays] = useState({ bollo: 30, collaudo: 30, polizza: 30 });
  const [bellDays, setBellDays] = useState(7);
  const [seasonStart, setSeasonStart] = useState(4);
  const [seasonEnd, setSeasonEnd] = useState(10);
  const [recipients, setRecipients] = useState([""]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (settings) {
      setCompany(settings.company_name || "");
      setDays(settings.notification_days || { bollo: 30, collaudo: 30, polizza: 30 });
      setBellDays(settings.bell_days ?? 7);
      setSeasonStart(settings.season_start_month ?? 4);
      setSeasonEnd(settings.season_end_month ?? 10);
      setRecipients(settings.notification_recipients?.length ? settings.notification_recipients : [""]);
    }
  }, [settings]);

  useEffect(() => {
    api.get("/notifications/preview").then((res) => setPreview(res.data)).catch(() => {});
  }, [settings]);

  const setRecipient = (i, val) => {
    const next = [...recipients];
    next[i] = val;
    setRecipients(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", {
        company_name: company,
        notification_days: { bollo: Number(days.bollo), collaudo: Number(days.collaudo), polizza: Number(days.polizza) },
        bell_days: Number(bellDays),
        season_start_month: Number(seasonStart),
        season_end_month: Number(seasonEnd),
        notification_recipients: recipients.filter((r) => r.trim()),
      });
      toast.success("Impostazioni salvate");
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Logo aggiornato");
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await api.post("/notifications/send-now");
      if (res.data.sent > 0) toast.success(`Email inviata a ${res.data.sent} destinatario/i (${res.data.items} scadenze)`);
      else toast.warning(res.data.reason || "Nessun destinatario configurato");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const REM = [["bollo", "Bollo"], ["collaudo", "Collaudo"], ["polizza", "Polizza / Rata"]];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-slate-900">Impostazioni</h1>
        <p className="text-sm text-slate-500">Personalizza il gestionale, il logo, gli avvisi e gli utenti.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800"><Building2 className="h-4 w-4 text-blue-600" /> Azienda e logo</h2>
        <div className="flex items-center gap-4">
          {settings?.logo_path ? (
            <AuthImage path={settings.logo_path} alt="logo" className="h-16 w-16 rounded-xl object-cover border border-slate-200" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400"><ImageUp className="h-6 w-6" /></div>
          )}
          <div>
            <input id="logo" type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={uploadLogo} disabled={!canSettings} data-testid="logo-file-input" />
            <Button variant="outline" onClick={() => document.getElementById("logo").click()} disabled={uploading || !canSettings} data-testid="logo-upload-button">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ImageUp className="h-4 w-4 mr-1.5" />} Carica logo
            </Button>
            <p className="text-xs text-slate-400 mt-1">Appare nell'intestazione e nei report.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nome azienda</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} disabled={!canSettings} placeholder="Autonoleggio Rossi S.r.l." data-testid="company-name-input" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800"><Bell className="h-4 w-4 text-blue-600" /> Avvisi email scadenze</h2>
        <div>
          <Label className="mb-2 block">Giorni di anticipo per tipo</Label>
          <div className="grid grid-cols-3 gap-3">
            {REM.map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label className="text-xs text-slate-500">{l}</Label>
                <Input type="number" min="1" value={days[k]} onChange={(e) => setDays({ ...days, [k]: e.target.value })} disabled={!canSettings} data-testid={`notif-days-${k}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Destinatari email</Label>
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input type="email" value={r} onChange={(e) => setRecipient(i, e.target.value)} disabled={!canSettings} placeholder="email@azienda.it" className="pl-9" data-testid={`recipient-input-${i}`} />
              </div>
              <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" disabled={!canSettings} onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))} data-testid={`recipient-remove-${i}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={!canSettings} onClick={() => setRecipients([...recipients, ""])} data-testid="recipient-add">
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi destinatario
          </Button>
        </div>
        {preview && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <b className="text-slate-800">{preview.count}</b> scadenze rientrano negli avvisi correnti.
          </p>
        )}
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs">Giorni da mostrare nel campanello 🔔</Label>
          <Input type="number" min="0" value={bellDays} onChange={(e) => setBellDays(e.target.value)} disabled={!canSettings} data-testid="bell-days-input" />
          <p className="text-xs text-slate-400">Le scadenze entro questi giorni (più quelle scadute) appaiono nel campanello in alto.</p>
        </div>
        {canSettings && (
          <Button variant="outline" onClick={sendNow} disabled={sending} data-testid="send-now-button">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />} Invia riepilogo ora
          </Button>
        )}
        <p className="text-xs text-slate-400">Riepilogo automatico ogni mattina alle 07:00 ai destinatari configurati.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800"><CalendarRange className="h-4 w-4 text-blue-600" /> Stagione operativa</h2>
        <p className="text-sm text-slate-500">Definisce i mesi di apertura dell'attività. La pagina Strategia usa questi mesi per consigliare quando sospendere i veicoli (picco luglio–agosto).</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Mese di apertura</Label>
            <Select value={String(seasonStart)} onValueChange={(v) => setSeasonStart(Number(v))} disabled={!canSettings}>
              <SelectTrigger data-testid="season-start-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Mese di chiusura</Label>
            <Select value={String(seasonEnd)} onValueChange={(v) => setSeasonEnd(Number(v))} disabled={!canSettings}>
              <SelectTrigger data-testid="season-end-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {canSettings && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="px-8" data-testid="settings-save-button">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva impostazioni"}
          </Button>
        </div>
      )}

      {hasPerm("manage_users") && <UsersManager />}
      {hasPerm("manage_users") && <LoginLog />}
    </div>
  );
}
