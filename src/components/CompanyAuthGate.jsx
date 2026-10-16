import { useState } from "react";
import { Camera, ChefHat } from "lucide-react";
import { isSupabaseConfigured, supabase, LS_COMPANY_ID } from "../lib/supabaseClient";
import { useTeresitaSupabase } from "../context/TeresitaSupabaseContext";
import {
  ensureCompanyProfile,
  setupManagerPin,
  signInCompany,
  signUpCompany
} from "../services/teresitaSupabase";
import { savePendingBranding } from "../utils/restaurantBranding";

async function hardSignOutAndReload() {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch {}
  try {
    localStorage.removeItem(LS_COMPANY_ID);
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  window.location.reload();
}

function SixDigitPinInput({ value, onChange, label, id }) {
  return (
    <label className="block text-xs font-semibold text-coffee" htmlFor={id}>
      {label}
      <input
        id={id}
        type="password"
        inputMode="numeric"
        maxLength={6}
        pattern="\d{6}"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.3em]"
        placeholder="••••••"
        autoComplete="off"
      />
    </label>
  );
}

function CompanyLoginScreen({ onDone }) {
  const [mode, setMode] = useState("signin");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [brandImage, setBrandImage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!companyName.trim()) {
          setError("Nombre de la empresa es obligatorio.");
          return;
        }
        if (!email.trim() || !password) {
          setError("Correo y contraseña son obligatorios.");
          return;
        }
        if (password.length < 6) {
          setError("La contraseña debe tener al menos 6 caracteres.");
          return;
        }
        await signUpCompany({
          email: email.trim(),
          password,
          companyName: companyName.trim(),
          fullName: fullName.trim() || companyName.trim()
        });
        if (brandImage) {
          savePendingBranding({ image: brandImage });
        }
      } else {
        if (!email.trim() || !password) {
          setError("Correo y contraseña son obligatorios.");
          return;
        }
        await signInCompany({ email: email.trim(), password });
      }
      onDone();
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[78vh] max-w-5xl items-center gap-8 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden overflow-hidden rounded-[2rem] bg-coffee p-8 text-white shadow-bento lg:block">
        <div className="mb-16 flex items-center gap-2 text-peruMustard">
          <ChefHat size={28} aria-hidden />
          <span className="text-sm font-bold uppercase tracking-[0.2em]">Teresita para restaurantes</span>
        </div>
        <p className="max-w-md text-4xl font-black leading-tight">
          La operación de tu restaurante, con tu propio nombre y esencia.
        </p>
        <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">
          Crea un espacio para tu equipo, organiza turnos y deja que cada sede trabaje con una identidad propia.
        </p>
        <div className="mt-12 grid grid-cols-3 gap-3 text-xs text-white/70">
          <div className="border-l border-peruMustard/60 pl-3">Personal</div>
          <div className="border-l border-peruMustard/60 pl-3">Turnos</div>
          <div className="border-l border-peruMustard/60 pl-3">Comandas</div>
        </div>
      </section>
      <div className="rounded-3xl border border-peruRed/20 bg-white p-6 shadow-bento md:p-8">
        <div className="mb-4 flex items-center gap-2 text-peruRed lg:hidden">
          <ChefHat size={28} aria-hidden />
          <h1 className="text-xl font-bold">Teresita para restaurantes</h1>
        </div>
        <p className="mb-4 text-sm text-coffee/75">
          <strong>Crear restaurante</strong> abre un espacio independiente para tu equipo. Puedes añadir su nombre y una imagen de marca.
        </p>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              mode === "signin" ? "bg-peruRed text-white" : "bg-bone text-coffee"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              mode === "signup" ? "bg-peruRed text-white" : "bg-bone text-coffee"
            }`}
          >
            Crear empresa
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" ? (
            <>
              <label className="block text-xs font-semibold text-coffee">
                Nombre de la empresa
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block text-xs font-semibold text-coffee">
                Tu nombre (opcional)
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-coffee">
                Imagen del restaurante (opcional)
                <span className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-peruRed/30 bg-bone/50 p-3">
                  {brandImage ? (
                    <img src={brandImage} alt="Vista previa del restaurante" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-peruRed/10 text-peruRed">
                      <Camera size={20} aria-hidden />
                    </span>
                  )}
                  <span className="text-xs font-normal text-coffee/70">Sube una foto, logo o fachada</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setError("La imagen debe pesar menos de 2 MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setBrandImage(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                  />
                </span>
              </label>
            </>
          ) : null}
          <label className="block text-xs font-semibold text-coffee">
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              required
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-semibold text-coffee">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-peruRed py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Espere…" : mode === "signup" ? "Registrar empresa" : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProfileLinkScreen({ onDone }) {
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function linkAccount(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await ensureCompanyProfile(companyName.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err.message || "No se pudo vincular la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-3xl border border-peruRed/20 bg-white p-6 shadow-bento">
        <h2 className="text-lg font-bold text-peruRed">Vincular tu cuenta</h2>
        <p className="mt-2 text-sm text-coffee/75">
          Tu correo ya está en el sistema, pero falta el registro de empresa (pasa si creaste la cuenta antes de
          ejecutar el SQL). Pulsa el botón para crearlo.
        </p>
        <form onSubmit={linkAccount} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-coffee">
            Nombre de la empresa (opcional)
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              placeholder="Teresita"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-peruRed py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Vinculando…" : "Vincular mi cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ManagerPinSetupScreen({ onDone }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { setManagerPinReady } = useTeresitaSupabase();

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pin.length !== 6 || pin2.length !== 6) {
      setError("El PIN de gerente debe tener exactamente 6 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setError("Los PIN no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await ensureCompanyProfile();
      await setupManagerPin(pin);
      setManagerPinReady(true);
      onDone();
    } catch (err) {
      setError(err.message || "No se pudo guardar el PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-3xl border border-peruMustard/40 bg-white p-6 shadow-bento">
        <h2 className="text-lg font-bold text-peruRed">Crea tu PIN de gerente</h2>
        <p className="mt-2 text-sm text-coffee/75">
          Dueño y gerencia usarán este <strong>PIN de 6 dígitos</strong> cada vez que den de alta a un trabajador.
          Guárdalo en un lugar seguro.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <SixDigitPinInput id="mgr-pin" label="PIN de gerente" value={pin} onChange={setPin} />
          <SixDigitPinInput id="mgr-pin2" label="Confirmar PIN" value={pin2} onChange={setPin2} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-peruRed py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Guardar PIN de gerente"}
          </button>
        </form>
      </div>
    </div>
  );
}

function hasWorkerPinInviteInUrl() {
  try {
    return Boolean(new URLSearchParams(window.location.search).get("crear-pin"));
  } catch {
    return false;
  }
}

/**
 * Blocks the app until company auth + manager PIN are ready (when Supabase is configured).
 * Exception: `?crear-pin=` invite links must reach App so workers can set PIN without
 * a company login (anon RPCs validate the token). Staff kiosk still needs company session.
 */
export default function CompanyAuthGate({ children }) {
  const supa = useTeresitaSupabase();
  const workerPinInvite = hasWorkerPinInviteInUrl();

  if (!isSupabaseConfigured) {
    return children;
  }

  if (supa.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-coffee/70">
        Conectando con Teresita…
      </div>
    );
  }

  // Invite PIN setup: do not require company JWT / manager PIN / clean init for the gate.
  // App validates the token via get_invite_for_pin_setup (anon).
  if (workerPinInvite) {
    return children;
  }

  if (supa.initError) {
    const looksLikeStaleSession =
      /violates not-null|null value in column|companies/i.test(supa.initError) ||
      /AUTH_USER_NOT_FOUND/i.test(supa.initError);
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl border-2 border-red-300 bg-white p-6 shadow-bento">
          <h2 className="text-lg font-bold text-red-800">No se pudo conectar con Supabase</h2>
          <p className="mt-2 text-sm text-coffee">{supa.initError}</p>
          {looksLikeStaleSession ? (
            <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-coffee">
              Detectamos una sesión vieja en este navegador (probablemente hiciste un wipe de la base).
              Pulsa <strong>Cerrar sesión y empezar de nuevo</strong>.
            </p>
          ) : (
            <>
              <p className="mt-4 text-xs text-coffee/75">
                Si falta el esquema, corre en Supabase → <strong>SQL Editor</strong>, en este orden:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-coffee/80">
                <li>
                  <code className="text-[11px]">supabase/00_RESET_DATABASE.sql</code> → Run
                </li>
                <li>
                  <code className="text-[11px]">supabase/01_SETUP_TERESITA.sql</code> → Run
                </li>
                <li>
                  <code className="text-[11px]">supabase/03_FIX_MISSING_PROFILE.sql</code> → Run
                </li>
                <li>
                  <code className="text-[11px]">supabase/02_VERIFY.sql</code> → debe listar 7 tablas
                </li>
              </ol>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={hardSignOutAndReload}
              className="rounded-xl bg-peruRed px-4 py-2 text-sm font-semibold text-white"
            >
              Cerrar sesión y empezar de nuevo
            </button>
            <button
              type="button"
              onClick={() => supa.refreshSessionState()}
              className="rounded-xl border border-peruRed/30 bg-white px-4 py-2 text-sm font-semibold text-peruRed"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!supa.session) {
    return <CompanyLoginScreen onDone={supa.refreshSessionState} />;
  }

  if (!supa.profile?.company_id) {
    return <ProfileLinkScreen onDone={supa.refreshSessionState} />;
  }

  if (!supa.managerPinReady) {
    return <ManagerPinSetupScreen onDone={supa.refreshSessionState} />;
  }

  return children;
}
