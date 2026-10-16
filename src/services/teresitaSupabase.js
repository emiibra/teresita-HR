import { supabase, isSupabaseConfigured, LS_COMPANY_ID } from "../lib/supabaseClient";

export { isSupabaseConfigured };

/** Convierte errores de Supabase en texto legible (evita [object Object] en pantalla). */
export function toErrorMessage(err) {
  if (!err) return "Error desconocido";
  if (typeof err === "string") return err;
  if (err.message) {
    const m = err.message;
    if (m.includes("Not authenticated or no company profile")) {
      return "Falta tu perfil de empresa. Usa «Vincular mi cuenta» abajo o ejecuta 03_FIX_MISSING_PROFILE.sql en Supabase.";
    }
    if (m.includes("Could not find the function") && m.includes("ensure_company_profile")) {
      return "Falta un paso en Supabase: ejecuta supabase/03_FIX_MISSING_PROFILE.sql en SQL Editor.";
    }
    const extra = err.details || err.hint;
    return extra ? `${m} — ${extra}` : m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function throwIfError(error) {
  if (error) throw new Error(toErrorMessage(error));
}

/** Correo que recibe avisos cuando se crea un trabajador */
export const DEFAULT_ADMIN_NOTIFY_EMAIL =
  process.env.REACT_APP_ADMIN_NOTIFY_EMAIL || "emiliaabravo19@gmail.com";

export async function signUpCompany({ email, password, companyName, fullName }) {
  if (!supabase) throw new Error("Supabase not configured");
  const cleanEmail = email.trim();
  // Prefer the email used at signup (not a hardcoded standard account)
  const adminNotify = cleanEmail || DEFAULT_ADMIN_NOTIFY_EMAIL;
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        company_name: companyName,
        full_name: fullName || companyName,
        role: "owner",
        admin_notification_email: adminNotify
      }
    }
  });
  throwIfError(error);
  if (data?.session) {
    await ensureCompanyProfile(companyName, fullName || companyName);
  }
  return data;
}

/** Crea company + profile si el usuario existe en Auth pero no en tablas (registro antes del SQL). */
export async function ensureCompanyProfile(companyName, fullName) {
  const { data, error } = await supabase.rpc("ensure_company_profile", {
    p_company_name: companyName?.trim() || null,
    p_full_name: fullName?.trim() || null
  });
  throwIfError(error);
  if (data) localStorage.setItem(LS_COMPANY_ID, data);
  return data;
}

export async function signInCompany({ email, password }) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  throwIfError(error);
  return data;
}

export async function signOutCompany() {
  if (!supabase) return;
  await supabase.auth.signOut();
  localStorage.removeItem(LS_COMPANY_ID);
}

export async function fetchMyProfile(userId) {
  if (!supabase) return null;
  let uid = userId;
  if (!uid) {
    const { data: userData } = await supabase.auth.getUser();
    uid = userData?.user?.id;
  }
  if (!uid) return null;
  let { data, error } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, role, companies(id, name, admin_notification_email, logo_url)")
    .eq("id", uid)
    .maybeSingle();
  if (
    error &&
    (String(error.message || "").includes("admin_notification_email") ||
      String(error.message || "").includes("logo_url"))
  ) {
    ({ data, error } = await supabase
      .from("profiles")
      .select("id, company_id, full_name, role, companies(id, name, admin_notification_email)")
      .eq("id", uid)
      .maybeSingle());
    if (error && String(error.message || "").includes("admin_notification_email")) {
      ({ data, error } = await supabase
        .from("profiles")
        .select("id, company_id, full_name, role, companies(id, name)")
        .eq("id", uid)
        .maybeSingle());
    }
  }
  throwIfError(error);
  if (data?.company_id) {
    localStorage.setItem(LS_COMPANY_ID, data.company_id);
  }
  return data;
}

export async function uploadCompanyBranding(companyId, dataUrl) {
  if (!supabase || !companyId || !dataUrl?.startsWith("data:")) return null;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1] || "jpeg";
  const path = `${companyId}/logo.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("restaurant-branding")
    .upload(path, blob, { contentType: blob.type, upsert: true });
  throwIfError(uploadError);
  const { data } = supabase.storage.from("restaurant-branding").getPublicUrl(path);
  const publicUrl = data?.publicUrl || null;
  if (!publicUrl) return null;
  const { error } = await supabase.rpc("set_company_logo_url", { p_logo_url: publicUrl });
  throwIfError(error);
  return publicUrl;
}

export async function managerPinIsSet() {
  const { data, error } = await supabase.rpc("manager_pin_is_set");
  throwIfError(error);
  return Boolean(data);
}

export async function setupManagerPin(pin) {
  const { error } = await supabase.rpc("setup_manager_pin", { p_pin: pin });
  throwIfError(error);
}

export async function verifyManagerPin(pin) {
  const { data, error } = await supabase.rpc("verify_manager_pin", { p_pin: pin });
  throwIfError(error);
  return Boolean(data);
}

export async function listWorkers() {
  const { data, error } = await supabase.rpc("list_workers");
  throwIfError(error);
  return data || [];
}

export async function listWorkersForStaffLogin(companyId) {
  const { data, error } = await supabase.rpc("list_workers_for_staff_login", {
    p_company_id: companyId
  });
  throwIfError(error);
  return data || [];
}

export async function createWorkerWithInvite(payload) {
  const { data, error } = await supabase.rpc("create_worker_with_invite", payload);
  throwIfError(error);
  return data;
}

export async function getCompanyAdminEmail() {
  const { data, error } = await supabase.rpc("get_company_admin_email");
  throwIfError(error);
  return data || DEFAULT_ADMIN_NOTIFY_EMAIL;
}

export async function sendWorkerInviteEmail({
  invite_id,
  token,
  email,
  nombre,
  whatsapp,
  admin_email
}) {
  const appUrl = window.location.origin;
  const { data, error } = await supabase.functions.invoke("send-worker-invite", {
    body: {
      invite_id,
      token,
      email,
      nombre,
      whatsapp,
      admin_email: admin_email || DEFAULT_ADMIN_NOTIFY_EMAIL,
      app_url: appUrl
    }
  });
  if (error) {
    let detail = error.message || "Edge Function error";
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) detail = String(body.error);
      }
    } catch {
      /* keep detail */
    }
    throw new Error(detail);
  }
  return data;
}

function mapMarcacionRow(m) {
  const parsedIn = m.tipo === "CLOCK_IN" ? parsePuntualidadIngreso(m.puntualidad) : null;
  const isOutNote =
    m.tipo === "CLOCK_OUT" &&
    m.puntualidad &&
    m.puntualidad !== "Tarde" &&
    m.puntualidad !== "A tiempo" &&
    !String(m.puntualidad).startsWith("Tarde:");
  return {
    id: m.id,
    colaboradorId: m.worker_id,
    nombre: m.nombre,
    sede: m.sede,
    fecha: typeof m.fecha === "string" ? m.fecha.slice(0, 10) : m.fecha,
    tipo: m.tipo,
    hora: m.hora,
    puntualidad: m.puntualidad,
    lateMin: m.tipo === "CLOCK_IN" ? parsedIn?.lateMin ?? 0 : undefined,
    nota: isOutNote ? m.puntualidad : undefined
  };
}

function mapComandaRow(c) {
  return {
    id: c.id,
    colaboradorId: c.worker_id,
    nombre: c.nombre,
    sede: c.sede,
    fecha: typeof c.fecha === "string" ? c.fecha.slice(0, 10) : c.fecha,
    monto: Number(c.monto),
    concepto: c.concepto,
    numeroBoleta: c.numero_boleta,
    fotoNombre: c.foto_nombre,
    fotoDataUrl: c.foto_data_url
  };
}

export async function loadMarcacionesCompany() {
  const { data, error } = await supabase.rpc("list_marcaciones_company", {
    p_desde: null,
    p_hasta: null
  });
  throwIfError(error);
  return (data || []).map(mapMarcacionRow);
}

export async function loadMarcacionesWorker(companyId, workerId) {
  const { data, error } = await supabase.rpc("list_marcaciones_worker", {
    p_company_id: companyId,
    p_worker_id: workerId
  });
  throwIfError(error);
  return (data || []).map(mapMarcacionRow);
}

export async function loadComandasCompany() {
  const { data, error } = await supabase.rpc("list_comandas_company", {
    p_desde: null,
    p_hasta: null
  });
  throwIfError(error);
  return (data || []).map(mapComandaRow);
}

export async function registrarMarcacionWorker({
  workerId,
  pin,
  sede,
  fecha,
  tipo,
  hora,
  puntualidad
}) {
  const { data, error } = await supabase.rpc("registrar_marcacion_worker", {
    p_worker_id: workerId,
    p_pin: pin,
    p_sede: sede,
    p_fecha: fecha,
    p_tipo: tipo,
    p_hora: hora,
    p_puntualidad: puntualidad || null
  });
  throwIfError(error);
  return data;
}

export async function registrarComandaAdmin({
  managerPin,
  workerId,
  sede,
  fecha,
  monto,
  concepto,
  numeroBoleta,
  fotoNombre,
  fotoDataUrl
}) {
  const { data, error } = await supabase.rpc("registrar_comanda_admin", {
    p_manager_pin: managerPin,
    p_worker_id: workerId,
    p_sede: sede,
    p_fecha: fecha,
    p_monto: monto,
    p_concepto: concepto,
    p_numero_boleta: numeroBoleta,
    p_foto_nombre: fotoNombre,
    p_foto_data_url: fotoDataUrl
  });
  throwIfError(error);
  return data;
}

export async function getInviteForPinSetup(token) {
  const { data, error } = await supabase.rpc("get_invite_for_pin_setup", {
    p_token: token
  });
  throwIfError(error);
  return data;
}

export async function setWorkerPinFromInvite(token, pin) {
  const { data, error } = await supabase.rpc("set_worker_pin_from_invite", {
    p_token: token,
    p_pin: pin
  });
  throwIfError(error);
  return data;
}

export async function verifyWorkerPin(workerId, pin) {
  const { data, error } = await supabase.rpc("verify_worker_pin", {
    p_worker_id: workerId,
    p_pin: pin
  });
  throwIfError(error);
  return Boolean(data);
}

/** Genera código en BD (sin correo). Usado si la edge function no está desplegada. */
export async function issueWorkerDeleteCode(workerId) {
  const { data, error } = await supabase.rpc("issue_worker_delete_code", {
    p_worker_id: workerId
  });
  throwIfError(error);
  if (!data) throw new Error("No se pudo generar el código.");
  return String(data);
}

/** Pide código por correo al admin; si falla el envío, genera código en pantalla. */
export async function requestDeleteWorkerCodeEmail({ worker_id, nombre, admin_email }) {
  const adminTo = admin_email || DEFAULT_ADMIN_NOTIFY_EMAIL;
  const body = {
    purpose: "delete_worker_code",
    worker_id,
    nombre,
    admin_email: adminTo,
    app_url: window.location.origin
  };

  try {
    const { data, error } = await supabase.functions.invoke("send-worker-invite", { body });
    if (error) throw new Error(toErrorMessage(error));
    if (data?.error) throw new Error(String(data.error));
    if (data?.code_for_dev) {
      return {
        ok: false,
        email_sent: false,
        code_for_dev: data.code_for_dev,
        admin_email: data.admin_email || adminTo,
        hint:
          data.hint ||
          "Correo no configurado en Supabase (RESEND_API_KEY). Usa el código de abajo."
      };
    }
    return { ok: true, email_sent: true, admin_email: data.admin_notified || adminTo };
  } catch (edgeErr) {
    const code = await issueWorkerDeleteCode(worker_id);
    return {
      ok: false,
      email_sent: false,
      code_for_dev: code,
      admin_email: adminTo,
      edge_failed: true,
      hint: `No se pudo enviar correo (${toErrorMessage(edgeErr)}). Código generado aquí abajo.`
    };
  }
}

export async function deleteWorkerWithCode(workerId, code) {
  const { data, error } = await supabase.rpc("delete_worker_with_code", {
    p_worker_id: workerId,
    p_code: code
  });
  throwIfError(error);
  return Boolean(data);
}

export function workerToPersona(w) {
  return {
    id: w.id,
    nombre: w.nombre,
    rol: w.rol || "Colaborador",
    sedes: Array.isArray(w.sedes) ? w.sedes : [],
    horario: w.horario || "08:00",
    email: w.email,
    pinConfigured: w.pin_configured ?? w.pinConfigured,
    whatsapp: w.whatsapp || "",
    fechaNacimiento: w.fecha_nacimiento || w.fechaNacimiento || "",
    direccion: w.direccion || "",
    contactoEmergenciaNombre: w.contacto_emergencia_nombre || w.contactoEmergenciaNombre || "",
    contactoEmergenciaTelefono: w.contacto_emergencia_telefono || w.contactoEmergenciaTelefono || ""
  };
}
