import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";
import AuthImage from "@/components/AuthImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Mail, Building2, ImageUp, Send, Bell } from "lucide-react";

export default function Settings() {
  const { settings, reload } = useSettings();
  const [company, setCompany] = useState("");
  const [days, setDays] = useState(30);
  const [recipients, setRecipients] = useState([""]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (settings) {
      setCompany(settings.company_name || "");
      setDays(settings.notification_days_before || 30);
      setRecipients(settings.notification_recipients?.length ? settings.notification_recipients : [""]);
    }
  }, [settings]);

  useEffect(() => {
    api
      .get("/notifications/preview")
      .then((res) => setPreview(res.data))
      .catch(() => {});
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
        notification_days_before: Number(days),
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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-slate-900">Impostazioni</h1>
        <p className="text-sm text-slate-500">Personalizza il gestionale, il logo e gli avvisi email.</p>
      </div>

      {/* Branding */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800">
          <Building2 className="h-4 w-4 text-blue-600" /> Azienda e logo
        </h2>
        <div className="flex items-center gap-4">
          {settings?.logo_path ? (
            <AuthImage path={settings.logo_path} alt="logo" className="h-16 w-16 rounded-xl object-cover border border-slate-200" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
              <ImageUp className="h-6 w-6" />
            </div>
          )}
          <div>
            <input id="logo" type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={uploadLogo} data-testid="logo-file-input" />
            <Button variant="outline" onClick={() => document.getElementById("logo").click()} disabled={uploading} data-testid="logo-upload-button">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ImageUp className="h-4 w-4 mr-1.5" />}
              Carica logo
            </Button>
            <p className="text-xs text-slate-400 mt-1">Appare nell'intestazione e nei report. PNG/JPG/WEBP.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nome azienda</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Autonoleggio Rossi S.r.l." data-testid="company-name-input" />
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-slate-800">
          <Bell className="h-4 w-4 text-blue-600" /> Avvisi email scadenze
        </h2>
        <div className="space-y-1.5">
          <Label>Anticipo avviso (giorni)</Label>
          <Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} className="w-32" data-testid="notif-days-input" />
        </div>
        <div className="space-y-2">
          <Label>Destinatari email</Label>
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input type="email" value={r} onChange={(e) => setRecipient(i, e.target.value)} placeholder="email@azienda.it" className="pl-9" data-testid={`recipient-input-${i}`} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:bg-red-50"
                onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))}
                data-testid={`recipient-remove-${i}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRecipients([...recipients, ""])} data-testid="recipient-add">
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi destinatario
          </Button>
        </div>
        {preview && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <b className="text-slate-800">{preview.count}</b> scadenze rientrano nell'avviso corrente.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={sendNow} disabled={sending} data-testid="send-now-button">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Invia riepilogo ora
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Un riepilogo automatico viene inviato ogni mattina alle 07:00 ai destinatari configurati.
        </p>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="px-8" data-testid="settings-save-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva impostazioni"}
        </Button>
      </div>
    </div>
  );
}
