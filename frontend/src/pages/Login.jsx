import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, ShieldCheck, Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-25 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1772461355574-3fcd84c6016b?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200')",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center">
            <Car className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-xl font-extrabold tracking-tight">FleetCare</p>
            <p className="text-xs text-slate-400">Gestione Scadenze Flotta</p>
          </div>
        </div>
        <div className="relative z-10 space-y-4 max-w-md">
          <h1 className="font-heading text-4xl font-extrabold leading-tight">
            Tieni sotto controllo bollo, collaudo e polizze.
          </h1>
          <p className="text-slate-300">
            Un colpo d'occhio ti dice quali veicoli possono circolare e quali no. Sospensioni polizza
            calcolate automaticamente fino al limite di 10 mesi.
          </p>
          <div className="flex items-center gap-2 text-emerald-300 text-sm pt-2">
            <ShieldCheck className="h-4 w-4" /> Report esportabili in Excel e PDF
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-500">© 2026 FleetCare Autonoleggio</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Car className="h-5 w-5" />
            </div>
            <p className="font-heading text-lg font-extrabold">FleetCare</p>
          </div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Accedi al gestionale</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">Inserisci le tue credenziali per continuare.</p>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@azienda.it"
                required
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="login-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11 text-base"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accedi"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
