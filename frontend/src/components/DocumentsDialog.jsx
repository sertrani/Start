import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { fmtDate, DOC_LABELS } from "@/lib/format";
import { FileText, Image as ImageIcon, Trash2, Upload, Loader2, Eye } from "lucide-react";

export default function DocumentsDialog({ open, onOpenChange, vehicle, onSaved }) {
  const [docType, setDocType] = useState("libretto");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const docs = vehicle?.documents || [];

  const upload = async () => {
    if (!file) return toast.error("Seleziona un file");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("doc_type", docType);
      fd.append("file", file);
      await api.post(`/vehicles/${vehicle.id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Documento caricato");
      setFile(null);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const view = async (d) => {
    try {
      const res = await api.get(`/files/${d.storage_path}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async (d) => {
    try {
      await api.delete(`/vehicles/${vehicle.id}/documents/${d.id}`);
      toast.success("Documento eliminato");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="documents-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Documenti — <span className="font-targa">{vehicle?.targa}</span>
          </DialogTitle>
          <DialogDescription>Carica libretto, carta di circolazione e polizza (PDF o immagini).</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="flex-1 space-y-1.5 w-full">
            <Label>Tipo documento</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger data-testid="document-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5 w-full">
            <Label>File</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              data-testid="document-file-input"
            />
          </div>
          <Button onClick={upload} disabled={loading} data-testid="document-upload-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-2 space-y-2">
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nessun documento caricato.</p>
          ) : (
            docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2"
                data-testid={`document-item-${d.id}`}
              >
                {d.content_type === "application/pdf" ? (
                  <FileText className="h-5 w-5 text-red-500 shrink-0" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{d.original_filename}</p>
                  <p className="text-xs text-slate-500">
                    {DOC_LABELS[d.doc_type] || d.doc_type} · {fmtDate(d.created_at)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => view(d)} data-testid={`document-view-${d.id}`}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => remove(d)}
                  data-testid={`document-delete-${d.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
