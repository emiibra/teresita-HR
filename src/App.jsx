import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Bell,
  Camera,
  ChefHat,
  Clock3,
  Coffee,
  FileSpreadsheet,
  HelpCircle,
  Mail,
  MapPin,
  Pencil,
  Plus,
  MoreHorizontal,
  Timer,
  Trash2,
  User,
  Users,
  X,
  BarChart3,
  SlidersHorizontal
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import logoTeresita from "./data/descarga__2_.png";
import * as XLSX from "xlsx";
import { useTeresitaSupabase } from "./context/TeresitaSupabaseContext.jsx";
import { LS_COMPANY_ID } from "./lib/supabaseClient.js";
import { applyPendingBranding, saveBranding } from "./utils/restaurantBranding.js";
import {
  createWorkerWithInvite,
  deleteWorkerWithCode,
  getInviteForPinSetup,
  requestDeleteWorkerCodeEmail,
  sendWorkerInviteEmail,
  setWorkerPinFromInvite,
  loadMarcacionesCompany,
  loadMarcacionesWorker,
  loadComandasCompany,
  registrarMarcacionWorker,
  registrarComandaAdmin,
  uploadCompanyBranding,
  verifyManagerPin,
  verifyWorkerPin
} from "./services/teresitaSupabase.js";

const VISTAS = [
  { id: "staff", label: "Personal" },
  { id: "admin", label: "Administrador" }
];

const PERSONAL_BASE = [
  { id: "c1", nombre: "Ana Ruiz", rol: "Colaborador", sedes: ["Comas", "Surquillo"], horario: "08:00" },
  { id: "c2", nombre: "Luis Pena", rol: "Colaborador", sedes: ["Surquillo"], horario: "08:00" },
  { id: "c3", nombre: "Marisol Ramos", rol: "Colaborador", sedes: ["Comas", "Surquillo"], horario: "09:00" },
  { id: "a1", nombre: "Emilia Bravo", rol: "Administrador", sedes: ["Comas", "Surquillo"], horario: "08:00" }
];

const ADMIN_CODE = "7429";
/** PIN por defecto (demo). Los nuevos colaboradores fijan el suyo con el enlace de invitación. */
const BUILT_IN_PINS = {
  c1: "1111",
  c2: "2222",
  c3: "3333",
  a1: "7429"
};
/** Horas efectivas pagadas por jornada completa netas después del refrigerio. */
const GOAL_PAID_NET_MIN = 8 * 60;
/** Refrigerio mínimo/referencia en minutos. */
const BREAK_EXPECTED_MIN = 45;
/** Minutos sin contar tardanza; a partir del minuto siguiente ya suma tardanza completa acumulable. */
const GRACE_LATENESS_MIN = 15;
const LS_KEYS = {
  marcaciones: "teresita.v2.marcaciones",
  auditLog: "teresita.v2.auditLog",
  historialEdicion: "teresita.v2.historialEdicion",
  jornadas: "teresita.v2.jornadas",
  turnosPlan: "teresita.v2.turnosPlan",
  comandas: "teresita.v2.comandas",
  adminTab: "teresita.v2.adminTab",
  analisisRangoAdmin: "teresita.v2.analisisRangoAdmin",
  sedeTurno: "teresita.v2.sedeTurno",
  staffPanel: "teresita.v2.staffPanel",
  staffAccess: "teresita.v2.staffAccess",
  /** Porcentaje del ancho total (solo lg+) para columna Pulse vs panel lateral. */
  staffPaneSplit: "teresita.v2.staffPaneSplit",
  colaboradoresExtra: "teresita.v2.colaboradoresExtra",
  staffPinsCustom: "teresita.v2.staffPinsCustom",
  staffInvites: "teresita.v2.staffInvites",
  vista: "teresita.v2.vista",
  adminUnlockUntil: "teresita.v2.adminUnlockUntil",
  overtimePendiente: "teresita.v2.overtimePendiente",
  overtimeAjustes: "teresita.v2.overtimeAjustes",
  solicitudes: "teresita.v2.solicitudes",
  notificaciones: "teresita.v2.notificaciones",
  diasLibresQuota: "teresita.v2.diasLibresQuota"
};

const ADMIN_UNLOCK_MS = 8 * 60 * 60 * 1000;

function isAdminUnlocked() {
  const until = Number(sessionStorage.getItem(LS_KEYS.adminUnlockUntil) || 0);
  return until > Date.now();
}

function setAdminUnlocked() {
  sessionStorage.setItem(LS_KEYS.adminUnlockUntil, String(Date.now() + ADMIN_UNLOCK_MS));
}

function clearAdminUnlock() {
  sessionStorage.removeItem(LS_KEYS.adminUnlockUntil);
}

const JORNADAS_BASE = {
  "c1:Comas": { ingreso: "08:00", salida: "17:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" },
  "c1:Surquillo": { ingreso: "09:00", salida: "18:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" },
  "c2:Surquillo": { ingreso: "08:00", salida: "17:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" },
  "c3:Comas": { ingreso: "09:00", salida: "18:00", refrigerioInicio: "13:30", refrigerioFin: "14:15" },
  "c3:Surquillo": { ingreso: "10:00", salida: "19:00", refrigerioInicio: "14:00", refrigerioFin: "14:45" },
  "a1:Comas": { ingreso: "08:00", salida: "17:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" },
  "a1:Surquillo": { ingreso: "08:00", salida: "17:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" }
};

function jornadaFilaParaUI(raw, ingresoFallback, salidaFallback) {
  const ingreso = raw?.ingreso ?? ingresoFallback;
  const salida = raw?.salida ?? salidaFallback;
  return {
    ingreso,
    salida,
    refrigerioInicio: raw?.refrigerioInicio ?? "13:00",
    refrigerioFin: raw?.refrigerioFin ?? "13:45"
  };
}

/** Turnos predefinidos; el admin elige uno y puede editar las horas después. */
const TURN_TEMPLATES = {
  manana: {
    label: "Turno mañana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45"
  },
  tarde: {
    label: "Turno tarde",
    ingreso: "15:00",
    salida: "23:00",
    refrigerioInicio: "18:00",
    refrigerioFin: "18:45"
  },
  medio_manana: {
    label: "Medio tiempo mañana",
    ingreso: "08:00",
    salida: "13:00",
    refrigerioInicio: "11:00",
    refrigerioFin: "11:30"
  },
  medio_tarde: {
    label: "Medio tiempo tarde",
    ingreso: "14:00",
    salida: "19:00",
    refrigerioInicio: "16:30",
    refrigerioFin: "17:00"
  },
  custom: {
    label: "Horario personalizado",
    ingreso: "",
    salida: "",
    refrigerioInicio: "",
    refrigerioFin: ""
  }
};

function matchTurnTemplateId(row) {
  if (!row?.ingreso || !row?.salida) return "manana";
  for (const [id, t] of Object.entries(TURN_TEMPLATES)) {
    if (id === "custom") continue;
    if (
      row.ingreso === t.ingreso &&
      row.salida === t.salida &&
      row.refrigerioInicio === t.refrigerioInicio &&
      row.refrigerioFin === t.refrigerioFin
    ) {
      return id;
    }
  }
  return "custom";
}

function turnTemplateTimes(id) {
  const t = TURN_TEMPLATES[id];
  if (!t || id === "custom") return null;
  return {
    ingreso: t.ingreso,
    salida: t.salida,
    refrigerioInicio: t.refrigerioInicio,
    refrigerioFin: t.refrigerioFin
  };
}

function formatTardanzaMinutos(min) {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

function etiquetaPuntualidadIngreso(m, jornadaProgramada) {
  const late =
    typeof m.lateMin === "number" ? m.lateMin : parsePuntualidadIngreso(m.puntualidad).lateMin;
  const prog = jornadaProgramada?.ingreso;
  if (late > 0) {
    const tardeTxt = formatTardanzaMinutos(late);
    return prog
      ? `Tardanza: ${tardeTxt} (debía ingresar ${formatHora12(prog)})`
      : `Tardanza: ${tardeTxt}`;
  }
  if (m.puntualidad === "A tiempo" || !m.puntualidad) {
    return prog ? `A tiempo · programado ${formatHora12(prog)}` : "A tiempo";
  }
  if (String(m.puntualidad).startsWith("Tarde:")) {
    return etiquetaPuntualidadIngreso({ ...m, lateMin: late }, jornadaProgramada);
  }
  return m.puntualidad;
}

function EditorPlantillaTurno({
  plantillaTurnoId,
  onPlantillaChange,
  ingreso,
  salida,
  refrigerioInicio,
  refrigerioFin,
  onTimesChange,
  className = "mt-3"
}) {
  const presetIds = ["manana", "tarde", "medio_manana", "medio_tarde"];

  function applyPreset(id) {
    onPlantillaChange(id);
    const times = turnTemplateTimes(id);
    if (times) onTimesChange(times);
  }

  function patchField(field, value) {
    const next = { ingreso, salida, refrigerioInicio, refrigerioFin, [field]: value };
    onTimesChange({ [field]: value });
    onPlantillaChange(matchTurnTemplateId(next));
  }

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-coffee">Plantilla de turno</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presetIds.map((id) => {
          const t = TURN_TEMPLATES[id];
          const active = plantillaTurnoId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`min-w-[7rem] flex-1 rounded-xl px-2.5 py-2 text-left transition sm:max-w-[11rem] sm:flex-none ${
                active
                  ? "bg-peruRed text-white shadow-sm ring-2 ring-peruRed/30"
                  : "bg-bone text-coffee ring-1 ring-peruRed/15 hover:bg-peruMustard/30"
              }`}
            >
              <span className="block text-[11px] font-bold leading-tight">{t.label}</span>
              <span
                className={`mt-0.5 block font-mono text-[10px] tabular-nums ${
                  active ? "text-white/90" : "text-coffee/60"
                }`}
              >
                {t.ingreso} – {t.salida}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-coffee">
          Entrada
          <input
            type="time"
            value={ingreso}
            onChange={(e) => patchField("ingreso", e.target.value)}
            className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-coffee">
          Salida
          <input
            type="time"
            value={salida}
            onChange={(e) => patchField("salida", e.target.value)}
            className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-coffee">
          Inicio ref.
          <input
            type="time"
            value={refrigerioInicio}
            onChange={(e) => patchField("refrigerioInicio", e.target.value)}
            className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-coffee">
          Fin ref.
          <input
            type="time"
            value={refrigerioFin}
            onChange={(e) => patchField("refrigerioFin", e.target.value)}
            className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function renderShiftStatusBadges({ shift, iso, marcaciones }) {
  const evDia = marcaciones.filter(
    (m) => m.colaboradorId === shift.p.id && m.fecha === iso
  );
  const horaFichada = horaFichadaTipo(evDia, "CLOCK_IN", "first");
  const fichado = Boolean(horaFichada);
  return (
  <div className="flex shrink-0 flex-col items-end justify-center gap-1">
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
      Programado
    </span>
    {fichado ? (
      <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-800">
        Fichado {formatHora12(horaFichada)}
      </span>
    ) : null}
    {shift.esExcepcion ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80">
        Cambio del día
      </span>
    ) : null}
  </div>
  );
}

function planTurnoKey(colaboradorId, sede, fechaIso) {
  return `${colaboradorId}:${sede}:${fechaIso}`;
}

/** `colaboradorId` y `sede` no deben contener ":". */
function parsePlanTurnoKey(key) {
  const last = key.lastIndexOf(":");
  if (last <= 0) return null;
  const fechaIso = key.slice(last + 1);
  const rest = key.slice(0, last);
  const first = rest.indexOf(":");
  if (first <= 0) return null;
  return {
    colaboradorId: rest.slice(0, first),
    sede: rest.slice(first + 1),
    fechaIso
  };
}

function eliminarPlanesPersonaFecha(turnosPlanState, colaboradorId, fechaIso) {
  const next = { ...turnosPlanState };
  for (const k of Object.keys(next)) {
    const p = parsePlanTurnoKey(k);
    if (p && p.colaboradorId === colaboradorId && p.fechaIso === fechaIso) {
      delete next[k];
    }
  }
  return next;
}

function findPlanEntryForPersonDate(turnosPlanState, colaboradorId, fechaIso) {
  for (const [k, val] of Object.entries(turnosPlanState)) {
    const p = parsePlanTurnoKey(k);
    if (
      p &&
      p.colaboradorId === colaboradorId &&
      p.fechaIso === fechaIso &&
      val &&
      typeof val === "object" &&
      val.ingreso &&
      val.salida
    ) {
      return { sede: p.sede, val };
    }
  }
  return null;
}

/** Si hay plan del día para esta persona, solo aplica en esa sede (una jornada planificada por día). */
function getPlanSedeExcepcionDia(turnosPlanState, colaboradorId, fechaIso) {
  const found = findPlanEntryForPersonDate(turnosPlanState, colaboradorId, fechaIso);
  return found ? found.sede : null;
}

function fechasEnRangoIso(desde, hasta, omitirFinDeSemana) {
  if (!desde?.trim() || !hasta?.trim() || desde > hasta) return [];
  const out = [];
  const d = new Date(`${desde}T12:00:00`);
  const end = new Date(`${hasta}T12:00:00`);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    if (omitirFinDeSemana && (wd === 0 || wd === 6)) continue;
    out.push(iso);
  }
  return out;
}

/** Plantilla (`jornadas`) + excepción por día (`turnosPlan`) si existe. */
function getJornadaPlanificada(
  colaboradorId,
  sede,
  fechaIso,
  jornadasState,
  turnosPlanState,
  ingresoFb,
  salidaFb
) {
  const ex = turnosPlanState[planTurnoKey(colaboradorId, sede, fechaIso)];
  if (ex && typeof ex === "object" && ex.ingreso && ex.salida) {
    return jornadaFilaParaUI(ex, ingresoFb, salidaFb);
  }
  return jornadaFilaParaUI(jornadasState[`${colaboradorId}:${sede}`], ingresoFb, salidaFb);
}

const EVENT_BADGE = {
  CLOCK_IN: "bg-green-100 text-green-700",
  BREAK_IN: "bg-amber-100 text-amber-700",
  BREAK_OUT: "bg-yellow-100 text-yellow-700",
  CLOCK_OUT: "bg-red-100 text-red-700"
};

const EVENT_LABEL = {
  CLOCK_IN: "Ingreso",
  BREAK_IN: "Inicio refrigerio",
  BREAK_OUT: "Fin refrigerio",
  CLOCK_OUT: "Salida"
};

function nowHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 08:30 → "8:30 a. m." */
function formatHora12(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return "—";
  const parts = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return hhmm;
  const h = Number(parts[1]);
  const m = parts[2];
  const ampm = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/** Horas netas pagadas según horario planificado (plantilla o plan del día). */
function scheduledNetMinutes(jornada) {
  if (!jornada?.ingreso || !jornada?.salida) return GOAL_PAID_NET_MIN;
  const gross = Math.max(0, parseMinutes(jornada.salida) - parseMinutes(jornada.ingreso));
  const br = Math.max(
    0,
    parseMinutes(jornada.refrigerioFin || "13:45") - parseMinutes(jornada.refrigerioInicio || "13:00")
  );
  return Math.max(0, gross - br);
}

function parseDaySegments(events) {
  const sorted = [...events].sort((a, b) => a.hora.localeCompare(b.hora));
  const segments = [];
  let current = null;
  for (const e of sorted) {
    if (e.tipo === "CLOCK_IN") {
      current = { in: e.hora, breakIn: null, breakOut: null, out: null };
      segments.push(current);
    } else if (current) {
      if (e.tipo === "BREAK_IN") current.breakIn = e.hora;
      if (e.tipo === "BREAK_OUT") current.breakOut = e.hora;
      if (e.tipo === "CLOCK_OUT") current.out = e.hora;
    }
  }
  return segments;
}

/** Siguiente acción según la última marcación del día (permite varios ingresos/salidas el mismo día). */
function allowedMarcacionActions(events) {
  const sorted = [...events].sort((a, b) => a.hora.localeCompare(b.hora));
  if (sorted.length === 0) return ["CLOCK_IN"];
  const last = sorted[sorted.length - 1].tipo;
  switch (last) {
    case "CLOCK_IN":
      return ["BREAK_IN", "CLOCK_OUT"];
    case "BREAK_IN":
      return ["BREAK_OUT", "CLOCK_OUT"];
    case "BREAK_OUT":
      return ["CLOCK_OUT"];
    case "CLOCK_OUT":
      return ["CLOCK_IN"];
    default:
      return ["CLOCK_IN"];
  }
}

function nextMarcacionAction(events) {
  const allowed = allowedMarcacionActions(events);
  return allowed[0] || null;
}

function parsePuntualidadIngreso(puntualidad) {
  if (!puntualidad) return { label: "", lateMin: 0 };
  const m = String(puntualidad).match(/^Tarde:(\d+)$/);
  if (m) return { label: "Tarde", lateMin: Number(m[1]) };
  if (puntualidad === "Tarde") return { label: "Tarde", lateMin: 0 };
  return { label: puntualidad, lateMin: 0 };
}

function encodePuntualidadIngreso(lateMin) {
  return lateMin > 0 ? `Tarde:${lateMin}` : "A tiempo";
}

function tardanzaGuardadaEnEventos(eventosDia) {
  const ing = [...eventosDia]
    .filter((e) => e.tipo === "CLOCK_IN")
    .sort((a, b) => a.hora.localeCompare(b.hora))[0];
  if (!ing) return 0;
  if (typeof ing.lateMin === "number") return ing.lateMin;
  return parsePuntualidadIngreso(ing.puntualidad).lateMin;
}

function mensajeMarcacionBreve(tipo, { hora, jornada, lateMin, notaSalida }) {
  const h = formatHora12(hora);
  switch (tipo) {
    case "CLOCK_IN":
      if (lateMin > 0) {
        return `Ingreso ${h} · ${lateMin} min tarde (gracia ${GRACE_LATENESS_MIN} min).`;
      }
      return `Ingreso ${h} · a tiempo (programado ${formatHora12(jornada?.ingreso)}).`;
    case "BREAK_IN":
      return `Refrigerio inicio ${h} · sugerido ${formatHora12(jornada?.refrigerioInicio)}.`;
    case "BREAK_OUT":
      return `Refrigerio fin ${h} · sugerido ${formatHora12(jornada?.refrigerioFin)}.`;
    case "CLOCK_OUT":
      return notaSalida ? `Salida ${h} · nota guardada.` : `Salida ${h}.`;
    default:
      return `${EVENT_LABEL[tipo] || tipo} ${h}.`;
  }
}

function segmentWorkedMinutes(seg) {
  if (!seg.in || !seg.out) return 0;
  const gross = parseMinutes(seg.out) - parseMinutes(seg.in);
  const bMin =
    seg.breakIn && seg.breakOut
      ? Math.max(0, parseMinutes(seg.breakOut) - parseMinutes(seg.breakIn))
      : 0;
  return Math.max(0, gross - bMin);
}

/**
 * Resumen del día: suma tramos ingreso→salida.
 * `finalize: false` en el día en curso → no calcula tardanza ni debe/extra (solo horas trabajadas).
 */
function daySummary(events, jornadaOrShiftStart, options = {}) {
  const jornada =
    typeof jornadaOrShiftStart === "object" && jornadaOrShiftStart?.ingreso
      ? jornadaOrShiftStart
      : { ingreso: jornadaOrShiftStart || "08:00", salida: "17:00", refrigerioInicio: "13:00", refrigerioFin: "13:45" };
  const { finalize = true } = options;
  const goalNet = scheduledNetMinutes(jornada);
  const segments = parseDaySegments(events);
  const sorted = [...events].sort((a, b) => a.hora.localeCompare(b.hora));
  const firstIn = sorted.find((e) => e.tipo === "CLOCK_IN");

  let worked = 0;
  let breakMin = 0;
  for (const seg of segments) {
    if (seg.in && seg.out) {
      worked += segmentWorkedMinutes(seg);
      if (seg.breakIn && seg.breakOut) {
        breakMin += Math.max(0, parseMinutes(seg.breakOut) - parseMinutes(seg.breakIn));
      }
    }
  }

  const inProgress = segments.some((s) => s.in && !s.out);
  const hasCompleteDay = segments.some((s) => s.in && s.out);

  if (!finalize) {
    return {
      worked,
      breakMin,
      overtime: 0,
      debt: 0,
      lateMin: 0,
      goalNet,
      segments: segments.length,
      inProgress,
      hasCompleteDay
    };
  }

  if (!hasCompleteDay) {
    return {
      worked,
      breakMin,
      overtime: 0,
      debt: 0,
      lateMin: firstIn ? latenessAfterGrace(jornada.ingreso, firstIn.hora) : 0,
      goalNet,
      segments: segments.length,
      inProgress,
      hasCompleteDay: false
    };
  }

  return {
    worked,
    breakMin,
    overtime: Math.max(0, worked - goalNet),
    debt: Math.max(0, goalNet - worked),
    lateMin: firstIn ? latenessAfterGrace(jornada.ingreso, firstIn.hora) : 0,
    goalNet,
    segments: segments.length,
    inProgress,
    hasCompleteDay: true
  };
}

/** Minutos esperados en la semana (lun–dom) según plantillas/planes en BD. */
function expectedWeekMinutesForPerson(person, weekStartIso, jornadasState, turnosPlanState) {
  if (!person) return 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDaysIso(weekStartIso, i);
    const row = effectiveShiftRowForPersonDate(person, iso, jornadasState, turnosPlanState);
    if (row.kind === "laboral") total += scheduledNetMinutes(row.j);
  }
  return total;
}

function workedWeekMinutesForPerson(personId, weekStartIso, untilIso, marcacionesAll, jornadasState, turnosPlanState, personasList) {
  const person = personasList.find((p) => p.id === personId);
  if (!person) return 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDaysIso(weekStartIso, i);
    if (iso > untilIso) break;
    const ev = marcacionesAll.filter((m) => m.colaboradorId === personId && m.fecha === iso);
    if (ev.length === 0) continue;
    const sede = ev[0]?.sede || person.sedes[0];
    const j = getJornadaPlanificada(personId, sede, iso, jornadasState, turnosPlanState, person.horario, "17:00");
    total += daySummary(ev, j, { finalize: iso < untilIso }).worked;
  }
  return total;
}

const PHONE_COUNTRY_OPTIONS = [
  { value: "+51", label: "🇵🇪 Perú (+51)" },
  { value: "+1", label: "🇺🇸 EE.UU. (+1)" },
  { value: "+52", label: "🇲🇽 México (+52)" },
  { value: "+34", label: "🇪🇸 España (+34)" }
];

function splitPhoneE164(stored) {
  if (!stored?.trim()) return { country: "+51", number: "" };
  const s = stored.trim();
  const codes = PHONE_COUNTRY_OPTIONS.map((o) => o.value).sort((a, b) => b.length - a.length);
  for (const c of codes) {
    if (s.startsWith(c)) {
      return { country: c, number: s.slice(c.length).replace(/\D/g, "") };
    }
  }
  return { country: "+51", number: s.replace(/\D/g, "") };
}

function joinPhoneE164(country, number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${country}${digits}`;
}

function formatPhoneDisplay(stored) {
  const { country, number } = splitPhoneE164(stored);
  if (!number) return "—";
  return `${country} ${number.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
}

/** Map Resend / Edge Function errors to short Spanish ops guidance (no raw JSON dump). */
function humanizeInviteEmailError(raw) {
  const text = String(raw || "");
  const ownMatch = text.match(/your own email address\s*\(([^)]+)\)/i);
  const ownEmail = ownMatch?.[1]?.trim();
  if (/only send testing emails|verify a domain|validation_error/i.test(text)) {
    return (
      `Resend está en modo prueba: solo puede enviar a ${ownEmail || "el correo de tu cuenta Resend"}. ` +
      `Para otros correos: verifica un dominio en resend.com/domains y actualiza el secret RESEND_FROM. ` +
      `Mientras tanto usa Copiar / Abrir enlace.`
    );
  }
  if (/RESEND_API_KEY not configured|Failed to send a request to the Edge Function/i.test(text)) {
    return "Función o secrets de correo incompletos. Usa Copiar / Abrir enlace para el PIN.";
  }
  // Strip leading "Resend failed: {json}" noise when possible
  const jsonMatch = text.match(/"message"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  return text || "No se pudo enviar el correo. Usa Copiar / Abrir enlace para el PIN.";
}

function CampoTelefono({ label, required, country, number, onCountry, onNumber, id }) {
  return (
    <label className="mt-3 block text-xs font-semibold text-coffee" htmlFor={id}>
      {label}
      {required ? " *" : ""}
      <div className="mt-1 flex gap-2">
        <select
          value={country}
          onChange={(e) => onCountry(e.target.value)}
          className="w-[10.5rem] shrink-0 rounded-xl border border-peruRed/25 px-2 py-2 text-sm"
          aria-label={`País ${label}`}
        >
          {PHONE_COUNTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          value={number}
          onChange={(e) => onNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
          className="min-w-0 flex-1 rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
          placeholder="999999999"
        />
      </div>
    </label>
  );
}

function parseMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min) {
  const sign = min < 0 ? "-" : "";
  const value = Math.abs(min);
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${sign}${h}h ${m}m`;
}

function inicialesNombre(nombre) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Sede efectiva: plan del día (cualquier día) o plantilla lun–vie. */
function effectiveSedeForPersonDate(p, fechaIso, jornadasState, turnosPlanState) {
  const exSede = getPlanSedeExcepcionDia(turnosPlanState, p.id, fechaIso);
  if (exSede != null) return p.sedes.includes(exSede) ? exSede : exSede;
  const wd = new Date(`${fechaIso}T12:00:00`).getDay();
  if (wd === 0 || wd === 6) return null;
  if (p.sedes.length === 0) return null;
  const scored = p.sedes.map((sede) => {
    const j = jornadaFilaParaUI(jornadasState[`${p.id}:${sede}`], p.horario, "17:00");
    return { sede, ing: parseMinutes(j.ingreso) };
  });
  scored.sort((a, b) => a.ing - b.ing || a.sede.localeCompare(b.sede, "es"));
  return scored[0].sede;
}

/** Fila efectiva para un colaborador en una fecha (plantilla + planes del calendario). */
function effectiveShiftRowForPersonDate(p, fechaIso, jornadasState, turnosPlanState) {
  const sede = effectiveSedeForPersonDate(p, fechaIso, jornadasState, turnosPlanState);
  if (!sede) {
    const wd = new Date(`${fechaIso}T12:00:00`).getDay();
    return { kind: wd === 0 || wd === 6 ? "descanso" : "sin_sede" };
  }
  const j = getJornadaPlanificada(p.id, sede, fechaIso, jornadasState, turnosPlanState, p.horario, "17:00");
  const esExcepcion = Boolean(turnosPlanState[planTurnoKey(p.id, sede, fechaIso)]);
  return { kind: "laboral", sede, j, esExcepcion };
}

/** Una fila por persona y día en listados de equipo. */
function shiftsPlannedForDate(iso, personas, jornadasState, turnosPlanState = {}) {
  return personas
    .flatMap((p) => {
      const sede = effectiveSedeForPersonDate(p, iso, jornadasState, turnosPlanState);
      if (!sede) return [];
      const j = getJornadaPlanificada(p.id, sede, iso, jornadasState, turnosPlanState, p.horario, "17:00");
      const br = Math.max(0, parseMinutes(j.refrigerioFin) - parseMinutes(j.refrigerioInicio));
      const gross = Math.max(0, parseMinutes(j.salida) - parseMinutes(j.ingreso));
      const esExcepcion = Boolean(turnosPlanState[planTurnoKey(p.id, sede, iso)]);
      return [
        {
          key: `${p.id}-${sede}-${iso}`,
          p,
          sede,
          j,
          netMin: Math.max(0, gross - br),
          esExcepcion
        }
      ];
    })
    .sort(
      (a, b) =>
        parseMinutes(a.j.ingreso) - parseMinutes(b.j.ingreso) ||
        a.p.nombre.localeCompare(b.p.nombre, "es")
    );
}

function latenessAfterGrace(expected, current) {
  const diff = parseMinutes(current) - parseMinutes(expected);
  if (diff <= GRACE_LATENESS_MIN) return 0;
  return diff;
}

function toMonday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/** Hora registrada para un tipo de evento ese día. `which`: "first" | "last" (default). */
function horaFichadaTipo(eventosDia, tipo, which = "last") {
  const list = eventosDia
    .filter((e) => e.tipo === tipo)
    .sort((a, b) => a.hora.localeCompare(b.hora));
  if (list.length === 0) return "";
  return which === "first" ? list[0].hora : list[list.length - 1].hora;
}

/** Mes calendario en curso hasta hoy (lo “llenado” del mes), no hasta fin de mes. */
function defaultAnalisisMonthRange() {
  const t = new Date();
  const y = t.getFullYear();
  const mo = t.getMonth();
  const mm = String(mo + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${dd}` };
}

function presetAnalisisUltimos30Dias() {
  const hasta = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() - 29);
  const desde = d.toISOString().slice(0, 10);
  return { desde, hasta };
}

function presetAnalisisMesAnterior() {
  const t = new Date();
  const y = t.getFullYear();
  const mo = t.getMonth() - 1;
  const d0 = new Date(y, mo, 1);
  const y2 = d0.getFullYear();
  const m2 = d0.getMonth();
  const mm = String(m2 + 1).padStart(2, "0");
  const desde = `${y2}-${mm}-01`;
  const lastDay = new Date(y2, m2 + 1, 0).getDate();
  const hasta = `${y2}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { desde, hasta };
}

function presetAnalisisAnioEnCurso() {
  const y = new Date().getFullYear();
  return { desde: `${y}-01-01`, hasta: new Date().toISOString().slice(0, 10) };
}

function formatoRangoHumano(desde, hasta) {
  if (!desde || !hasta) return "";
  const a = new Date(`${desde}T12:00:00`).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const b = new Date(`${hasta}T12:00:00`).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  return `${a} — ${b}`;
}

function semanaCortaLabel(isoLunes) {
  try {
    const d = new Date(`${isoLunes}T12:00:00`);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  } catch {
    return isoLunes;
  }
}

/** Métricas de equipo a partir de marcaciones/comandas filtradas por rango de fechas (inclusive). */
function computeDashboardStats(
  marcacionesAll,
  jornadasState,
  turnosPlanState,
  comandasAll,
  desde,
  hasta,
  personasList = PERSONAL_BASE
) {
  const vacio = {
    comas: 0,
    surquillo: 0,
    gastos: {},
    resumenPorColab: [],
    tardanzaTotal: 0,
    topTarde: null,
    comandasTotal: 0,
    weeklyChart: [],
    debeTrend: [],
    extraHoursByUser: [],
    jornadaRows: [],
    comandasEnRango: []
  };
  if (!desde?.trim() || !hasta?.trim() || desde > hasta) {
    return {
      ...vacio,
      resumenPorColab: personasList.map((p) => ({ ...p, worked: 0, debt: 0, lateMin: 0 })),
      extraHoursByUser: personasList.map((p) => ({ colaboradorId: p.id, nombre: p.nombre, extraWeekly: 0 }))
    };
  }

  const marcaciones = marcacionesAll.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const comandasLista = comandasAll.filter(
    (c) => c.fecha && c.fecha >= desde && c.fecha <= hasta
  );
  const hoyIso = new Date().toISOString().slice(0, 10);

  const dayGroups = groupBy(marcaciones, (m) => `${m.colaboradorId}-${m.fecha}`);
  const jornadaRows = Object.values(dayGroups).map((events) => {
    const sorted = [...events].sort((a, b) => a.hora.localeCompare(b.hora));
    const p = personasList.find((x) => x.id === sorted[0].colaboradorId);
    const jornada = getJornadaPlanificada(
      sorted[0].colaboradorId,
      sorted[0].sede,
      sorted[0].fecha,
      jornadasState,
      turnosPlanState,
      p?.horario || "08:00",
      "17:00"
    );
    const resumen = daySummary(sorted, jornada, { finalize: sorted[0].fecha < hoyIso });
    return {
      colaboradorId: sorted[0].colaboradorId,
      nombre: sorted[0].nombre,
      sede: sorted[0].sede,
      fecha: sorted[0].fecha,
      ...resumen
    };
  });

  const resumenPorColab = personasList.map((p) => {
    const jornadasU = jornadaRows.filter((j) => j.colaboradorId === p.id);
    const worked = jornadasU.reduce((a, j) => a + j.worked, 0);
    const debt = jornadasU.reduce((a, j) => a + j.debt, 0);
    const lateMin = jornadasU.reduce((a, j) => a + j.lateMin, 0);
    return { ...p, worked, debt, lateMin };
  });

  const comas = jornadaRows
    .filter((p) => p.sede === "Comas")
    .reduce((acc, p) => acc + p.worked, 0);
  const surquillo = jornadaRows
    .filter((p) => p.sede === "Surquillo")
    .reduce((acc, p) => acc + p.worked, 0);

  const gastos = comandasLista.reduce((acc, item) => {
    acc[item.colaboradorId] = (acc[item.colaboradorId] || 0) + item.monto;
    return acc;
  }, {});

  const tardanzaTotal = jornadaRows.reduce((acc, j) => acc + j.lateMin, 0);
  const topTarde = [...resumenPorColab].sort((a, b) => b.lateMin - a.lateMin)[0];
  const comandasTotal = comandasLista.reduce((acc, c) => acc + c.monto, 0);

  const weekGroups = groupBy(jornadaRows, (j) => toMonday(j.fecha));
  const weeklyChart = Object.entries(weekGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, rows]) => ({
      semana,
      semanaLabel: semanaCortaLabel(semana),
      Comas: rows.filter((r) => r.sede === "Comas").reduce((a, r) => a + r.worked, 0) / 60,
      Surquillo:
        rows.filter((r) => r.sede === "Surquillo").reduce((a, r) => a + r.worked, 0) / 60
    }));
  const debeTrend = Object.entries(weekGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, rows]) => ({
      semana,
      semanaLabel: semanaCortaLabel(semana),
      DebeHoras: rows.reduce((a, r) => a + r.debt, 0) / 60
    }));

  const extraHoursByUser = personasList.map((p) => {
    const userWeeks = groupBy(
      jornadaRows.filter((j) => j.colaboradorId === p.id),
      (j) => toMonday(j.fecha)
    );
    const extraWeekly = Object.entries(userWeeks).reduce((acc, [lunes, rows]) => {
      const worked = rows.reduce((a, r) => a + r.worked, 0);
      const expected = expectedWeekMinutesForPerson(p, lunes, jornadasState, turnosPlanState);
      return acc + Math.max(0, worked - expected);
    }, 0);
    return { colaboradorId: p.id, nombre: p.nombre, extraWeekly };
  });

  return {
    comas,
    surquillo,
    gastos,
    resumenPorColab,
    tardanzaTotal,
    topTarde: topTarde?.lateMin > 0 ? topTarde : null,
    comandasTotal,
    weeklyChart,
    debeTrend,
    extraHoursByUser,
    jornadaRows,
    comandasEnRango: comandasLista
  };
}

function minutesToHoursDecimal(m) {
  return Math.round((m / 60) * 100) / 100;
}

/** Agrupa `jornadaRows` + comandas para filas de planilla por persona. */
function aggregatePayrollByPerson(stats, personasList = PERSONAL_BASE) {
  const map = {};
  for (const persona of personasList) {
    map[persona.id] = {
      id: persona.id,
      nombre: persona.nombre,
      rol: persona.rol,
      sedes: persona.sedes.join(" / "),
      diasConFicha: 0,
      workedMin: 0,
      overtimeMin: 0,
      debtMin: 0,
      lateMin: 0,
      workedComasMin: 0,
      workedSurquilloMin: 0,
      comandaSoles: stats.gastos[persona.id] || 0
    };
  }
  for (const row of stats.jornadaRows || []) {
    const m = map[row.colaboradorId];
    if (!m) continue;
    m.diasConFicha += 1;
    m.workedMin += row.worked;
    m.overtimeMin += row.overtime;
    m.debtMin += row.debt;
    m.lateMin += row.lateMin;
    if (row.sede === "Comas") m.workedComasMin += row.worked;
    if (row.sede === "Surquillo") m.workedSurquilloMin += row.worked;
  }
  return personasList.map((persona) => map[persona.id]);
}

/**
 * Excel para tercero pagador: resumen por persona + detalle por día.
 * Horas netas según fichajes; comandas como referencia de adelantos/gastos registrados.
 */
function exportNominaWorkbook({ stats, desde, hasta, sourceLabel, personasList = PERSONAL_BASE }) {
  const byPerson = aggregatePayrollByPerson(stats, personasList);
  const wb = XLSX.utils.book_new();

  const summaryHeader = [
    "ID interno",
    "Nombre",
    "Rol",
    "Sedes",
    "Días con fichas",
    "Horas netas (total período)",
    "Horas extra (vs meta 8h netas/día)",
    "Déficit vs meta 8h (horas)",
    "Tardanza acumulada (min)",
    "Comandas registradas (S/)",
    "Horas netas en Comas",
    "Horas netas en Surquillo",
    "DNI / documento (completar)",
    "Notas para empresa pagadora"
  ];

  const summaryRows = byPerson.map((p) => [
    p.id,
    p.nombre,
    p.rol,
    p.sedes,
    p.diasConFicha,
    minutesToHoursDecimal(p.workedMin),
    minutesToHoursDecimal(p.overtimeMin),
    minutesToHoursDecimal(p.debtMin),
    p.lateMin,
    Number(p.comandaSoles.toFixed(2)),
    minutesToHoursDecimal(p.workedComasMin),
    minutesToHoursDecimal(p.workedSurquilloMin),
    "",
    ""
  ]);

  const wsResumen = XLSX.utils.aoa_to_sheet([
    ["Teresita · El Legado — exportación para planilla / empresa pagadora"],
    [`Origen vista: ${sourceLabel}`],
    [`Período (fechas inclusive): ${desde} → ${hasta}`],
    [`Generado: ${new Date().toLocaleString("es-PE")}`],
    [
      `Referencia sistema: meta ${GOAL_PAID_NET_MIN / 60} h netas por jornada completa; refrigerio ~${BREAK_EXPECTED_MIN} min; gracia tardanza ${GRACE_LATENESS_MIN} min.`
    ],
    ["Las horas netas salen de ingreso/salida y breaks fichados. Completar DNI y acordar descuentos con la empresa pagadora."],
    [],
    summaryHeader,
    ...summaryRows
  ]);

  const detalle = (stats.jornadaRows || [])
    .slice()
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.nombre || "").localeCompare(b.nombre || "", "es") ||
        a.colaboradorId.localeCompare(b.colaboradorId)
    )
    .map((r) => ({
      Fecha: r.fecha,
      "ID colaborador": r.colaboradorId,
      Colaborador: r.nombre,
      Sede: r.sede,
      "Horas netas": minutesToHoursDecimal(r.worked),
      "Tardanza min": r.lateMin,
      "Extra vs meta (min)": r.overtime,
      "Déficit vs meta (min)": r.debt
    }));

  const wsDetalle =
    detalle.length > 0
      ? XLSX.utils.json_to_sheet(detalle)
      : XLSX.utils.aoa_to_sheet([
          ["Sin fichas completas en este período (ingreso y salida requeridos para horas netas)."]
        ]);

  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_planilla");
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle_por_dia");

  const safe = (s) => String(s || "").replace(/[^\d\-]+/g, "_");
  XLSX.writeFile(wb, `Teresita_planilla_${safe(desde)}_${safe(hasta)}.xlsx`);
}

/** Lunes de la semana ISO del día dado (hora fija mediodía evita saltos TZ). */
function startOfWeekMondayFromIso(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthWeeksMatrix(year, month1to12) {
  const first = new Date(year, month1to12 - 1, 1);
  const lastDay = new Date(year, month1to12, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) {
    cells.push(
      `${year}-${String(month1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function shiftMonthYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Calendario de «Progreso y marcaciones»: mismas piezas visuales que Horarios · semana/mes/día. */
function SelectorFechaProgresoEquipo({
  adminEquipoVista,
  setAdminEquipoVista,
  fechaSeleccionada,
  setFechaSeleccionada,
  fechaSeleccionadaTexto,
  fechaHoy,
  moverFecha,
  adminEquipoWeekRangeLabel,
  adminEquipoWeekDays,
  shiftEquipoSemanaAdmin,
  irSemanaActualEquipoAdmin,
  adminEquipoMonth,
  setAdminEquipoMonth,
  adminEquipoMonthLabel,
  adminEquipoMonthWeeks
}) {
  return (
    <>
      <div className="mb-4 flex border-b-2 border-peruRed/10">
        <button
          type="button"
          onClick={() => setAdminEquipoVista("day")}
          className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
            adminEquipoVista === "day"
              ? "border-b-2 border-peruRed text-peruRed"
              : "text-coffee/55"
          }`}
        >
          Vista día
        </button>
        <button
          type="button"
          onClick={() => setAdminEquipoVista("week")}
          className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
            adminEquipoVista === "week"
              ? "border-b-2 border-peruRed text-peruRed"
              : "text-coffee/55"
          }`}
        >
          Vista semana
        </button>
        <button
          type="button"
          onClick={() => {
            setAdminEquipoVista("month");
            const dt = new Date(`${fechaSeleccionada}T12:00:00`);
            setAdminEquipoMonth(
              `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
            );
          }}
          className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
            adminEquipoVista === "month"
              ? "border-b-2 border-peruRed text-peruRed"
              : "text-coffee/55"
          }`}
        >
          Vista mes
        </button>
      </div>

      {adminEquipoVista === "day" && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => moverFecha(-1)}
              className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
              aria-label="Día anterior"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <p className="min-w-0 flex-1 text-center text-sm font-semibold capitalize leading-snug text-coffee">
              {fechaSeleccionadaTexto}
            </p>
            <button
              type="button"
              onClick={() => moverFecha(1)}
              className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
              aria-label="Día siguiente"
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFechaSeleccionada(fechaHoy)}
              className="rounded-xl bg-peruMustard/40 px-4 py-2 text-xs font-bold text-coffee"
            >
              Ir a hoy
            </button>
          </div>
        </div>
      )}

      {adminEquipoVista === "week" && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftEquipoSemanaAdmin(-1)}
              className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <p className="text-center text-sm font-semibold text-coffee">{adminEquipoWeekRangeLabel}</p>
            <button
              type="button"
              onClick={() => shiftEquipoSemanaAdmin(1)}
              className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
              aria-label="Semana siguiente"
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
          <div className="flex justify-between gap-1 sm:justify-center sm:gap-2">
            {adminEquipoWeekDays.map((iso) => {
              const sel = fechaSeleccionada === iso;
              const isToday = iso === fechaHoy;
              const narrow = new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
                weekday: "narrow"
              });
              return (
                <button
                  type="button"
                  key={`eq-cal-${iso}`}
                  onClick={() => setFechaSeleccionada(iso)}
                  className={`flex h-10 w-10 flex-col items-center justify-center rounded-full border-2 text-[9px] font-bold sm:h-11 sm:w-11 ${
                    sel
                      ? "border-peruRed bg-peruRed text-white"
                      : "border-peruRed/30 bg-white text-coffee"
                  } ${isToday && !sel ? "ring-2 ring-peruMustard/70 ring-offset-1" : ""}`}
                >
                  <span className="uppercase leading-none">{narrow}</span>
                  <span className="text-xs leading-none">{iso.slice(8, 10)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-coffee/75">
              Día activo: <strong className="text-coffee">{fechaSeleccionadaTexto}</strong>
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => moverFecha(-1)}
                className="rounded-lg bg-bone px-3 py-2 text-xs font-semibold text-coffee ring-1 ring-peruRed/15"
              >
                Día anterior
              </button>
              <button
                type="button"
                onClick={() => moverFecha(1)}
                className="rounded-lg bg-bone px-3 py-2 text-xs font-semibold text-coffee ring-1 ring-peruRed/15"
              >
                Día siguiente
              </button>
              <button
                type="button"
                onClick={irSemanaActualEquipoAdmin}
                className="rounded-xl bg-peruMustard/40 px-3 py-2 text-xs font-bold text-coffee"
              >
                Semana actual
              </button>
            </div>
          </div>
        </div>
      )}

      {adminEquipoVista === "month" && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-bone px-2 py-2">
            <button
              type="button"
              onClick={() => setAdminEquipoMonth((ym) => shiftMonthYm(ym, -1))}
              className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <p className="text-sm font-semibold capitalize text-coffee">{adminEquipoMonthLabel}</p>
            <button
              type="button"
              onClick={() => setAdminEquipoMonth((ym) => shiftMonthYm(ym, 1))}
              className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-coffee/55">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={`eq-sel-h-${d}`} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {adminEquipoMonthWeeks.map((week, wi) => (
              <div key={`eq-sel-mw-${wi}`} className="grid grid-cols-7 gap-1">
                {week.map((iso, di) => {
                  if (!iso) {
                    return (
                      <div
                        key={`eq-sel-e-${wi}-${di}`}
                        className="min-h-[4rem] rounded-lg bg-bone/40"
                      />
                    );
                  }
                  const sel = fechaSeleccionada === iso;
                  const hoy = iso === fechaHoy;
                  const dayList = Number(iso.slice(8, 10));
                  return (
                    <button
                      type="button"
                      key={`eq-sel-c-${iso}`}
                      onClick={() => {
                        setFechaSeleccionada(iso);
                        const dt = new Date(`${iso}T12:00:00`);
                        setAdminEquipoMonth(
                          `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
                        );
                      }}
                      className={`flex min-h-[5.25rem] flex-col rounded-lg border border-peruRed/10 p-1 text-left text-xs transition hover:bg-peruMustard/15 ${
                        sel
                          ? "bg-peruMustard/25 ring-2 ring-peruRed"
                          : hoy
                            ? "bg-white ring-2 ring-peruMustard"
                            : "bg-white"
                      }`}
                    >
                      <span className="shrink-0 font-bold leading-none">{dayList}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-coffee/75">
              Día activo: <strong className="text-coffee">{fechaSeleccionadaTexto}</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                setFechaSeleccionada(fechaHoy);
                const t = new Date();
                setAdminEquipoMonth(
                  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`
                );
              }}
              className="rounded-xl bg-peruMustard/40 px-3 py-2 text-xs font-bold text-coffee"
            >
              Mes de hoy
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function deudaTotalMinStats(stats) {
  return stats.resumenPorColab.reduce((a, p) => a + p.debt, 0);
}

/** Panel compartido: análisis por rango (marcaciones + comandas del período). */
function PanelAnalisisOperativo({
  stats,
  rangoTexto,
  onEditRango,
  onDetalle,
  onExportAdmin,
  onExportDueno,
  onEnviarReportes,
  tituloExtra
}) {
  const deudaMin = deudaTotalMinStats(stats);
  const cardBtn =
    "w-full rounded-3xl border border-peruRed/20 bg-white p-4 text-left shadow-bento transition hover:ring-2 hover:ring-peruMustard/40 focus:outline-none focus:ring-2 focus:ring-peruRed/30";

  return (
    <div className="space-y-4">
      {tituloExtra ? <p className="text-sm text-coffee/75">{tituloExtra}</p> : null}
      <div className="flex flex-col gap-3 rounded-2xl border border-peruRed/15 bg-bone/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-coffee/55">Período</p>
          <p className="text-sm font-semibold text-coffee">{rangoTexto}</p>
        </div>
        <button
          type="button"
          onClick={onEditRango}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-peruRed px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          <SlidersHorizontal size={18} aria-hidden /> Editar rango
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" className={cardBtn} onClick={() => onDetalle("horas")}>
          <p className="text-xs uppercase text-coffee/60">Horas planilla (neto)</p>
          <p className="mt-1 text-2xl font-bold text-peruRed">
            {((stats.comas + stats.surquillo) / 60).toFixed(1)}h
          </p>
          <p className="mt-1 text-xs text-coffee/70">
            Comas {(stats.comas / 60).toFixed(1)}h · Surquillo {(stats.surquillo / 60).toFixed(1)}h
          </p>
        </button>
        <button type="button" className={cardBtn} onClick={() => onDetalle("tardanza")}>
          <p className="text-xs uppercase text-coffee/60">Tardanza acumulada</p>
          <p className="mt-1 text-2xl font-bold text-peruRed">{stats.tardanzaTotal} min</p>
          <p className="mt-1 text-xs text-coffee/70">
            Más minutos: {stats.topTarde?.nombre || "—"}
          </p>
        </button>
        <button type="button" className={cardBtn} onClick={() => onDetalle("comandas")}>
          <p className="text-xs uppercase text-coffee/60">Comandas del período</p>
          <p className="mt-1 text-2xl font-bold text-peruRed">S/ {stats.comandasTotal.toFixed(2)}</p>
        </button>
        <button type="button" className={cardBtn} onClick={() => onDetalle("deuda")}>
          <p className="text-xs uppercase text-coffee/60">Meta no cubierta (deuda)</p>
          <p className="mt-1 text-2xl font-bold text-peruRed">{(deudaMin / 60).toFixed(1)} h</p>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-peruRed/20 bg-white p-5 shadow-bento">
          <h3 className="mb-2 text-lg font-bold text-peruRed">Horas por sede (por semana)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="semanaLabel" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Comas" fill="#A62121" />
                <Bar dataKey="Surquillo" fill="#D8A431" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="rounded-3xl border border-peruRed/20 bg-white p-5 shadow-bento">
          <h3 className="mb-2 text-lg font-bold text-peruRed">Debe horas (tendencia semanal)</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.debeTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="semanaLabel" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="DebeHoras" stroke="#A62121" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <button
            type="button"
            onClick={() => onDetalle("deuda")}
            className="mt-2 text-xs font-semibold text-peruRed underline"
          >
            Ver desglose de deuda por colaborador
          </button>
        </article>
      </div>

      <article className="rounded-3xl border border-peruRed/20 bg-white p-5 shadow-bento">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-peruRed">
          <Coffee size={18} aria-hidden /> Comandas por colaborador (período)
        </h3>
        <ul className="space-y-2 text-sm">
          {stats.resumenPorColab.map((p) => (
            <li key={p.id} className="flex justify-between rounded-xl bg-bone p-2">
              <span>{p.nombre}</span>
              <span>S/ {(stats.gastos[p.id] || 0).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-xl bg-bone p-2 text-xs">
          {stats.extraHoursByUser.map((u) => (
            <p key={u.colaboradorId}>
              {u.nombre}: Horas extra semanales (acumulado en rango) {formatMinutes(u.extraWeekly)}
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {onExportAdmin ? (
            <button
              type="button"
              onClick={onExportAdmin}
              className="inline-flex items-center gap-2 rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
            >
              <FileSpreadsheet size={16} aria-hidden /> Excel (Administrador)
            </button>
          ) : null}
          {onExportDueno ? (
            <button
              type="button"
              onClick={onExportDueno}
              className="inline-flex items-center gap-2 rounded-xl bg-peruMustard px-3 py-2 text-sm font-semibold text-coffee"
            >
              <FileSpreadsheet size={16} aria-hidden /> Excel (Dueño)
            </button>
          ) : null}
          {onEnviarReportes ? (
            <button
              type="button"
              onClick={onEnviarReportes}
              className="inline-flex items-center gap-2 rounded-xl border border-peruRed/25 bg-white px-3 py-2 text-sm font-semibold text-coffee"
            >
              <Mail size={16} aria-hidden /> Enviar reportes
            </button>
          ) : null}
        </div>
      </article>
    </div>
  );
}

const DIAS_LIBRES_DEFAULT_ANUAL = 12;

function anioCalendarioActual() {
  return new Date().getFullYear();
}

function resumenDiasLibres(workerId, solicitudes, quotaMap) {
  const year = String(anioCalendarioActual());
  const anuales = Number(quotaMap?.[workerId]?.anuales) || DIAS_LIBRES_DEFAULT_ANUAL;
  const delAnio = solicitudes.filter(
    (s) =>
      s.colaboradorId === workerId &&
      s.tipo === "dia_libre" &&
      String(s.fecha || "").startsWith(year)
  );
  const aprobados = delAnio.filter((s) => s.status === "aprobada");
  const pendientesLista = delAnio.filter((s) => s.status === "pendiente");
  const usados = aprobados.length;
  const sobrantes = Math.max(0, anuales - usados - pendientesLista.length);
  return {
    anuales,
    usados,
    pendientes: pendientesLista.length,
    sobrantes,
    aprobados,
    pendientesLista,
    historial: [...delAnio].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  };
}

function etiquetaTipoSolicitud(tipo) {
  if (tipo === "dia_libre") return "Día libre";
  if (tipo === "cambio_turno") return "Cambio de turno";
  return "Otro";
}

function etiquetaEstadoSolicitud(status) {
  if (status === "aprobada") return "Aprobada";
  if (status === "rechazada") return "Rechazada";
  return "Pendiente";
}

/** Ayuda mínima — flujo de trabajo (botón ?). */
const AYUDA_ASISTENCIA = {
  personal: [
    "1. Acceso: tu nombre + PIN de 6 dígitos (nuevo: enlace del correo primero).",
    "2. Fichaje: Ingreso → Refrigerio inicio/fin → Salida. Elige sede si tienes Comas y Surquillo.",
    "3. Horarios: Programado = plan del admin; Fichado = ya marcaste. «Cambio del día» = excepción de esa fecha.",
    `4. Tardanza: gracia ${GRACE_LATENESS_MIN} min; después cuenta minutos tarde vs hora programada.`,
    "5. Comandas: solo lectura; el admin las registra.",
    "6. Organización: días libre del año, tus solicitudes y avisos de cambios de horario."
  ],
  administrador: [
    "1. Equipo: horarios por colaborador, plan por rango y marcaciones del día.",
    "2. Avisos: horas extra, solicitudes de días libre y cambios de horario.",
    "3. Mi marcación: tu fichaje como administrador.",
    "4. Comandas: boleta + foto + PIN gerente.",
    "5. Análisis / Excel: rango de fechas y descarga planilla.",
    "Historial de ediciones visible en todas las pestañas."
  ]
};

function HistorialEdicionesAdmin({ historialPorColab, personas }) {
  return (
    <article className="rounded-[1.25rem] border border-peruRed/10 bg-white/95 p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-bold text-peruRed">Historial de ediciones</h3>
      <div className="max-h-56 space-y-2 overflow-auto text-sm">
        {Object.keys(historialPorColab).length === 0 ? (
          <p className="text-coffee/70">Sin ediciones registradas.</p>
        ) : (
          Object.entries(historialPorColab).map(([colabId, rows]) => {
            const colab = personas.find((p) => p.id === colabId);
            return (
              <div key={colabId} className="rounded-xl bg-bone/90 p-3">
                <p className="font-semibold">{colab?.nombre}</p>
                {rows.map((r) => (
                  <p key={r.id} className="text-xs">
                    {r.fecha} — {r.detalleHoras || r.nuevaHora} — {r.justificacion} — {r.evidencia}
                  </p>
                ))}
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

export default function App() {
  const supa = useTeresitaSupabase();
  const [restaurantBranding, setRestaurantBranding] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function syncBranding() {
      const localBranding = applyPendingBranding(supa.companyId);
      setRestaurantBranding(localBranding);
      if (!supa.companyId || !localBranding?.image?.startsWith("data:")) return;
      try {
        const publicUrl = await uploadCompanyBranding(supa.companyId, localBranding.image);
        if (!cancelled && publicUrl) {
          const synced = { image: publicUrl };
          saveBranding(supa.companyId, synced);
          setRestaurantBranding(synced);
        }
      } catch (error) {
        console.warn("Restaurant branding upload skipped:", error);
      }
    }
    syncBranding();
    return () => {
      cancelled = true;
    };
  }, [supa.companyId]);
  // Full page load always starts on Personal. Admin is never restored from localStorage;
  // manager PIN must be entered again after refresh (unlock does not survive reload).
  const [vista, setVista] = useState("staff");
  const [reloj, setReloj] = useState(new Date());
  const [filtroSede, setFiltroSede] = useState("Todas");
  const [mensaje, setMensaje] = useState("Sistema listo para Teresita: El Legado.");
  const [marcaciones, setMarcaciones] = useState(() => readLS(LS_KEYS.marcaciones, []));
  const [auditLog, setAuditLog] = useState(() => readLS(LS_KEYS.auditLog, []));
  const [historialPorColab, setHistorialPorColab] = useState(() => readLS(LS_KEYS.historialEdicion, {}));
  const [jornadas, setJornadas] = useState(() => readLS(LS_KEYS.jornadas, JORNADAS_BASE));
  const [turnosPlan, setTurnosPlan] = useState(() => readLS(LS_KEYS.turnosPlan, {}));
  const [staffPanel, setStaffPanel] = useState(() => readLS(LS_KEYS.staffPanel, "resumen"));
  const [staffAccess, setStaffAccess] = useState(() =>
    readLS(LS_KEYS.staffAccess, {
      staffId: "c1",
      pinValid: false
    })
  );
  /** Ancho relativo columna izquierda (Pulse) en vista Personal ≥ lg. */
  const [staffPaneLeftPct, setStaffPaneLeftPct] = useState(() => {
    const v = readLS(LS_KEYS.staffPaneSplit, 66);
    const n = typeof v === "number" && !Number.isNaN(v) ? v : 66;
    return Math.min(82, Math.max(30, n));
  });
  const staffLayoutRef = useRef(null);
  const [staffSplitDesktop, setStaffSplitDesktop] = useState(false);
  const [scheduleScope, setScheduleScope] = useState("solo");
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() =>
    startOfWeekMondayFromIso(new Date().toISOString().slice(0, 10))
  );
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0);
  const [scheduleListMode, setScheduleListMode] = useState("week");
  const [adminPlanView, setAdminPlanView] = useState("week");
  const [adminPlanWeekStart, setAdminPlanWeekStart] = useState(() =>
    startOfWeekMondayFromIso(new Date().toISOString().slice(0, 10))
  );
  const [adminPlanDayIndex, setAdminPlanDayIndex] = useState(0);
  const [adminPlanMonth, setAdminPlanMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [adminHorariosPanel, setAdminHorariosPanel] = useState("calendario");
  const [adminEquipoPanel, setAdminEquipoPanel] = useState("horarios");
  const [adminEquipoDiaTab, setAdminEquipoDiaTab] = useState("progreso");
  /** Coherente con Horarios: día = un día a la vez; semana = franja + 7 círculos; mes = rejilla mensual. */
  const [adminEquipoVista, setAdminEquipoVista] = useState("week");
  const [adminEquipoMonth, setAdminEquipoMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [adminPlantillaBaseAbierto, setAdminPlantillaBaseAbierto] = useState(false);
  const [adminVistaColabId, setAdminVistaColabId] = useState("c1");
  const [adminVistaColabMonth, setAdminVistaColabMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [adminMesSeleccionModo, setAdminMesSeleccionModo] = useState(false);
  const [adminMesFechasSel, setAdminMesFechasSel] = useState([]);
  const [modalBulkPlan, setModalBulkPlan] = useState({
    open: false,
    colaboradorId: "c1",
    sede: "Comas",
    plantillaTurnoId: "manana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45",
    fechaDesde: "",
    fechaHasta: "",
    omitirFinDeSemana: true,
    fechasPreset: null,
    code: ""
  });
  const [modalQuitarPlanDia, setModalQuitarPlanDia] = useState({
    open: false,
    colaboradorId: "",
    nombre: "",
    fecha: "",
    code: ""
  });
  const [modalPlan, setModalPlan] = useState({
    open: false,
    colaboradorId: "c1",
    sede: "Comas",
    fecha: "",
    plantillaTurnoId: "manana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45",
    code: ""
  });
  const [modalJornadaTpl, setModalJornadaTpl] = useState({
    open: false,
    colaboradorId: "c1",
    sede: "Comas",
    plantillaTurnoId: "manana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45",
    code: ""
  });
  const [modalEliminarJornadaTpl, setModalEliminarJornadaTpl] = useState({
    open: false,
    colaboradorId: "",
    sede: "",
    code: ""
  });
  const [sedeTurno, setSedeTurno] = useState(() => readLS(LS_KEYS.sedeTurno, "Comas"));
  const [mostrarHistorialGlobal, setMostrarHistorialGlobal] = useState(false);
  const [ayudaAsistenciaAbierta, setAyudaAsistenciaAbierta] = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [comandasLista, setComandasLista] = useState(() => readLS(LS_KEYS.comandas, []));
  const [adminTab, setAdminTab] = useState(() => {
    const t = readLS(LS_KEYS.adminTab, "equipo");
    if (t === "horarios") return "equipo";
    return t;
  });
  const [analisisAdminRango, setAnalisisAdminRango] = useState(() => {
    const s = readLS(LS_KEYS.analisisRangoAdmin, null);
    return s?.desde && s?.hasta ? s : defaultAnalisisMonthRange();
  });
  const [modalAnalisisRango, setModalAnalisisRango] = useState({
    open: false,
    scope: "admin",
    desde: "",
    hasta: ""
  });
  const [detalleAnalisis, setDetalleAnalisis] = useState({
    open: false,
    scope: "admin",
    tipo: "horas"
  });
  const [formaComanda, setFormaComanda] = useState({
    colaboradorId: "c1",
    sede: "Comas",
    monto: "",
    concepto: "",
    numeroBoleta: "",
    fotoNombre: "",
    fotoDataUrl: "",
    fechaRegistro: new Date().toISOString().slice(0, 10)
  });
  const [modalEdit, setModalEdit] = useState({
    open: false,
    colab: null,
    step: "verify",
    code: "",
    horaIngreso: "",
    horaBreakIn: "",
    horaBreakOut: "",
    horaSalida: ""
  });
  const [motivoEdit, setMotivoEdit] = useState("");
  const [evidenciaEdit, setEvidenciaEdit] = useState(null);
  const [staffPinInput, setStaffPinInput] = useState("");
  const [colaboradoresExtra, setColaboradoresExtra] = useState(() =>
    readLS(LS_KEYS.colaboradoresExtra, [])
  );
  const [staffPinsCustom, setStaffPinsCustom] = useState(() => readLS(LS_KEYS.staffPinsCustom, {}));
  const [staffInvites, setStaffInvites] = useState(() => readLS(LS_KEYS.staffInvites, {}));
  const [staffComandasMesYm, setStaffComandasMesYm] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [modalAltaColab, setModalAltaColab] = useState({
    open: false,
    nombre: "",
    apellido: "",
    email: "",
    whatsappCountry: "+51",
    whatsappNumber: "",
    fechaNacimiento: "",
    direccion: "",
    contactoEmergenciaNombre: "",
    emergCountry: "+51",
    emergNumber: "",
    plantillaTurnoId: "manana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45",
    horario: "07:00",
    diasLibresAnuales: String(DIAS_LIBRES_DEFAULT_ANUAL),
    comas: true,
    surquillo: false,
    formError: ""
  });
  const [modalCrearPin, setModalCrearPin] = useState({
    open: false,
    token: "",
    colaboradorId: "",
    nombre: "",
    pin: "",
    pin2: ""
  });
  const invitePinHandledRef = useRef(false);
  const pinGerentePromiseRef = useRef(null);
  const scrollByVistaRef = useRef({ staff: 0, admin: 0 });
  const adminNavRef = useRef(null);
  const [modalPinGerente, setModalPinGerente] = useState({ open: false, title: "", pin: "" });
  const [modalWorkerCreado, setModalWorkerCreado] = useState({
    open: false,
    nombre: "",
    email: "",
    link: "",
    adminNotified: "",
    /** "sent" | "failed" — never claim email success without ok:true from Resend path */
    emailStatus: "failed",
    emailError: ""
  });
  const [modalDeleteWorker, setModalDeleteWorker] = useState({
    open: false,
    workerId: "",
    nombre: "",
    step: "request",
    code: "",
    devHint: "",
    emailSent: false
  });
  const [modalTrabajadorInfo, setModalTrabajadorInfo] = useState({
    open: false,
    editing: false,
    workerId: "",
    nombre: "",
    email: "",
    whatsappCountry: "+51",
    whatsappNumber: "",
    fechaNacimiento: "",
    direccion: "",
    emergNombre: "",
    emergCountry: "+51",
    emergNumber: "",
    plantillaTurnoId: "manana",
    ingreso: "07:00",
    salida: "15:00",
    refrigerioInicio: "12:00",
    refrigerioFin: "12:45",
    horario: "07:00",
    comas: true,
    surquillo: false,
    supabaseWorker: false
  });
  const [modalSalidaNota, setModalSalidaNota] = useState({ open: false, nota: "" });
  const [overtimePendiente, setOvertimePendiente] = useState(() =>
    readLS(LS_KEYS.overtimePendiente, [])
  );
  const [overtimeAjustes, setOvertimeAjustes] = useState(() => readLS(LS_KEYS.overtimeAjustes, []));
  const [solicitudes, setSolicitudes] = useState(() => readLS(LS_KEYS.solicitudes, []));
  const [notificaciones, setNotificaciones] = useState(() => readLS(LS_KEYS.notificaciones, []));
  const [diasLibresQuota, setDiasLibresQuota] = useState(() => readLS(LS_KEYS.diasLibresQuota, {}));
  const [centroAvisosTab, setCentroAvisosTab] = useState("extra");
  const [modalAprobarExtra, setModalAprobarExtra] = useState({
    open: false,
    itemId: "",
    minutosAprobar: "",
    fechaCompensacion: ""
  });
  const [modalSolicitudStaff, setModalSolicitudStaff] = useState({
    open: false,
    tipo: "dia_libre",
    fecha: "",
    detalle: ""
  });
  const [actionBusy, setActionBusy] = useState({});
  const actionLocksRef = useRef(new Set());

  const personas = useMemo(() => {
    if (supa.enabled) {
      return supa.workers;
    }
    return [...PERSONAL_BASE, ...colaboradoresExtra];
  }, [supa.enabled, supa.workers, colaboradoresExtra]);

  const staffDisponibles = useMemo(() => {
    const base =
      supa.enabled && supa.staffWorkers.length > 0
        ? supa.staffWorkers
        : personas.filter((p) => p.rol !== "Administrador" && p.rol !== "Dueño");
    return base;
  }, [supa.enabled, supa.staffWorkers, personas]);
  const staffSesionPersona = useMemo(
    () => staffDisponibles.find((p) => p.id === staffAccess.staffId) ?? staffDisponibles[0],
    [staffDisponibles, staffAccess.staffId]
  );

  const colaboradorActivo = useMemo(() => {
    const fallback = {
      id: "sin-asignar",
      nombre: "Sin asignar",
      rol: "Personal",
      sedes: ["Comas", "Surquillo"],
      horario: "08:00"
    };
    if (vista === "admin") {
      if (supa.enabled && supa.profile) {
        return {
          id: supa.profile.id,
          nombre: supa.profile.full_name || supa.companyName || "Administrador",
          rol: "Administrador",
          sedes: ["Comas", "Surquillo"],
          horario: "08:00"
        };
      }
      return (
        personas.find((p) => p.rol === "Administrador") ??
        personas[0] ??
        { ...fallback, rol: "Administrador", nombre: supa.companyName || "Administrador" }
      );
    }
    return staffSesionPersona ?? fallback;
  }, [vista, staffSesionPersona, personas, supa.enabled, supa.profile, supa.companyName]);
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const horaActual = nowHHMM(reloj);
  const fechaLarga = reloj.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
  const saludo = `Hola ${colaboradorActivo.nombre}, hoy es ${fechaLarga}.`;
  const fechasCarrusel = useMemo(() => {
    const base = new Date(`${fechaSeleccionada}T00:00:00`);
    return [-2, -1, 0, 1, 2].map((delta) => {
      const d = new Date(base);
      d.setDate(d.getDate() + delta);
      return {
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "2-digit" }),
        esHoy: d.toISOString().slice(0, 10) === fechaHoy
      };
    });
  }, [fechaSeleccionada, fechaHoy]);

  const fechaSeleccionadaTexto = useMemo(() => {
    const d = new Date(`${fechaSeleccionada}T00:00:00`);
    return d.toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }, [fechaSeleccionada]);

  /** Semana (lun–dom) que contiene la fecha activa del equipo admin; alineada con Horarios · vista semana. */
  const adminEquipoWeekStart = useMemo(
    () => startOfWeekMondayFromIso(fechaSeleccionada),
    [fechaSeleccionada]
  );
  const adminEquipoWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(adminEquipoWeekStart, i)),
    [adminEquipoWeekStart]
  );
  const adminEquipoWeekRangeLabel = useMemo(() => {
    const a = new Date(`${adminEquipoWeekDays[0]}T12:00:00`);
    const b = new Date(`${adminEquipoWeekDays[6]}T12:00:00`);
    const l1 = a.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
    const l2 = b.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    return `${l1} – ${l2}`;
  }, [adminEquipoWeekDays]);

  const adminEquipoMonthWeeks = useMemo(() => {
    const [y, m] = adminEquipoMonth.split("-").map(Number);
    return monthWeeksMatrix(y, m);
  }, [adminEquipoMonth]);

  const adminEquipoMonthLabel = useMemo(() => {
    const [y, m] = adminEquipoMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-PE", {
      month: "long",
      year: "numeric"
    });
  }, [adminEquipoMonth]);

  const scheduleWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(scheduleWeekStart, i)),
    [scheduleWeekStart]
  );

  const scheduleWeekRangeLabel = useMemo(() => {
    const a = new Date(`${scheduleWeekDays[0]}T12:00:00`);
    const b = new Date(`${scheduleWeekDays[6]}T12:00:00`);
    const l1 = a.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
    const l2 = b.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    return `${l1} – ${l2}`;
  }, [scheduleWeekDays]);

  const personasHorarioCal = useMemo(
    () => (scheduleScope === "solo" ? [colaboradorActivo] : personas),
    [scheduleScope, colaboradorActivo, personas]
  );

  const scheduleFocusDay =
    scheduleWeekDays[Math.min(scheduleDayIndex, scheduleWeekDays.length - 1)] ?? scheduleWeekDays[0];

  const shiftsByDayWeek = useMemo(
    () =>
      scheduleWeekDays.map((iso) => ({
        iso,
        header: new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }),
        shifts: shiftsPlannedForDate(iso, personasHorarioCal, jornadas, turnosPlan)
      })),
    [scheduleWeekDays, personasHorarioCal, jornadas, turnosPlan]
  );

  const shiftsDayView = useMemo(
    () => shiftsPlannedForDate(scheduleFocusDay, personasHorarioCal, jornadas, turnosPlan),
    [scheduleFocusDay, personasHorarioCal, jornadas, turnosPlan]
  );

  const jornadaActiva = useMemo(
    () =>
      getJornadaPlanificada(
        colaboradorActivo.id,
        sedeTurno,
        fechaHoy,
        jornadas,
        turnosPlan,
        colaboradorActivo.horario,
        "17:00"
      ),
    [colaboradorActivo.id, colaboradorActivo.horario, sedeTurno, fechaHoy, jornadas, turnosPlan]
  );

  const sedeProgramadaHoy = useMemo(() => {
    if (!colaboradorActivo?.id || colaboradorActivo.id === "sin-asignar") return null;
    return effectiveSedeForPersonDate(colaboradorActivo, fechaHoy, jornadas, turnosPlan);
  }, [colaboradorActivo, fechaHoy, jornadas, turnosPlan]);

  const sedeDistintaProgramada =
    Boolean(
      sedeProgramadaHoy &&
        sedeTurno &&
        sedeProgramadaHoy !== sedeTurno &&
        colaboradorActivo.sedes?.includes(sedeTurno)
    );

  const adminPlanWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(adminPlanWeekStart, i)),
    [adminPlanWeekStart]
  );

  const adminPlanFocusDay =
    adminPlanWeekDays[Math.min(adminPlanDayIndex, adminPlanWeekDays.length - 1)] ??
    adminPlanWeekDays[0];

  const adminPlanMonthWeeks = useMemo(() => {
    const [y, m] = adminPlanMonth.split("-").map(Number);
    return monthWeeksMatrix(y, m);
  }, [adminPlanMonth]);

  const adminPlanMonthLabel = useMemo(() => {
    const [y, m] = adminPlanMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-PE", {
      month: "long",
      year: "numeric"
    });
  }, [adminPlanMonth]);

  const adminPlanWeekRangeLabel = useMemo(() => {
    const a = new Date(`${adminPlanWeekDays[0]}T12:00:00`);
    const b = new Date(`${adminPlanWeekDays[6]}T12:00:00`);
    const l1 = a.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
    const l2 = b.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    return `${l1} – ${l2}`;
  }, [adminPlanWeekDays]);

  useEffect(() => {
    const id = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysIso(scheduleWeekStart, i));
    const idx = days.findIndex((d) => d === fechaHoy);
    setScheduleDayIndex(idx >= 0 ? idx : 0);
  }, [scheduleWeekStart, fechaHoy]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.marcaciones, JSON.stringify(marcaciones));
  }, [marcaciones]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.auditLog, JSON.stringify(auditLog));
  }, [auditLog]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.historialEdicion, JSON.stringify(historialPorColab));
  }, [historialPorColab]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.jornadas, JSON.stringify(jornadas));
  }, [jornadas]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.turnosPlan, JSON.stringify(turnosPlan));
  }, [turnosPlan]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.overtimePendiente, JSON.stringify(overtimePendiente));
  }, [overtimePendiente]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.overtimeAjustes, JSON.stringify(overtimeAjustes));
  }, [overtimeAjustes]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.solicitudes, JSON.stringify(solicitudes));
  }, [solicitudes]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.notificaciones, JSON.stringify(notificaciones));
  }, [notificaciones]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.diasLibresQuota, JSON.stringify(diasLibresQuota));
  }, [diasLibresQuota]);

  /** Fecha activa = hoy al fichar desde Administrador → Mi marcación (coincide con registrarMarcacion). */
  useEffect(() => {
    if (vista === "admin" && adminTab === "marcacion") {
      setFechaSeleccionada(fechaHoy);
    }
  }, [vista, adminTab, fechaHoy]);

  useEffect(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysIso(adminPlanWeekStart, i));
    const idx = days.findIndex((d) => d === fechaHoy);
    setAdminPlanDayIndex(idx >= 0 ? idx : 0);
  }, [adminPlanWeekStart, fechaHoy]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.sedeTurno, JSON.stringify(sedeTurno));
  }, [sedeTurno]);

  const staffSedeAutoKeyRef = useRef("");

  useEffect(() => {
    if (vista !== "staff" || !staffAccess.pinValid) return;
    if (!colaboradorActivo?.sedes?.length) return;
    const autoKey = `${colaboradorActivo.id}:${fechaHoy}:${staffAccess.pinValid}`;
    if (staffSedeAutoKeyRef.current === autoKey) return;
    staffSedeAutoKeyRef.current = autoKey;
    const prog = effectiveSedeForPersonDate(colaboradorActivo, fechaHoy, jornadas, turnosPlan);
    const next =
      prog && colaboradorActivo.sedes.includes(prog) ? prog : colaboradorActivo.sedes[0];
    setSedeTurno(next);
  }, [
    staffAccess.pinValid,
    colaboradorActivo,
    fechaHoy,
    jornadas,
    turnosPlan,
    vista
  ]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.staffPanel, JSON.stringify(staffPanel));
  }, [staffPanel]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.staffAccess, JSON.stringify(staffAccess));
  }, [staffAccess]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.staffPaneSplit, JSON.stringify(staffPaneLeftPct));
  }, [staffPaneLeftPct]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.colaboradoresExtra, JSON.stringify(colaboradoresExtra));
  }, [colaboradoresExtra]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.staffPinsCustom, JSON.stringify(staffPinsCustom));
  }, [staffPinsCustom]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.staffInvites, JSON.stringify(staffInvites));
  }, [staffInvites]);

  useEffect(() => {
    if (invitePinHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("crear-pin");
    if (!token) return;
    invitePinHandledRef.current = true;

    (async () => {
      if (supa.enabled) {
        try {
          const info = await getInviteForPinSetup(token);
          if (!info?.valid) {
            const msg =
              info?.reason === "used"
                ? "Este enlace ya fue usado."
                : info?.reason === "expired"
                  ? "El enlace expiró. Pide a gerencia un nuevo correo."
                  : "Enlace de creación de PIN inválido.";
            setMensaje(msg);
            window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
            return;
          }
          if (info.company_id) {
            localStorage.setItem(LS_COMPANY_ID, info.company_id);
            await supa.refreshStaffWorkers(info.company_id);
          }
          setModalCrearPin({
            open: true,
            token,
            colaboradorId: info.worker_id,
            nombre: info.nombre,
            pin: "",
            pin2: ""
          });
        } catch {
          setMensaje("No se pudo validar la invitación.");
          window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        }
        return;
      }

      const inv = staffInvites[token];
      if (!inv || inv.used) {
        setMensaje("Enlace de creación de PIN inválido o ya utilizado.");
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        return;
      }
      const col = personas.find((p) => p.id === inv.colaboradorId);
      if (!col) {
        setMensaje("El colaborador de esta invitación ya no está en el equipo.");
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        return;
      }
      setModalCrearPin({
        open: true,
        token,
        colaboradorId: inv.colaboradorId,
        nombre: col.nombre,
        pin: "",
        pin2: ""
      });
    })();
  }, [supa.enabled, staffInvites, personas]);

  useEffect(() => {
    if (staffDisponibles.length === 0) return;
    if (!staffDisponibles.some((p) => p.id === staffAccess.staffId)) {
      setStaffAccess((prev) => ({
        ...prev,
        staffId: staffDisponibles[0].id,
        pinValid: false
      }));
    }
  }, [staffDisponibles, staffAccess.staffId]);

  useEffect(() => {
    if (!supa.enabled || !supa.session) return;
    (async () => {
      try {
        const [m, c] = await Promise.all([loadMarcacionesCompany(), loadComandasCompany()]);
        setMarcaciones(m);
        setComandasLista(c);
      } catch {
        /* keep local cache if load fails */
      }
    })();
  }, [supa.enabled, supa.session, supa.workers.length]);

  useEffect(() => {
    if (!supa.enabled || !staffAccess.pinValid || !supa.companyId || !colaboradorActivo?.id) return;
    if (vista !== "staff") return;
    (async () => {
      try {
        const m = await loadMarcacionesWorker(supa.companyId, colaboradorActivo.id);
        setMarcaciones((prev) => {
          const otros = prev.filter((x) => x.colaboradorId !== colaboradorActivo.id);
          return [...m, ...otros];
        });
      } catch {
        /* ignore */
      }
    })();
  }, [
    supa.enabled,
    staffAccess.pinValid,
    supa.companyId,
    colaboradorActivo?.id,
    vista
  ]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setStaffSplitDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    clearAdminUnlock();
    setVista("staff");

    // Safari may restore the tab from back-forward cache with admin still selected.
    const onPageShow = (event) => {
      if (!event.persisted) return;
      clearAdminUnlock();
      setVista("staff");
      setMensaje("Sistema listo para Teresita: El Legado.");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    // Never persist admin — reload must open Personal and re-ask manager PIN.
    localStorage.setItem(LS_KEYS.vista, JSON.stringify("staff"));
  }, [vista]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.comandas, JSON.stringify(comandasLista));
  }, [comandasLista]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.adminTab, JSON.stringify(adminTab));
  }, [adminTab]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.analisisRangoAdmin, JSON.stringify(analisisAdminRango));
  }, [analisisAdminRango]);

  const marcacionesDiaSel = useMemo(
    () =>
      marcaciones.filter(
        (m) => m.colaboradorId === colaboradorActivo.id && m.fecha === fechaSeleccionada
      ),
    [marcaciones, colaboradorActivo.id, fechaSeleccionada]
  );

  const marcacionesFichaHoy = useMemo(
    () =>
      marcaciones.filter(
        (m) => m.colaboradorId === colaboradorActivo.id && m.fecha === fechaHoy
      ),
    [marcaciones, colaboradorActivo.id, fechaHoy]
  );

  const comandasStaffMes = useMemo(() => {
    if (!staffComandasMesYm) return [];
    return comandasLista
      .filter(
        (c) =>
          c.colaboradorId === colaboradorActivo.id &&
          c.fecha &&
          c.fecha.startsWith(staffComandasMesYm)
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.id).localeCompare(String(a.id)));
  }, [comandasLista, colaboradorActivo.id, staffComandasMesYm]);

  const totalComandasStaffMes = useMemo(
    () => comandasStaffMes.reduce((sum, c) => sum + (Number(c.monto) || 0), 0),
    [comandasStaffMes]
  );

  const staffComandasMesLabel = useMemo(() => {
    const parts = staffComandasMesYm.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    if (!y || !m) return "";
    return new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  }, [staffComandasMesYm]);

  const accionesPermitidas = useMemo(
    () => allowedMarcacionActions(marcacionesFichaHoy),
    [marcacionesFichaHoy]
  );

  const siguiente = useMemo(
    () => nextMarcacionAction(marcacionesFichaHoy),
    [marcacionesFichaHoy]
  );

  const resumenStaff = useMemo(
    () =>
      daySummary(marcacionesDiaSel, jornadaActiva, {
        finalize: fechaSeleccionada < fechaHoy
      }),
    [marcacionesDiaSel, jornadaActiva, fechaSeleccionada, fechaHoy]
  );

  const resumenSemanaStaff = useMemo(() => {
    const lunes = startOfWeekMondayFromIso(fechaHoy);
    const worked = workedWeekMinutesForPerson(
      colaboradorActivo.id,
      lunes,
      fechaHoy,
      marcaciones,
      jornadas,
      turnosPlan,
      personas
    );
    const expected = expectedWeekMinutesForPerson(
      colaboradorActivo,
      lunes,
      jornadas,
      turnosPlan
    );
    return { worked, expected, lunes };
  }, [colaboradorActivo, fechaHoy, marcaciones, jornadas, turnosPlan, personas]);

  const staffSede = useMemo(() => {
    if (filtroSede === "Todas") return personas;
    return personas.filter((p) => p.sedes.includes(filtroSede));
  }, [filtroSede, personas]);

  const staffFiltradoAdmin = useMemo(() => staffSede, [staffSede]);

  /** Dueño no tiene plantilla propia; planificación y jornadas fijas solo para operación + administrador. */
  const staffFiltradoAdminOperativo = useMemo(
    () => staffFiltradoAdmin.filter((p) => p.rol !== "Dueño"),
    [staffFiltradoAdmin]
  );

  const adminVistaColabMesLabel = useMemo(() => {
    const [y, m] = adminVistaColabMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  }, [adminVistaColabMonth]);

  const adminVistaColabPersona = useMemo(
    () => personas.find((x) => x.id === adminVistaColabId),
    [adminVistaColabId, personas]
  );

  const adminVistaColabMesDias = useMemo(() => {
    const p = adminVistaColabPersona;
    if (!p) return [];
    const [y, m] = adminVistaColabMonth.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const rows = [];
    for (let d = 1; d <= last; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      rows.push({ iso, row: effectiveShiftRowForPersonDate(p, iso, jornadas, turnosPlan) });
    }
    return rows;
  }, [adminVistaColabPersona, adminVistaColabMonth, jornadas, turnosPlan]);

  useEffect(() => {
    if (
      staffFiltradoAdminOperativo.length > 0 &&
      !staffFiltradoAdminOperativo.some((x) => x.id === adminVistaColabId)
    ) {
      setAdminVistaColabId(staffFiltradoAdminOperativo[0].id);
    }
  }, [staffFiltradoAdminOperativo, adminVistaColabId]);

  const adminAnalisisStats = useMemo(
    () =>
      computeDashboardStats(
        marcaciones,
        jornadas,
        turnosPlan,
        comandasLista,
        analisisAdminRango.desde,
        analisisAdminRango.hasta,
        personas
      ),
    [marcaciones, jornadas, turnosPlan, comandasLista, analisisAdminRango, personas]
  );

  function abrirModalRangoAnalisis(scope = "admin") {
    const r = analisisAdminRango;
    setModalAnalisisRango({ open: true, scope, desde: r.desde, hasta: r.hasta });
  }

  function guardarModalRangoAnalisis() {
    const { scope, desde, hasta } = modalAnalisisRango;
    if (!desde?.trim() || !hasta?.trim() || desde > hasta) {
      setMensaje("Rango inválido: revisa las fechas (desde ≤ hasta).");
      return;
    }
    setAnalisisAdminRango({ desde, hasta });
    setModalAnalisisRango((m) => ({ ...m, open: false }));
    addAudit(
      "Análisis · período",
      `Administrador: ${desde} → ${hasta}`
    );
    setMensaje(`Período de análisis actualizado: ${formatoRangoHumano(desde, hasta)}.`);
  }

  const detalleStatsView = useMemo(
    () => adminAnalisisStats,
    [adminAnalisisStats]
  );

  const detalleRangoView = useMemo(
    () => analisisAdminRango,
    [analisisAdminRango]
  );

  const progresoPersonal = useMemo(() => {
    return personas.map((p) => {
      const eventos = marcaciones.filter((m) => m.colaboradorId === p.id && m.fecha === fechaSeleccionada);
      const sede = eventos[0]?.sede || p.sedes[0];
      const jornada = getJornadaPlanificada(
        p.id,
        sede,
        fechaSeleccionada,
        jornadas,
        turnosPlan,
        p.horario,
        "17:00"
      );
      const resumen = daySummary(eventos, jornada, { finalize: fechaSeleccionada < fechaHoy });
      const goal = resumen.goalNet || scheduledNetMinutes(jornada);
      const progress = Math.min(100, Math.round((resumen.worked / Math.max(goal, 1)) * 100));
      const lateLive =
        fechaSeleccionada >= fechaHoy
          ? tardanzaGuardadaEnEventos(eventos)
          : resumen.lateMin;
      return {
        id: p.id,
        nombre: p.nombre,
        rol: p.rol,
        sede,
        worked: resumen.worked,
        debt: resumen.debt,
        overtime: resumen.overtime,
        goalNet: goal,
        late: lateLive,
        progress
      };
    });
  }, [marcaciones, fechaSeleccionada, fechaHoy, jornadas, turnosPlan, personas]);

  const avisosPendientesCount = useMemo(() => {
    const extra = overtimePendiente.filter((o) => o.status === "pendiente").length;
    const sol = solicitudes.filter((s) => s.status === "pendiente").length;
    return extra + sol;
  }, [overtimePendiente, solicitudes]);

  const staffDiasLibres = useMemo(
    () => resumenDiasLibres(colaboradorActivo.id, solicitudes, diasLibresQuota),
    [colaboradorActivo.id, solicitudes, diasLibresQuota]
  );

  const misNotificacionesStaff = useMemo(() => {
    const id = colaboradorActivo.id;
    return notificaciones
      .filter((n) => !n.colaboradorId || n.colaboradorId === id)
      .slice(0, 40);
  }, [notificaciones, colaboradorActivo.id]);

  const staffNotifNoLeidas = useMemo(
    () => misNotificacionesStaff.filter((n) => !n.leida).length,
    [misNotificacionesStaff]
  );

  function pushNotificacion(tipo, titulo, detalle, refId, colaboradorId = null) {
    const entry = {
      id: crypto.randomUUID(),
      tipo,
      titulo,
      detalle,
      refId: refId || null,
      colaboradorId: colaboradorId || null,
      fecha: new Date().toLocaleString("es-PE"),
      leida: false
    };
    setNotificaciones((prev) => [entry, ...prev].slice(0, 200));
    return entry;
  }

  function marcarNotificacionesLeidas(colaboradorId) {
    if (!colaboradorId) return;
    setNotificaciones((prev) =>
      prev.map((n) =>
        n.colaboradorId === colaboradorId || !n.colaboradorId ? { ...n, leida: true } : n
      )
    );
  }

  function addAudit(action, detail, { notificar = false, tipoNotif = "sistema" } = {}) {
    const entry = {
      id: crypto.randomUUID(),
      fecha: new Date().toLocaleString("es-PE"),
      accion: action,
      detalle: detail
    };
    setAuditLog((prev) => [entry, ...prev]);
    const scheduleKeywords =
      /horario|jornada|plantilla|plan|turno|trabajador|elimina|alta|marcaci/i;
    if (notificar || scheduleKeywords.test(`${action} ${detail}`)) {
      pushNotificacion(tipoNotif, action, detail, entry.id);
    }
  }

  function registrarExtraPendiente(colaboradorId, nombre, fecha, overtimeMin, goalNet, worked) {
    if (overtimeMin <= 0) return;
    setOvertimePendiente((prev) => {
      const exists = prev.find(
        (o) =>
          o.colaboradorId === colaboradorId &&
          o.fecha === fecha &&
          o.status === "pendiente"
      );
      if (exists) {
        return prev.map((o) =>
          o.id === exists.id
            ? { ...o, overtimeMin, goalNet, worked, updatedAt: new Date().toISOString() }
            : o
        );
      }
      const row = {
        id: crypto.randomUUID(),
        colaboradorId,
        nombre,
        fecha,
        overtimeMin,
        goalNet,
        worked,
        status: "pendiente",
        createdAt: new Date().toISOString()
      };
      pushNotificacion(
        "extra",
        "Horas extra pendientes",
        `${nombre} · ${fecha} · +${formatMinutes(overtimeMin)}`,
        row.id
      );
      return [row, ...prev];
    });
  }

  function enviarSolicitudStaff() {
    const { tipo, fecha, detalle } = modalSolicitudStaff;
    if (!detalle.trim()) {
      setMensaje("Escribe un detalle breve para tu solicitud.");
      return;
    }
    const row = {
      id: crypto.randomUUID(),
      colaboradorId: colaboradorActivo.id,
      nombre: colaboradorActivo.nombre,
      tipo,
      fecha: fecha || fechaHoy,
      detalle: detalle.trim(),
      status: "pendiente",
      createdAt: new Date().toISOString()
    };
    setSolicitudes((prev) => [row, ...prev]);
    pushNotificacion(
      "solicitud",
      "Nueva solicitud",
      `${colaboradorActivo.nombre}: ${etiquetaTipoSolicitud(tipo)} · ${row.detalle.slice(0, 80)}`,
      row.id
    );
    addAudit("Solicitud personal", `${colaboradorActivo.nombre}: ${tipo} · ${detalle.trim()}`);
    setModalSolicitudStaff({ open: false, tipo: "dia_libre", fecha: "", detalle: "" });
    setMensaje("Solicitud enviada. Revisa el estado en Organización.");
  }

  function abrirSolicitudStaff(prefill = {}) {
    setModalSolicitudStaff({
      open: true,
      tipo: prefill.tipo || "dia_libre",
      fecha: prefill.fecha || fechaHoy,
      detalle: prefill.detalle || ""
    });
    if (staffPanel !== "organizacion") setStaffPanel("organizacion");
  }

  async function aprobarExtraPendiente() {
    const item = overtimePendiente.find((o) => o.id === modalAprobarExtra.itemId);
    if (!item) return;
    const pin = await pedirPinGerente("PIN de gerente para aprobar");
    if (!pin) return;
    if (!(await verifyAdminCode(pin))) {
      setMensaje("PIN de gerente incorrecto.");
      return;
    }
    const minutos = Math.min(
      item.overtimeMin,
      Math.max(0, Number(modalAprobarExtra.minutosAprobar) || item.overtimeMin)
    );
    const fechaComp = modalAprobarExtra.fechaCompensacion || "";
    setOvertimePendiente((prev) =>
      prev.map((o) =>
        o.id === item.id
          ? {
              ...o,
              status: "aprobado",
              minutosAprobados: minutos,
              fechaCompensacion: fechaComp || null,
              resolvedAt: new Date().toISOString()
            }
          : o
      )
    );
    if (fechaComp && minutos > 0) {
      setOvertimeAjustes((prev) => [
        {
          id: crypto.randomUUID(),
          colaboradorId: item.colaboradorId,
          nombre: item.nombre,
          minutos,
          fechaOrigen: item.fecha,
          fechaCompensacion: fechaComp,
          at: new Date().toISOString()
        },
        ...prev
      ]);
    }
    addAudit(
      "Extra aprobada",
      `${item.nombre} · ${item.fecha}: ${formatMinutes(minutos)}${
        fechaComp ? ` → compensar en ${fechaComp}` : ""
      }`
    );
    setModalAprobarExtra({ open: false, itemId: "", minutosAprobar: "", fechaCompensacion: "" });
    setMensaje(`Aprobado ${formatMinutes(minutos)} extra para ${item.nombre}.`);
  }

  function resolverSolicitud(id, status) {
    const sol = solicitudes.find((s) => s.id === id);
    if (!sol) return;
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    pushNotificacion(
      status === "aprobada" ? "dia_libre" : "solicitud",
      status === "aprobada" ? "Solicitud aprobada" : "Solicitud rechazada",
      `${etiquetaTipoSolicitud(sol.tipo)} · ${sol.fecha}: ${sol.detalle}`,
      sol.id,
      sol.colaboradorId
    );
    addAudit(
      status === "aprobada" ? "Solicitud aprobada" : "Solicitud rechazada",
      `${sol.nombre}: ${sol.tipo} · ${sol.detalle}`
    );
    setMensaje(`Solicitud ${status}.`);
  }

  function cambiarAdminTab(tab) {
    setAdminTab(tab);
    if (tab === "avisos") {
      const solPend = solicitudes.filter((s) => s.status === "pendiente").length;
      setCentroAvisosTab(solPend > 0 ? "solicitudes" : "extra");
    }
    if (vista === "admin") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const runBusyAction = useCallback(async (key, action) => {
    if (actionLocksRef.current.has(key)) return false;
    const startedAt = Date.now();
    actionLocksRef.current.add(key);
    setActionBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await action();
      return true;
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 350) {
        await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
      }
      actionLocksRef.current.delete(key);
      setActionBusy((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const isBusy = useCallback((key) => Boolean(actionBusy[key]), [actionBusy]);

  const verifyAdminCode = useCallback(
    async (code) => {
      const v = String(code || "").trim();
      if (!v) return false;
      if (supa.enabled) {
        try {
          return await verifyManagerPin(v);
        } catch {
          return false;
        }
      }
      return v === ADMIN_CODE;
    },
    [supa.enabled]
  );

  const adminPinLabel = supa.enabled ? "PIN de gerente (6 dígitos)" : "Código administrador";

  const patchAdminPinInput = useCallback(
    (value) => (supa.enabled ? String(value || "").replace(/\D/g, "").slice(0, 6) : value),
    [supa.enabled]
  );

  function pedirPinGerente(titulo) {
    return new Promise((resolve) => {
      pinGerentePromiseRef.current = resolve;
      setModalPinGerente({
        open: true,
        title: titulo || adminPinLabel,
        pin: ""
      });
    });
  }

  function cerrarModalPinGerente(valor) {
    const resolve = pinGerentePromiseRef.current;
    pinGerentePromiseRef.current = null;
    setModalPinGerente({ open: false, title: "", pin: "" });
    if (resolve) resolve(valor);
  }

  async function confirmarModalPinGerente() {
    const raw = modalPinGerente.pin.trim();
    if (supa.enabled && !/^\d{6}$/.test(raw)) {
      setMensaje("El PIN de gerente debe tener 6 dígitos.");
      return;
    }
    if (!supa.enabled && !raw) return;
    cerrarModalPinGerente(raw);
  }

  function pinEfectivoPara(staffId) {
    const custom = staffPinsCustom[staffId];
    if (custom != null && String(custom).trim() !== "") return String(custom).trim();
    return BUILT_IN_PINS[staffId] != null ? String(BUILT_IN_PINS[staffId]) : "";
  }

  function validarPinStaff(staffId, pin) {
    return pinEfectivoPara(staffId) === String(pin || "").trim();
  }

  async function manejarLoginStaff(pinInput) {
    const staffId = staffSesionPersona?.id;
    if (!staffId) {
      setMensaje("No se encontró colaborador para iniciar sesión.");
      return;
    }
    const pin = String(pinInput || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      setMensaje("Ingresa tu PIN de 6 dígitos.");
      return;
    }
    if (supa.enabled) {
      try {
        const ok = await verifyWorkerPin(staffId, pin);
        if (!ok) {
          setMensaje("PIN inválido. Revisa tu código de 6 dígitos.");
          return;
        }
      } catch {
        setMensaje("No se pudo validar el PIN. Revisa la conexión.");
        return;
      }
    } else if (!validarPinStaff(staffId, pin)) {
      setMensaje("PIN inválido. Revisa tu código personal.");
      return;
    }
    setStaffAccess((prev) => ({ ...prev, pinValid: true }));
    setStaffPanel("historial");
    setMensaje(`Sesión activa para ${staffSesionPersona.nombre}.`);
  }

  function resetModalAltaColab() {
    setModalAltaColab({
      open: false,
      nombre: "",
      apellido: "",
      email: "",
      whatsappCountry: "+51",
      whatsappNumber: "",
      fechaNacimiento: "",
      direccion: "",
      contactoEmergenciaNombre: "",
      emergCountry: "+51",
      emergNumber: "",
      plantillaTurnoId: "manana",
      ingreso: "07:00",
      salida: "15:00",
      refrigerioInicio: "12:00",
      refrigerioFin: "12:45",
      horario: "07:00",
      diasLibresAnuales: String(DIAS_LIBRES_DEFAULT_ANUAL),
      comas: true,
      surquillo: false,
      formError: ""
    });
  }

  function abrirModalTrabajador(p) {
    const wa = splitPhoneE164(p.whatsapp || "");
    const em = splitPhoneE164(p.contactoEmergenciaTelefono || "");
    const sedes = p.sedes || [];
    const supabaseWorker =
      supa.enabled && /^[0-9a-f-]{36}$/i.test(String(p.id)) && p.rol !== "Administrador";
    const sedeRef = sedes[0] || "Comas";
    const rowTpl = jornadaFilaParaUI(jornadas[`${p.id}:${sedeRef}`], p.horario, "17:00");
    setModalTrabajadorInfo({
      open: true,
      editing: false,
      workerId: p.id,
      nombre: p.nombre,
      email: p.email || "",
      whatsappCountry: wa.country,
      whatsappNumber: wa.number,
      fechaNacimiento: p.fechaNacimiento || "",
      direccion: p.direccion || "",
      emergNombre: p.contactoEmergenciaNombre || "",
      emergCountry: em.country,
      emergNumber: em.number,
      plantillaTurnoId: matchTurnTemplateId(rowTpl),
      ingreso: rowTpl.ingreso,
      salida: rowTpl.salida,
      refrigerioInicio: rowTpl.refrigerioInicio,
      refrigerioFin: rowTpl.refrigerioFin,
      horario: rowTpl.ingreso,
      comas: sedes.includes("Comas"),
      surquillo: sedes.includes("Surquillo"),
      supabaseWorker
    });
  }

  function guardarEdicionTrabajador() {
    const m = modalTrabajadorInfo;
    const sedes = [];
    if (m.comas) sedes.push("Comas");
    if (m.surquillo) sedes.push("Surquillo");
    if (sedes.length === 0) {
      setMensaje("Marca al menos una sede.");
      return;
    }
    const tplTimes = {
      ingreso: m.ingreso || m.horario || "07:00",
      salida: m.salida || "15:00",
      refrigerioInicio: m.refrigerioInicio || "12:00",
      refrigerioFin: m.refrigerioFin || "12:45"
    };
    const horario = tplTimes.ingreso;
    setJornadas((prev) => {
      const next = { ...prev };
      for (const sede of sedes) {
        const key = `${m.workerId}:${sede}`;
        next[key] = {
          ingreso: tplTimes.ingreso,
          salida: tplTimes.salida,
          refrigerioInicio: tplTimes.refrigerioInicio,
          refrigerioFin: tplTimes.refrigerioFin
        };
      }
      return next;
    });
    if (!m.supabaseWorker) {
      setColaboradoresExtra((prev) =>
        prev.map((c) =>
          c.id === m.workerId ? { ...c, sedes, horario, email: m.email.trim() || c.email } : c
        )
      );
    }
    addAudit("Datos trabajador", `Horario/sedes actualizados: ${m.nombre}`);
    setModalTrabajadorInfo((s) => ({ ...s, open: false, editing: false }));
    setMensaje(
      m.supabaseWorker
        ? `Plantilla actualizada: ${m.nombre}.`
        : `Datos actualizados: ${m.nombre}.`
    );
  }

  async function confirmarAltaColaborador() {
    if (isBusy("createWorker")) return;
    await runBusyAction("createWorker", async () => {
    const nombreSolo = modalAltaColab.nombre.trim();
    const apellido = modalAltaColab.apellido.trim();
    const nombre = [nombreSolo, apellido].filter(Boolean).join(" ").trim();
    const emailRaw = modalAltaColab.email.trim();
    const whatsapp = joinPhoneE164(modalAltaColab.whatsappCountry, modalAltaColab.whatsappNumber);
    const phoneDigits = String(modalAltaColab.whatsappNumber || "").replace(/\D/g, "");
    const fechaNacimiento = modalAltaColab.fechaNacimiento || "1990-01-01";
    const direccion = modalAltaColab.direccion.trim();
    const contactoEmergenciaNombre =
      modalAltaColab.contactoEmergenciaNombre.trim() || nombre || "Por completar";
    const contactoEmergenciaTelefono =
      joinPhoneE164(modalAltaColab.emergCountry, modalAltaColab.emergNumber) || whatsapp;

    // Hard required only: nombre, apellido, teléfono. Soft fields use defaults/placeholders.
    // Red alert lists missing hard fields — do not block on email/DOB/emergencia.
    const missing = [];
    if (!nombreSolo) missing.push("Nombre");
    if (!apellido) missing.push("Apellido");
    if (!whatsapp || phoneDigits.length < 6) missing.push("Teléfono / WhatsApp");
    if (missing.length) {
      const msg = `Falta completar: ${missing.join(", ")}.`;
      setModalAltaColab((m) => ({ ...m, formError: msg }));
      setMensaje(msg);
      return;
    }
    setModalAltaColab((m) => ({ ...m, formError: "" }));

    // Email optional in UI; DB still needs a unique email — placeholder if blank.
    let email = emailRaw;
    if (!email) {
      email = `w.${phoneDigits}.${Date.now().toString(36)}@pendiente.teresita.local`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const msg = "Si ingresas correo, usa un formato válido (ej. nombre@correo.com).";
      setModalAltaColab((m) => ({ ...m, formError: msg }));
      setMensaje(msg);
      return;
    }

    const sedes = [];
    if (modalAltaColab.comas) sedes.push("Comas");
    if (modalAltaColab.surquillo) sedes.push("Surquillo");
    if (sedes.length === 0) {
      const msg = "Marca al menos una sede (Comas o Surquillo).";
      setModalAltaColab((m) => ({ ...m, formError: msg }));
      setMensaje(msg);
      return;
    }
    const tplTimes = {
      ingreso: modalAltaColab.ingreso || modalAltaColab.horario || "07:00",
      salida: modalAltaColab.salida || "15:00",
      refrigerioInicio: modalAltaColab.refrigerioInicio || "12:00",
      refrigerioFin: modalAltaColab.refrigerioFin || "12:45"
    };
    const horario = tplTimes.ingreso;
    const diasAnuales = Math.max(
      0,
      Math.min(60, Number(modalAltaColab.diasLibresAnuales) || DIAS_LIBRES_DEFAULT_ANUAL)
    );

    if (supa.enabled) {
      try {
        const created = await createWorkerWithInvite({
          p_nombre: nombre,
          p_email: email,
          p_whatsapp: whatsapp,
          p_fecha_nacimiento: fechaNacimiento,
          p_direccion: direccion || null,
          p_contacto_emergencia_nombre: contactoEmergenciaNombre,
          p_contacto_emergencia_telefono: contactoEmergenciaTelefono,
          p_sedes: sedes,
          p_horario: horario
        });
        const workerId = created.worker_id;
        const token = created.token;
        const inviteId = created.invite_id;
        setJornadas((prev) => {
          const next = { ...prev };
          for (const sede of sedes) {
            next[`${workerId}:${sede}`] = {
              ingreso: tplTimes.ingreso,
              salida: tplTimes.salida,
              refrigerioInicio: tplTimes.refrigerioInicio,
              refrigerioFin: tplTimes.refrigerioFin
            };
          }
          return next;
        });
        setDiasLibresQuota((prev) => ({
          ...prev,
          [workerId]: { anuales: diasAnuales }
        }));
        const link = `${window.location.origin}${window.location.pathname}?crear-pin=${token}`;
        let adminNotified = supa.adminNotifyEmail;
        let emailStatus = "failed";
        let emailError = "";
        const canTryEmail = emailRaw && !emailRaw.endsWith("@pendiente.teresita.local");
        if (canTryEmail) {
          try {
            const mailRes = await sendWorkerInviteEmail({
              invite_id: inviteId,
              token,
              email: created.email,
              nombre: created.nombre,
              whatsapp,
              admin_email: supa.adminNotifyEmail
            });
            if (mailRes?.admin_notified) adminNotified = mailRes.admin_notified;
            if (mailRes?.ok === true) {
              emailStatus = "sent";
            } else {
              emailStatus = "failed";
              emailError = humanizeInviteEmailError(
                mailRes?.error || mailRes?.hint || "No se pudo enviar el correo."
              );
            }
          } catch (mailErr) {
            emailStatus = "failed";
            emailError = humanizeInviteEmailError(
              mailErr?.message || "No se pudo enviar el correo. Usa el enlace de abajo para crear el PIN."
            );
          }
        } else {
          emailStatus = "failed";
          emailError =
            "Sin correo real: usa Copiar / Abrir enlace para que cree su PIN (o agrega un correo después).";
        }
        await supa.refreshWorkers();
        await supa.refreshStaffWorkers();
        addAudit("Alta colaborador", `${nombre} (${workerId}) · Supabase`);
        resetModalAltaColab();
        setModalWorkerCreado({
          open: true,
          nombre,
          email: created.email,
          link,
          adminNotified,
          emailStatus,
          emailError
        });
        setMensaje(
          emailStatus === "sent"
            ? `Trabajador registrado: ${nombre}. Correo de PIN enviado a ${created.email}.`
            : `Trabajador registrado: ${nombre}. Usa Copiar / Abrir enlace para el PIN.`
        );
      } catch (err) {
        const raw = err?.message || "";
        // B-INV-2: client calls create_worker_with_invite without p_manager_pin (needs SQL 03).
        const looksLikeRpcDrift =
          /Could not find the function|create_worker_with_invite|PGRST202|42883|function .* does not exist/i.test(
            raw
          );
        const msg = looksLikeRpcDrift
          ? "Alta falló por esquema desactualizado. En Supabase → SQL Editor corre supabase/03_FIX_MISSING_PROFILE.sql y reintenta."
          : raw || "No se pudo dar de alta al trabajador.";
        setModalAltaColab((m) => ({ ...m, formError: msg }));
        setMensaje(msg);
      }
      return;
    }

    const code = await pedirPinGerente(adminPinLabel);
    if (code !== ADMIN_CODE) {
      if (code != null && code !== "") setMensaje("Código administrador inválido.");
      return;
    }
    const id = `c${Date.now().toString(36)}`;
    const token = crypto.randomUUID();
    const nuevo = { id, nombre, rol: "Colaborador", sedes, horario, email };
    setColaboradoresExtra((prev) => [...prev, nuevo]);
    setDiasLibresQuota((prev) => ({
      ...prev,
      [id]: { anuales: diasAnuales }
    }));
    setJornadas((prev) => {
      const next = { ...prev };
      for (const sede of sedes) {
        next[`${id}:${sede}`] = {
          ingreso: tplTimes.ingreso,
          salida: tplTimes.salida,
          refrigerioInicio: tplTimes.refrigerioInicio,
          refrigerioFin: tplTimes.refrigerioFin
        };
      }
      return next;
    });
    setStaffInvites((prev) => ({
      ...prev,
      [token]: {
        colaboradorId: id,
        email,
        nombre,
        createdAt: new Date().toISOString(),
        used: false
      }
    }));
    const subject = encodeURIComponent("Teresita — crea tu PIN de fichaje");
    const link = `${window.location.origin}${window.location.pathname}?crear-pin=${encodeURIComponent(token)}`;
    if (emailRaw) {
      const body = encodeURIComponent(
        `Hola ${nombre},\n\nAbre este enlace para crear tu PIN de 6 dígitos:\n\n${link}\n\nSi no se abre el correo, copia y pega la URL en el navegador.`
      );
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    }
    addAudit("Alta colaborador", `${nombre} (${id}) · invitación local`);
    setMensaje(
      emailRaw
        ? `Colaborador agregado: ${nombre}. Se abrió tu cliente de correo para la invitación.`
        : `Colaborador agregado: ${nombre}. Copia el enlace de PIN desde el siguiente alta o crea invitación en el dispositivo.`
    );
    resetModalAltaColab();
    setModalWorkerCreado({
      open: true,
      nombre,
      email,
      link,
      adminNotified: "",
      emailStatus: "failed",
      emailError: emailRaw
        ? "Revisa tu app de correo (mailto)."
        : "Sin correo: usa Copiar / Abrir enlace para el PIN."
    });
    });
  }

  async function guardarPinInvitado() {
    if (isBusy("saveInvitePin")) return;
    await runBusyAction("saveInvitePin", async () => {
    const pin = String(modalCrearPin.pin || "").trim();
    const pin2 = String(modalCrearPin.pin2 || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      setMensaje("El PIN debe tener exactamente 6 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setMensaje("Los PIN no coinciden.");
      return;
    }
    const token = modalCrearPin.token;

    if (supa.enabled) {
      try {
        await setWorkerPinFromInvite(token, pin);
        await supa.refreshWorkers();
        await supa.refreshStaffWorkers();
        addAudit("PIN creado", `${modalCrearPin.nombre} (${modalCrearPin.colaboradorId})`);
        setModalCrearPin({
          open: false,
          token: "",
          colaboradorId: "",
          nombre: "",
          pin: "",
          pin2: ""
        });
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        setMensaje("PIN de 6 dígitos creado. En Vista Personal elige tu nombre e inicia sesión.");
      } catch (err) {
        setMensaje(err.message || "No se pudo guardar el PIN.");
      }
      return;
    }

    const inv = staffInvites[token];
    if (!inv || inv.used) {
      setMensaje("Invitación no válida o ya usada.");
      setModalCrearPin({
        open: false,
        token: "",
        colaboradorId: "",
        nombre: "",
        pin: "",
        pin2: ""
      });
      return;
    }
    setStaffPinsCustom((prev) => ({ ...prev, [modalCrearPin.colaboradorId]: pin }));
    setStaffInvites((prev) => ({
      ...prev,
      [token]: { ...inv, used: true, usedAt: new Date().toISOString() }
    }));
    addAudit("PIN creado", `${modalCrearPin.nombre} (${modalCrearPin.colaboradorId})`);
    setModalCrearPin({
      open: false,
      token: "",
      colaboradorId: "",
      nombre: "",
      pin: "",
      pin2: ""
    });
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    setMensaje("PIN creado. En Vista Personal elige tu nombre e inicia sesión con ese PIN.");
    });
  }

  async function solicitarVistaAdministrador() {
    if (isAdminUnlocked()) return true;
    const pin = await pedirPinGerente(
      supa.enabled ? "PIN de gerente para abrir administración" : "Código administrador"
    );
    if (!pin) return false;
    if (supa.enabled) {
      if (!/^\d{6}$/.test(pin.trim())) {
        setMensaje("El PIN de gerente debe tener 6 dígitos.");
        return false;
      }
      try {
        const ok = await verifyManagerPin(pin.trim());
        if (!ok) {
          setMensaje("PIN de gerente incorrecto.");
          return false;
        }
        setAdminUnlocked();
        return true;
      } catch {
        setMensaje("No se pudo validar el PIN de gerente.");
        return false;
      }
    }
    if (pin !== ADMIN_CODE) {
      setMensaje("Código administrador inválido.");
      return false;
    }
    setAdminUnlocked();
    return true;
  }

  function clearStaffSession() {
    setStaffAccess((prev) => ({ ...prev, pinValid: false }));
    setStaffPinInput("");
  }

  async function cambiarVista(nextVista) {
    if (nextVista === vista) return;
    scrollByVistaRef.current[vista] = window.scrollY;

    if (vista === "staff") {
      clearStaffSession();
    }
    if (vista === "admin") {
      clearAdminUnlock();
    }

    if (nextVista === "admin" && !(await solicitarVistaAdministrador())) return;

    setVista(nextVista);
    if (nextVista === "staff") {
      setMensaje("Vista personal: elige tu nombre e ingresa tu PIN de 6 dígitos.");
    } else if (nextVista === "admin") {
      setMensaje("Vista administrador activa.");
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollByVistaRef.current[nextVista] || 0, left: 0 });
    });
  }

  function abrirPanelStaff(panel) {
    setStaffPanel(panel);
    if (panel === "organizacion" && colaboradorActivo?.id) {
      marcarNotificacionesLeidas(colaboradorActivo.id);
    }
  }

  async function registrarMarcacion(tipo, notaSalida) {
    const actionKey = `marcacion:${tipo}`;
    if (isBusy(actionKey)) return;
    await runBusyAction(actionKey, async () => {
    if (!accionesPermitidas.includes(tipo)) {
      setMensaje(`Acción no permitida ahora. Opciones: ${accionesPermitidas.map((a) => EVENT_LABEL[a]).join(", ")}.`);
      return;
    }
    if (tipo === "CLOCK_IN" && colaboradorActivo.sedes?.length) {
      if (!colaboradorActivo.sedes.includes(sedeTurno)) {
        setMensaje("No puedes fichar en una sede que no tienes asignada.");
        return;
      }
    }
    const lateMinVal =
      tipo === "CLOCK_IN" ? latenessAfterGrace(jornadaActiva.ingreso, horaActual) : 0;
    const puntualidad =
      tipo === "CLOCK_IN"
        ? encodePuntualidadIngreso(lateMinVal)
        : tipo === "CLOCK_OUT" && notaSalida
          ? notaSalida.slice(0, 240)
          : undefined;

    const sedeProgramadaIngreso =
      tipo === "CLOCK_IN"
        ? effectiveSedeForPersonDate(colaboradorActivo, fechaHoy, jornadas, turnosPlan)
        : null;
    const sedeMismatch =
      tipo === "CLOCK_IN" &&
      sedeProgramadaIngreso &&
      sedeProgramadaIngreso !== sedeTurno &&
      colaboradorActivo.sedes.includes(sedeTurno);

    const afterSave = (nextMarcaciones) => {
      if (tipo === "CLOCK_OUT") {
        const ev = nextMarcaciones.filter(
          (m) => m.colaboradorId === colaboradorActivo.id && m.fecha === fechaHoy
        );
        const sum = daySummary(ev, jornadaActiva, { finalize: true });
        if (sum.overtime > 0) {
          registrarExtraPendiente(
            colaboradorActivo.id,
            colaboradorActivo.nombre,
            fechaHoy,
            sum.overtime,
            sum.goalNet,
            sum.worked
          );
        }
      }
      if (sedeMismatch) {
        const detalle = `${colaboradorActivo.nombre} fichó en ${sedeTurno}; según horario tocaba ${sedeProgramadaIngreso} (${fechaHoy}).`;
        pushNotificacion("sede", "Fichaje en sede distinta", detalle, colaboradorActivo.id);
        addAudit("Alerta sede", detalle);
      }
      let msg = mensajeMarcacionBreve(tipo, {
        hora: horaActual,
        jornada: jornadaActiva,
        lateMin: lateMinVal,
        notaSalida
      });
      if (sedeMismatch) {
        msg += ` Aviso: fichaste en ${sedeTurno}; hoy te tocaba ${sedeProgramadaIngreso}.`;
      }
      setMensaje(msg);
    };

    if (supa.enabled && vista === "staff" && staffAccess.pinValid) {
      const pin = staffPinInput.trim();
      if (!/^\d{6}$/.test(pin)) {
        setMensaje("Para fichar con Supabase, ingresa tu PIN de 6 dígitos en Acceso personal.");
        return;
      }
      try {
        const newId = await registrarMarcacionWorker({
          workerId: colaboradorActivo.id,
          pin,
          sede: sedeTurno,
          fecha: fechaHoy,
          tipo,
          hora: horaActual,
          puntualidad
        });
        const item = {
          id: newId,
          colaboradorId: colaboradorActivo.id,
          nombre: colaboradorActivo.nombre,
          sede: sedeTurno,
          fecha: fechaHoy,
          tipo,
          hora: horaActual,
          puntualidad,
          lateMin: tipo === "CLOCK_IN" ? lateMinVal : undefined,
          nota: tipo === "CLOCK_OUT" ? notaSalida || "" : undefined
        };
        setMarcaciones((prev) => {
          const next = [...prev, item];
          afterSave(next);
          return next;
        });
        addAudit("Marcación", `${colaboradorActivo.nombre}: ${EVENT_LABEL[tipo]} ${horaActual}`);
        return;
      } catch (err) {
        setMensaje(err.message || "No se pudo guardar la marcación.");
        return;
      }
    }

    const item = {
      id: crypto.randomUUID(),
      colaboradorId: colaboradorActivo.id,
      nombre: colaboradorActivo.nombre,
      sede: sedeTurno,
      fecha: fechaHoy,
      tipo,
      hora: horaActual,
      puntualidad,
      lateMin: tipo === "CLOCK_IN" ? lateMinVal : undefined,
      nota: tipo === "CLOCK_OUT" ? notaSalida || "" : undefined
    };
    setMarcaciones((prev) => {
      const next = [...prev, item];
      afterSave(next);
      return next;
    });
    addAudit("Marcación", `${colaboradorActivo.nombre}: ${EVENT_LABEL[tipo]} ${horaActual}`);
    });
  }

  function solicitarRegistroSalida() {
    if (!accionesPermitidas.includes("CLOCK_OUT")) return;
    setModalSalidaNota({ open: true, nota: "" });
  }

  async function confirmarSalidaConNota() {
    const nota = modalSalidaNota.nota.trim();
    setModalSalidaNota({ open: false, nota: "" });
    await registrarMarcacion("CLOCK_OUT", nota || undefined);
  }

  function openEdit(colab) {
    const eventos = marcaciones.filter(
      (m) => m.colaboradorId === colab.id && m.fecha === fechaSeleccionada
    );
    const byType = {};
    eventos.forEach((e) => {
      byType[e.tipo] = e.hora;
    });
    setModalEdit({
      open: true,
      colab,
      step: "verify",
      code: "",
      horaIngreso: byType.CLOCK_IN || "",
      horaBreakIn: byType.BREAK_IN || "",
      horaBreakOut: byType.BREAK_OUT || "",
      horaSalida: byType.CLOCK_OUT || ""
    });
    setMotivoEdit("");
    setEvidenciaEdit(null);
  }

  function saveEdit() {
    if (!motivoEdit.trim() || !evidenciaEdit || !modalEdit.colab) return;
    const colab = modalEdit.colab;
    const fecha = fechaSeleccionada;
    const sedeExistente = marcaciones.find(
      (m) => m.colaboradorId === colab.id && m.fecha === fecha
    )?.sede;
    const sede = sedeExistente || colab.sedes[0];
    const jRef = getJornadaPlanificada(
      colab.id,
      sede,
      fecha,
      jornadas,
      turnosPlan,
      colab.horario,
      "17:00"
    );
    const ingresoProg = jRef.ingreso;

    const parches = [
      { tipo: "CLOCK_IN", hora: modalEdit.horaIngreso },
      { tipo: "BREAK_IN", hora: modalEdit.horaBreakIn },
      { tipo: "BREAK_OUT", hora: modalEdit.horaBreakOut },
      { tipo: "CLOCK_OUT", hora: modalEdit.horaSalida }
    ];

    setMarcaciones((prev) => {
      const tipos = ["CLOCK_IN", "BREAK_IN", "BREAK_OUT", "CLOCK_OUT"];
      let next = prev.filter(
        (m) => !(m.colaboradorId === colab.id && m.fecha === fecha && tipos.includes(m.tipo))
      );
      for (const { tipo, hora } of parches) {
        if (!hora) continue;
        const puntualidad =
          tipo === "CLOCK_IN"
            ? latenessAfterGrace(ingresoProg, hora) > 0
              ? "Tarde"
              : "A tiempo"
            : undefined;
        next.push({
          id: crypto.randomUUID(),
          colaboradorId: colab.id,
          nombre: colab.nombre,
          sede,
          fecha,
          tipo,
          hora,
          puntualidad
        });
      }
      return next;
    });

    const detalleHoras = `Ing ${modalEdit.horaIngreso || "—"} · Ref ${modalEdit.horaBreakIn || "—"}–${modalEdit.horaBreakOut || "—"} · Sal ${modalEdit.horaSalida || "—"}`;
    const historial = {
      id: crypto.randomUUID(),
      fecha: new Date().toLocaleString("es-PE"),
      nuevaHora: modalEdit.horaIngreso || modalEdit.horaSalida || "—",
      detalleHoras,
      justificacion: motivoEdit,
      evidencia: evidenciaEdit.name
    };
    setHistorialPorColab((prev) => ({
      ...prev,
      [modalEdit.colab.id]: [historial, ...(prev[modalEdit.colab.id] || [])]
    }));
    addAudit(
      "Ajuste Administrador",
      `${modalEdit.colab.nombre} (${fecha}): ${detalleHoras}. Motivo: ${motivoEdit}. Evidencia: ${evidenciaEdit.name}`
    );
    setMensaje("Edicion registrada con comentario y evidencia.");
    setModalEdit({
      open: false,
      colab: null,
      step: "verify",
      code: "",
      horaIngreso: "",
      horaBreakIn: "",
      horaBreakOut: "",
      horaSalida: ""
    });
  }

  function abrirModalPlanTurno(partial = {}) {
    const colaboradorId = partial.colaboradorId || staffFiltradoAdminOperativo[0]?.id || personas[0].id;
    const p = personas.find((x) => x.id === colaboradorId) || personas[0];
    const fecha = partial.fecha || adminPlanFocusDay;
    const existente = findPlanEntryForPersonDate(turnosPlan, colaboradorId, fecha);
    const sede =
      partial.sede ||
      existente?.sede ||
      (p.sedes.includes("Comas") ? "Comas" : p.sedes[0]);
    const j = getJornadaPlanificada(colaboradorId, sede, fecha, jornadas, turnosPlan, p.horario, "17:00");
    setModalPlan({
      open: true,
      colaboradorId,
      sede,
      fecha,
      plantillaTurnoId: matchTurnTemplateId(j),
      ingreso: j.ingreso,
      salida: j.salida,
      refrigerioInicio: j.refrigerioInicio,
      refrigerioFin: j.refrigerioFin,
      code: ""
    });
  }

  async function guardarModalPlanTurno() {
    if (!(await verifyAdminCode(modalPlan.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    if (!modalPlan.fecha?.trim()) {
      setMensaje("Elige una fecha para el plan.");
      return;
    }
    const p = personas.find((x) => x.id === modalPlan.colaboradorId);
    if (!p || !p.sedes.includes(modalPlan.sede)) {
      setMensaje("Combinación persona / sede inválida.");
      return;
    }
    const k = planTurnoKey(modalPlan.colaboradorId, modalPlan.sede, modalPlan.fecha);
    setTurnosPlan((prev) => {
      const cleared = eliminarPlanesPersonaFecha(prev, modalPlan.colaboradorId, modalPlan.fecha);
      return {
        ...cleared,
        [k]: {
          ingreso: modalPlan.ingreso,
          salida: modalPlan.salida,
          refrigerioInicio: modalPlan.refrigerioInicio,
          refrigerioFin: modalPlan.refrigerioFin
        }
      };
    });
    addAudit(
      "Plan turno día",
      `${p.nombre} · ${modalPlan.sede} · ${modalPlan.fecha}: ${modalPlan.ingreso}–${modalPlan.salida}`
    );
    pushNotificacion(
      "horario",
      "Cambio en tu horario",
      `${modalPlan.fecha} · ${modalPlan.sede}: ${formatHora12(modalPlan.ingreso)} – ${formatHora12(modalPlan.salida)}`,
      k,
      modalPlan.colaboradorId
    );
    setMensaje(`Plan del día guardado para ${p.nombre}.`);
    setModalPlan((m) => ({ ...m, open: false, code: "" }));
  }

  async function eliminarPlanTurnoDia() {
    if (!(await verifyAdminCode(modalPlan.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    setTurnosPlan((prev) => eliminarPlanesPersonaFecha(prev, modalPlan.colaboradorId, modalPlan.fecha));
    const p = personas.find((x) => x.id === modalPlan.colaboradorId);
    addAudit("Quita plan día", `${p?.nombre || ""} · ${modalPlan.fecha}`);
    setMensaje("Excepción quitada; se usa otra vez la plantilla fija.");
    setModalPlan((m) => ({ ...m, open: false, code: "" }));
  }

  function abrirModalBulkPlan(fechasPreset = null) {
    const p = personas.find((x) => x.id === (staffFiltradoAdminOperativo[0]?.id || "c1"));
    const tpl = turnTemplateTimes("manana");
    setModalBulkPlan({
      open: true,
      colaboradorId: p?.id || "c1",
      sede: p?.sedes?.includes("Comas") ? "Comas" : p?.sedes?.[0] || "Comas",
      plantillaTurnoId: "manana",
      ingreso: tpl.ingreso,
      salida: tpl.salida,
      refrigerioInicio: tpl.refrigerioInicio,
      refrigerioFin: tpl.refrigerioFin,
      fechaDesde: adminPlanFocusDay,
      fechaHasta: adminPlanFocusDay,
      omitirFinDeSemana: true,
      fechasPreset,
      code: ""
    });
  }

  async function guardarModalBulkPlan() {
    if (!(await verifyAdminCode(modalBulkPlan.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    const p = personas.find((x) => x.id === modalBulkPlan.colaboradorId);
    if (!p || !p.sedes.includes(modalBulkPlan.sede)) {
      setMensaje("Combinación persona / sede inválida.");
      return;
    }
    const fechas =
      Array.isArray(modalBulkPlan.fechasPreset) && modalBulkPlan.fechasPreset.length > 0
        ? [...modalBulkPlan.fechasPreset].sort()
        : fechasEnRangoIso(
            modalBulkPlan.fechaDesde,
            modalBulkPlan.fechaHasta,
            modalBulkPlan.omitirFinDeSemana
          );
    const fechasFiltradas =
      modalBulkPlan.omitirFinDeSemana && Array.isArray(fechas) && fechas.length > 0
        ? fechas.filter((iso) => {
            const wd = new Date(`${iso}T12:00:00`).getDay();
            return wd !== 0 && wd !== 6;
          })
        : fechas;
    if (fechasFiltradas.length === 0) {
      setMensaje("No hay fechas válidas (revisa el rango o la selección).");
      return;
    }
    setTurnosPlan((prev) => {
      let next = { ...prev };
      for (const fecha of fechasFiltradas) {
        next = eliminarPlanesPersonaFecha(next, modalBulkPlan.colaboradorId, fecha);
        next[planTurnoKey(modalBulkPlan.colaboradorId, modalBulkPlan.sede, fecha)] = {
          ingreso: modalBulkPlan.ingreso,
          salida: modalBulkPlan.salida,
          refrigerioInicio: modalBulkPlan.refrigerioInicio,
          refrigerioFin: modalBulkPlan.refrigerioFin
        };
      }
      return next;
    });
    addAudit(
      "Plan turno masivo",
      `${p.nombre} · ${modalBulkPlan.sede}: ${fechasFiltradas.length} día(s), ${modalBulkPlan.ingreso}–${modalBulkPlan.salida}`
    );
    const rango =
      fechasFiltradas.length === 1
        ? fechasFiltradas[0]
        : `${fechasFiltradas[0]} … ${fechasFiltradas[fechasFiltradas.length - 1]}`;
    pushNotificacion(
      "horario",
      "Cambio en tu horario",
      `${rango} · ${modalBulkPlan.sede}: ${formatHora12(modalBulkPlan.ingreso)} – ${formatHora12(modalBulkPlan.salida)} (${fechasFiltradas.length} día(s))`,
      modalBulkPlan.colaboradorId,
      modalBulkPlan.colaboradorId
    );
    setMensaje(`Plan aplicado a ${fechasFiltradas.length} día(s) para ${p.nombre}.`);
    setModalBulkPlan((m) => ({ ...m, open: false, code: "", fechasPreset: null }));
    setAdminMesFechasSel([]);
    setAdminMesSeleccionModo(false);
  }

  function abrirModalQuitarPlanDia(colaboradorId, nombre, fecha) {
    setModalQuitarPlanDia({ open: true, colaboradorId, nombre, fecha, code: "" });
  }

  async function confirmarQuitarPlanDiaLista() {
    if (!(await verifyAdminCode(modalQuitarPlanDia.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    if (!modalQuitarPlanDia.colaboradorId || !modalQuitarPlanDia.fecha) {
      setMensaje("Datos incompletos.");
      return;
    }
    setTurnosPlan((prev) =>
      eliminarPlanesPersonaFecha(prev, modalQuitarPlanDia.colaboradorId, modalQuitarPlanDia.fecha)
    );
    addAudit(
      "Quita plan día",
      `${modalQuitarPlanDia.nombre} · ${modalQuitarPlanDia.fecha} (lista calendario)`
    );
    setMensaje(`Plan del día quitado para ${modalQuitarPlanDia.nombre}.`);
    setModalQuitarPlanDia({
      open: false,
      colaboradorId: "",
      nombre: "",
      fecha: "",
      code: ""
    });
  }

  function mockOwnerAction(action) {
    addAudit("Acción Dueño", action);
    setMensaje(`${action} simulado.`);
  }

  function descargarNominaExcel(etiquetaOrigen) {
    const stats = adminAnalisisStats;
    const rango = analisisAdminRango;
    const sourceLabel = etiquetaOrigen || "Vista Administrador";
    exportNominaWorkbook({
      stats,
      desde: rango.desde,
      hasta: rango.hasta,
      sourceLabel,
      personasList: personas
    });
    addAudit("Excel planilla", `${sourceLabel} · ${rango.desde} → ${rango.hasta}`);
    setMensaje("Excel de planilla descargado (revisa la carpeta Descargas).");
  }

  function onComandaFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setFormaComanda((f) => ({ ...f, fotoNombre: "", fotoDataUrl: "" }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMensaje("La evidencia debe ser una imagen.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMensaje("La imagen supera 4 MB. Elija una foto más liviana.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormaComanda((f) => ({
        ...f,
        fotoNombre: file.name,
        fotoDataUrl: typeof reader.result === "string" ? reader.result : ""
      }));
      setMensaje("Foto de boleta cargada. Revise la vista previa.");
    };
    reader.readAsDataURL(file);
  }

  async function registrarComandaAdministrador() {
    if (isBusy("saveComanda")) return;
    await runBusyAction("saveComanda", async () => {
    let managerPin = null;
    if (supa.enabled) {
      managerPin = await pedirPinGerente("PIN de gerente para registrar comanda");
      if (!managerPin || !/^\d{6}$/.test(managerPin.trim())) {
        setMensaje("Se requiere PIN de gerente de 6 dígitos.");
        return;
      }
      managerPin = managerPin.trim();
    } else {
      const code = await pedirPinGerente(adminPinLabel);
      if (code !== ADMIN_CODE) {
        setMensaje("Código inválido. No se registró la comanda.");
        return;
      }
    }
    const boleta = formaComanda.numeroBoleta.trim();
    if (!boleta) {
      setMensaje("El número de boleta es obligatorio.");
      return;
    }
    if (!formaComanda.fotoDataUrl) {
      setMensaje("Debe cargar foto de la boleta.");
      return;
    }
    const montoNum = Number(String(formaComanda.monto).replace(",", "."));
    if (!(montoNum > 0)) {
      setMensaje("Ingrese un monto válido.");
      return;
    }
    const colab = personas.find((p) => p.id === formaComanda.colaboradorId);
    if (!colab) return;
    if (!colab.sedes.includes(formaComanda.sede)) {
      setMensaje(`${colab.nombre} no tiene sede ${formaComanda.sede}. Elija sede permitida.`);
      return;
    }
    let registroId = crypto.randomUUID();
    if (supa.enabled && managerPin) {
      try {
        registroId = await registrarComandaAdmin({
          managerPin,
          workerId: colab.id,
          sede: formaComanda.sede,
          fecha: formaComanda.fechaRegistro,
          monto: montoNum,
          concepto: formaComanda.concepto.trim() || "Consumo personal",
          numeroBoleta: boleta,
          fotoNombre: formaComanda.fotoNombre,
          fotoDataUrl: formaComanda.fotoDataUrl
        });
      } catch (err) {
        setMensaje(err.message || "No se pudo guardar la comanda.");
        return;
      }
    }
    const registro = {
      id: registroId,
      colaboradorId: colab.id,
      nombre: colab.nombre,
      sede: formaComanda.sede,
      monto: montoNum,
      concepto: formaComanda.concepto.trim() || "Consumo personal",
      numeroBoleta: boleta,
      fotoNombre: formaComanda.fotoNombre,
      fotoDataUrl: formaComanda.fotoDataUrl,
      fecha: formaComanda.fechaRegistro
    };
    setComandasLista((prev) => [registro, ...prev]);
    addAudit(
      "Comanda",
      `${colab.nombre} Boleta ${boleta} ${formaComanda.sede} S/ ${montoNum.toFixed(2)} · ${registro.concepto} · ${registro.fecha}`
    );
    setFormaComanda((f) => ({
      ...f,
      monto: "",
      concepto: "",
      numeroBoleta: "",
      fotoNombre: "",
      fotoDataUrl: ""
    }));
    const input = document.getElementById("comanda-foto-input");
    if (input) input.value = "";
    setMensaje(`Comanda registrada para ${colab.nombre} con boleta ${boleta}.`);
    });
  }

  function moverFecha(delta) {
    const d = new Date(`${fechaSeleccionada}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setFechaSeleccionada(d.toISOString().slice(0, 10));
  }

  function shiftEquipoSemanaAdmin(deltaSemanas) {
    const d = new Date(`${fechaSeleccionada}T12:00:00`);
    d.setDate(d.getDate() + deltaSemanas * 7);
    setFechaSeleccionada(d.toISOString().slice(0, 10));
  }

  function irSemanaActualEquipoAdmin() {
    setFechaSeleccionada(fechaHoy);
  }

  function abrirModalJornadaPlantilla(colaboradorId, sede) {
    const p = personas.find((x) => x.id === colaboradorId);
    const row = jornadaFilaParaUI(jornadas[`${colaboradorId}:${sede}`], p?.horario, "17:00");
    setModalJornadaTpl({
      open: true,
      colaboradorId,
      sede,
      plantillaTurnoId: matchTurnTemplateId(row),
      ingreso: row.ingreso,
      salida: row.salida,
      refrigerioInicio: row.refrigerioInicio,
      refrigerioFin: row.refrigerioFin,
      code: ""
    });
  }

  async function guardarModalJornadaPlantilla() {
    if (!(await verifyAdminCode(modalJornadaTpl.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    const p = personas.find((x) => x.id === modalJornadaTpl.colaboradorId);
    if (!p || !p.sedes.includes(modalJornadaTpl.sede)) {
      setMensaje("Combinación persona / sede inválida.");
      return;
    }
    const key = `${modalJornadaTpl.colaboradorId}:${modalJornadaTpl.sede}`;
    setJornadas((prev) => ({
      ...prev,
      [key]: {
        ingreso: modalJornadaTpl.ingreso,
        salida: modalJornadaTpl.salida,
        refrigerioInicio: modalJornadaTpl.refrigerioInicio,
        refrigerioFin: modalJornadaTpl.refrigerioFin
      }
    }));
    addAudit(
      "Jornada plantilla",
      `${p.nombre} · ${modalJornadaTpl.sede}: ${modalJornadaTpl.ingreso}–${modalJornadaTpl.salida} (ref. ${modalJornadaTpl.refrigerioInicio}–${modalJornadaTpl.refrigerioFin})`
    );
    setMensaje("Plantilla de jornada guardada.");
    setModalJornadaTpl((m) => ({ ...m, open: false, code: "" }));
  }

  function abrirModalEliminarJornadaPlantilla(colaboradorId, sede) {
    setModalEliminarJornadaTpl({ open: true, colaboradorId, sede, code: "" });
  }

  async function confirmarEliminarJornadaPlantilla() {
    if (!(await verifyAdminCode(modalEliminarJornadaTpl.code))) {
      setMensaje("Código admin inválido.");
      return;
    }
    const { colaboradorId, sede } = modalEliminarJornadaTpl;
    const p = personas.find((x) => x.id === colaboradorId);
    if (!p || !p.sedes.includes(sede)) {
      setMensaje("Combinación persona / sede inválida.");
      return;
    }
    const key = `${colaboradorId}:${sede}`;
    setJornadas((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    addAudit("Elimina plantilla jornada", `${p.nombre} · ${sede}`);
    setMensaje("Plantilla eliminada; se usará el horario por defecto del colaborador.");
    setModalEliminarJornadaTpl({ open: false, colaboradorId: "", sede: "", code: "" });
  }

  function abrirModalEliminarTrabajador(p) {
    if (!p?.id) return;
    setModalDeleteWorker({
      open: true,
      workerId: p.id,
      nombre: p.nombre,
      step: "request",
      code: "",
      devHint: "",
      emailSent: false
    });
  }

  async function solicitarCodigoEliminarTrabajador() {
    if (isBusy("deleteWorkerRequest")) return;
    await runBusyAction("deleteWorkerRequest", async () => {
      try {
        const res = await requestDeleteWorkerCodeEmail({
          worker_id: modalDeleteWorker.workerId,
          nombre: modalDeleteWorker.nombre,
          admin_email: supa.adminNotifyEmail
        });
        const devCode = res?.code_for_dev || res?.dev_code || "";
        setModalDeleteWorker((m) => ({
          ...m,
          step: "confirm",
          devHint: devCode,
          emailSent: Boolean(res?.email_sent)
        }));
        if (res?.email_sent) {
          setMensaje(`Código enviado a ${res.admin_email || supa.adminNotifyEmail}. Revísalo e ingrésalo abajo.`);
        } else if (devCode) {
          setMensaje(
            res?.hint ||
              `Correo no enviado. Código en pantalla: ${devCode} (configura RESEND en Supabase para recibirlo por email).`
          );
        } else {
          setMensaje("Código generado. Revisa el correo o contacta soporte.");
        }
      } catch (err) {
        setMensaje(err.message || "No se pudo enviar el código.");
      }
    });
  }

  async function confirmarEliminarTrabajador() {
    if (isBusy("deleteWorkerConfirm")) return;
    await runBusyAction("deleteWorkerConfirm", async () => {
      const code = modalDeleteWorker.code.trim();
      if (!/^\d{6}$/.test(code)) {
        setMensaje("Ingresa el código de 6 dígitos del correo.");
        return;
      }
      try {
        await deleteWorkerWithCode(modalDeleteWorker.workerId, code);
        await supa.refreshWorkers();
        await supa.refreshStaffWorkers();
        if (adminVistaColabId === modalDeleteWorker.workerId) {
          const rest = staffFiltradoAdminOperativo.filter((x) => x.id !== modalDeleteWorker.workerId);
          if (rest[0]) setAdminVistaColabId(rest[0].id);
        }
        addAudit("Elimina trabajador", modalDeleteWorker.nombre);
        setModalDeleteWorker({
          open: false,
          workerId: "",
          nombre: "",
          step: "request",
          code: "",
          devHint: ""
        });
        setMensaje(`Trabajador ${modalDeleteWorker.nombre} eliminado del equipo.`);
      } catch (err) {
        setMensaje(err.message || "Código incorrecto o expirado.");
      }
    });
  }

  const ultimaFichaHoy = useMemo(() => {
    const sorted = [...marcacionesFichaHoy].sort((a, b) => a.hora.localeCompare(b.hora));
    return sorted[sorted.length - 1]?.tipo;
  }, [marcacionesFichaHoy]);

  const jornadaEstado =
    marcacionesFichaHoy.length === 0
      ? "Pendiente de ingreso"
      : ultimaFichaHoy === "BREAK_IN"
        ? "En refrigerio"
        : ultimaFichaHoy === "CLOCK_OUT"
          ? "Turno cerrado (puedes registrar otro ingreso hoy)"
          : ultimaFichaHoy === "CLOCK_IN" || ultimaFichaHoy === "BREAK_OUT"
            ? "Trabajando"
            : "En jornada";

  const statusBadge = jornadaEstado;
  const pulseState =
    accionesPermitidas.includes("CLOCK_IN") && accionesPermitidas.length === 1
      ? marcacionesFichaHoy.some((m) => m.tipo === "CLOCK_OUT")
        ? "NEW_SHIFT"
        : "CLOCK_IN"
      : accionesPermitidas.includes("BREAK_OUT") &&
          !accionesPermitidas.includes("BREAK_IN") &&
          accionesPermitidas.length === 1
        ? "BREAK_OUT"
        : "ACTIVE";

  const metaDiaNetMin = resumenStaff.goalNet || scheduledNetMinutes(jornadaActiva);
  const debeSaldoMes = resumenStaff.overtime - resumenStaff.debt;
  const debePercent = Math.min(
    100,
    Math.round((Math.abs(debeSaldoMes) / Math.max(metaDiaNetMin, 1)) * 100)
  );
  const esDiaEnCurso = fechaSeleccionada >= fechaHoy;

  const bulletsAyuda = vista === "staff" ? AYUDA_ASISTENCIA.personal : AYUDA_ASISTENCIA.administrador;

  return (
    <div className="min-h-screen bg-bone">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <header className="mb-5 overflow-hidden rounded-3xl border border-peruRed/15 bg-gradient-to-br from-white via-white to-peruMustard/10 shadow-bento">
          <div className="h-1.5 w-full bg-gradient-to-r from-peruRed via-peruRed to-peruMustard" />
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-56 items-center justify-center rounded-2xl bg-bone/80 px-3 ring-1 ring-peruRed/10">
                  <img
                    src={restaurantBranding?.image || logoTeresita}
                    alt={`Imagen de ${supa.companyName || "tu restaurante"}`}
                    className={`h-12 w-full ${restaurantBranding?.image ? "rounded-xl object-cover" : "object-contain"}`}
                  />
                </div>
                <div>
                  <p className="text-xl font-bold leading-tight text-peruRed">
                    {supa.companyName || "Teresita para restaurantes"}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-coffee/55">
                    Espacio operativo
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-peruMustard/25 px-3 py-1 text-xs font-semibold text-coffee">
                Equipo y turnos
              </span>
            </div>
          </div>
        </header>

        <nav className="mb-5 rounded-3xl border border-peruRed/15 bg-white p-2 shadow-bento">
          <div className="flex flex-wrap gap-2">
            {VISTAS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => cambiarVista(tab.id)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  vista === tab.id
                    ? "bg-peruRed text-white"
                    : "bg-bone text-coffee hover:bg-peruMustard/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <p className="mb-4 rounded-2xl bg-white p-3 text-sm text-peruRed shadow-bento">{mensaje}</p>

        <div className={vista === "staff" ? "" : "hidden"} aria-hidden={vista !== "staff"}>
          <section className="space-y-4">
            <article className="rounded-3xl border border-peruRed/15 bg-white p-4 shadow-bento">
              <h2 className="text-lg font-bold text-peruRed">Acceso personal</h2>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] text-xs font-semibold text-coffee">
                  Colaborador
                  <select
                    value={staffAccess.staffId}
                    disabled={staffDisponibles.length === 0}
                    onChange={(e) =>
                      setStaffAccess((prev) => ({
                        ...prev,
                        staffId: e.target.value,
                        pinValid: false
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                  >
                    {staffDisponibles.length === 0 ? (
                      <option value="">Sin trabajadores aún</option>
                    ) : (
                      staffDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="min-w-[180px] text-xs font-semibold text-coffee">
                  PIN (6 dígitos)
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={staffPinInput}
                    onChange={(e) =>
                      setStaffPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm tracking-[0.25em]"
                    placeholder="••••••"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => manejarLoginStaff(staffPinInput)}
                  className="rounded-xl bg-peruRed px-4 py-2 text-sm font-semibold text-white"
                >
                  Iniciar sesión
                </button>
                {staffAccess.pinValid ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-xl bg-green-100 px-3 py-2 text-xs font-semibold text-green-700">
                      Sesión activa: {staffSesionPersona?.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearStaffSession();
                        setMensaje("Sesión personal cerrada. Vuelve a ingresar tu PIN para fichar.");
                      }}
                      className="rounded-xl border border-peruRed/25 bg-white px-3 py-2 text-xs font-semibold text-peruRed"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                ) : (
                  <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700">
                    Ingresa tu PIN para ver tu información
                  </span>
                )}
              </div>
            </article>

            {staffAccess.pinValid ? (
              <section
                ref={staffLayoutRef}
                className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0"
              >
            <article
              className="min-w-0 w-full rounded-3xl border border-peruRed/20 bg-white p-5 shadow-bento lg:shrink-0"
              style={
                staffSplitDesktop
                  ? {
                      flexBasis: `${staffPaneLeftPct}%`,
                      flexGrow: 0,
                      flexShrink: 0,
                      minWidth: 260
                    }
                  : undefined
              }
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-peruRed">Vista Personal - Pulse</h2>
                <div className="flex items-center gap-2 rounded-full bg-bone px-3 py-1 text-xs font-semibold text-coffee">
                  <CalendarDays size={14} /> {fechaLarga}
                </div>
              </div>
              <div className="mb-4 rounded-2xl border border-peruRed/10 bg-bone p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-coffee">Jornadas por fecha</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moverFecha(-1)}
                      className="rounded-lg bg-white p-1 text-coffee ring-1 ring-peruRed/10"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => moverFecha(1)}
                      className="rounded-lg bg-white p-1 text-coffee ring-1 ring-peruRed/10"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {fechasCarrusel.map((f) => (
                    <button
                      key={f.iso}
                      onClick={() => setFechaSeleccionada(f.iso)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${
                        fechaSeleccionada === f.iso
                          ? "bg-peruRed text-white"
                          : f.esHoy
                            ? "bg-peruMustard/40 text-coffee"
                            : "bg-white text-coffee"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-coffee/70">
                  {fechaSeleccionadaTexto} · {formatHora12(jornadaActiva.ingreso)}–
                  {formatHora12(jornadaActiva.salida)}
                </p>
              </div>
              <p className="mb-4 rounded-xl bg-bone px-3 py-2 text-sm text-coffee">{saludo}</p>
              <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                <div className="relative flex h-72 w-72 items-center justify-center rounded-full border-[12px] border-peruRed/80 bg-gradient-to-b from-peruRed to-peruRed/80 text-white shadow-2xl">
                  <Clock3 className="absolute left-8 top-8" size={20} aria-hidden />
                  <div className="text-center">
                    <p className="text-sm uppercase">Hora actual</p>
                    <p className="text-5xl font-bold tracking-widest">{formatHora12(horaActual)}</p>
                    <p className="mt-2 text-sm">{colaboradorActivo.nombre}</p>
                  </div>
                  <span className="absolute -bottom-2 rounded-full bg-peruMustard px-4 py-1 text-xs font-bold text-coffee">
                    {statusBadge}
                  </span>
                </div>
                <div className="w-full rounded-xl bg-bone px-3 py-2 text-xs text-coffee/90">
                  <p>
                    Estado: <strong>{jornadaEstado}</strong> · Próximo:{" "}
                    <strong>{EVENT_LABEL[siguiente] || "Ninguna"}</strong>
                  </p>
                  <p className="mt-1">
                    Programado {formatHora12(jornadaActiva.ingreso)}–{formatHora12(jornadaActiva.salida)}
                  </p>
                </div>
                {(pulseState === "CLOCK_IN" || pulseState === "NEW_SHIFT") && (
                  <>
                    {pulseState === "NEW_SHIFT" ? (
                      <p className="w-full rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                        Puedes registrar otro ingreso hoy.
                      </p>
                    ) : null}
                  <button
                    onClick={() => registrarMarcacion("CLOCK_IN")}
                    disabled={!accionesPermitidas.includes("CLOCK_IN") || isBusy("marcacion:CLOCK_IN")}
                    className="w-full animate-pulse rounded-2xl bg-green-600 px-4 py-4 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {isBusy("marcacion:CLOCK_IN")
                      ? "Registrando..."
                      : pulseState === "NEW_SHIFT"
                        ? "Nuevo ingreso (mismo día)"
                        : "Registrar ingreso"}
                  </button>
                  </>
                )}
                {pulseState === "ACTIVE" && (
                  <div className="grid w-full grid-cols-2 gap-2">
                    <button
                      onClick={() => registrarMarcacion("BREAK_IN")}
                      disabled={!accionesPermitidas.includes("BREAK_IN") || isBusy("marcacion:BREAK_IN")}
                      className="rounded-2xl bg-amber-500 px-3 py-3 text-sm font-bold text-white disabled:opacity-40"
                    >
                      {isBusy("marcacion:BREAK_IN") ? "Registrando..." : `Refrigerio · ref. ${formatHora12(jornadaActiva.refrigerioInicio)}`}
                    </button>
                    <button
                      type="button"
                      onClick={solicitarRegistroSalida}
                      disabled={!accionesPermitidas.includes("CLOCK_OUT") || isBusy("marcacion:CLOCK_OUT")}
                      className="rounded-2xl bg-red-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-40"
                    >
                      {isBusy("marcacion:CLOCK_OUT") ? "Registrando..." : "Salida"}
                    </button>
                  </div>
                )}
                {pulseState === "BREAK_OUT" && (
                  <button
                    onClick={() => registrarMarcacion("BREAK_OUT")}
                    disabled={!accionesPermitidas.includes("BREAK_OUT") || isBusy("marcacion:BREAK_OUT")}
                    className="w-full rounded-2xl bg-yellow-600 px-4 py-4 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {isBusy("marcacion:BREAK_OUT") ? "Registrando..." : "Finalizar refrigerio"}
                  </button>
                )}
                <div className="w-full rounded-xl bg-bone p-2">
                  <p className="text-xs font-semibold text-coffee/80">Sede del turno</p>
                  {sedeProgramadaHoy ? (
                    <p className="mt-0.5 text-[11px] text-coffee/70">
                      Hoy te toca: <strong>{sedeProgramadaHoy}</strong>
                    </p>
                  ) : null}
                  <div className="mt-1 flex gap-2">
                    {colaboradorActivo.sedes.map((sede) => (
                      <button
                        key={sede}
                        type="button"
                        onClick={() => setSedeTurno(sede)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                          sedeTurno === sede
                            ? "bg-peruRed text-white"
                            : sedeProgramadaHoy === sede
                              ? "bg-peruMustard/50 text-coffee ring-1 ring-peruRed/25"
                              : "bg-white text-coffee"
                        }`}
                      >
                        {sede}
                        {sedeProgramadaHoy === sede ? (
                          <span className="mt-0.5 block text-[9px] font-normal opacity-80">
                            Programado
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {sedeDistintaProgramada ? (
                    <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                      Sede distinta al plan de hoy ({sedeProgramadaHoy}) — se avisará al fichar.
                    </p>
                  ) : null}
                </div>
              </div>
            </article>

            <button
              type="button"
              title="Arrastra para cambiar el ancho · doble clic: reparto por defecto"
              aria-label="Redimensionar columnas entre Pulse y panel lateral"
              onDoubleClick={() => setStaffPaneLeftPct(66)}
              onPointerDown={(e) => {
                if (e.button !== 0 || !staffSplitDesktop) return;
                e.preventDefault();
                const root = staffLayoutRef.current;
                if (!root) return;
                const move = (ev) => {
                  const r = root.getBoundingClientRect();
                  const w = r.width;
                  if (w < 200) return;
                  let pct = ((ev.clientX - r.left) / w) * 100;
                  pct = Math.min(82, Math.max(30, pct));
                  setStaffPaneLeftPct(Math.round(pct * 10) / 10);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
              className="relative z-10 mx-0.5 hidden min-h-[200px] w-5 shrink-0 cursor-col-resize touch-none select-none flex-col items-stretch justify-center rounded-full border-0 bg-transparent p-0 lg:flex"
            >
              <span className="pointer-events-none mx-auto my-3 block min-h-[100px] w-1.5 flex-1 rounded-full bg-peruRed/20 ring-1 ring-peruRed/10 hover:bg-peruRed/35" />
            </button>

            <aside className="min-w-0 flex-1 space-y-4 lg:min-w-[200px]">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-2 shadow-bento sm:grid-cols-3 lg:grid-cols-5">
                <button
                  type="button"
                  onClick={() => abrirPanelStaff("resumen")}
                  className={`rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight sm:px-2 sm:text-xs ${
                    staffPanel === "resumen" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Resumen
                </button>
                <button
                  type="button"
                  onClick={() => abrirPanelStaff("historial")}
                  className={`rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight sm:px-2 sm:text-xs ${
                    staffPanel === "historial" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Historial
                </button>
                <button
                  type="button"
                  onClick={() => abrirPanelStaff("comandasMes")}
                  className={`rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight sm:px-2 sm:text-xs ${
                    staffPanel === "comandasMes" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Comandas (mes)
                </button>
                <button
                  type="button"
                  onClick={() => abrirPanelStaff("horarios")}
                  className={`rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight sm:px-2 sm:text-xs ${
                    staffPanel === "horarios" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Horarios
                </button>
                <button
                  type="button"
                  onClick={() => abrirPanelStaff("organizacion")}
                  className={`relative rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight sm:col-span-1 sm:px-2 sm:text-xs ${
                    staffPanel === "organizacion" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Organización
                  {staffNotifNoLeidas > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-peruMustard px-1 text-[9px] font-bold text-coffee">
                      {staffNotifNoLeidas}
                    </span>
                  ) : null}
                </button>
              </div>

              {staffPanel === "resumen" ? (
                <>
                  <button
                    type="button"
                    onClick={() => abrirModalTrabajador(colaboradorActivo)}
                    className="w-full rounded-xl border border-peruRed/20 bg-bone px-3 py-2 text-left text-xs font-semibold text-coffee"
                  >
                    Ver mis datos · {formatHora12(colaboradorActivo.horario || "08:00")} ·{" "}
                    {(colaboradorActivo.sedes || []).join(", ") || "—"}
                  </button>
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-peruRed">
                      <Timer size={18} /> Debe Horas
                    </h3>
                    <p className="mt-3 text-3xl font-bold text-coffee">
                      {formatMinutes(resumenStaff.debt)}
                    </p>
                    <div className="mt-3 h-3 w-full rounded-full bg-red-100">
                      <div
                        className={`h-3 rounded-full ${debeSaldoMes >= 0 ? "bg-green-500" : "bg-red-500"}`}
                        style={{ width: `${debePercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-coffee/70">
                      Extra: {formatMinutes(resumenStaff.overtime)} · Ref.:{" "}
                      {formatMinutes(resumenStaff.breakMin)}
                    </p>
                  </article>
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="text-lg font-bold text-peruRed">Jornada · {fechaSeleccionadaTexto}</h3>
                    <p className="text-sm text-coffee/80">
                      Meta del día: {(metaDiaNetMin / 60).toFixed(1)} h netas (
                      {formatHora12(jornadaActiva.ingreso)} – {formatHora12(jornadaActiva.salida)}).
                    </p>
                    <p className="mt-2 text-sm">
                      Tardanza: {esDiaEnCurso ? "— (al día siguiente)" : `${resumenStaff.lateMin} min`}
                    </p>
                    <p className="text-sm">Trabajado: {formatMinutes(resumenStaff.worked)}</p>
                  </article>
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="text-lg font-bold text-peruRed">Semana en curso</h3>
                    <p className="mt-2 text-sm">
                      Trabajado: <strong>{formatMinutes(resumenSemanaStaff.worked)}</strong>
                    </p>
                    <p className="text-sm text-coffee/80">
                      Programado (lun–dom): {formatMinutes(resumenSemanaStaff.expected)}
                    </p>
                    <p className="mt-1 text-xs text-coffee/65">
                      Extra semanal:{" "}
                      {formatMinutes(Math.max(0, resumenSemanaStaff.worked - resumenSemanaStaff.expected))}
                    </p>
                    <button
                      type="button"
                      onClick={() => abrirSolicitudStaff({ tipo: "dia_libre", fecha: fechaHoy })}
                      className="mt-3 w-full rounded-xl border border-peruRed/25 bg-white px-3 py-2 text-xs font-semibold text-peruRed"
                    >
                      Solicitar día libre / cambio
                    </button>
                  </article>
                </>
              ) : staffPanel === "historial" ? (
                <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                  <h3 className="mb-1 text-lg font-bold text-peruRed">Marcaciones del día</h3>
                  <p className="mb-3 text-xs text-coffee/65">{fechaSeleccionadaTexto}</p>
                  <div className="space-y-2">
                    {marcacionesDiaSel.length === 0 ? (
                      <p className="text-sm text-coffee/70">Aún no hay marcaciones.</p>
                    ) : (
                      [...marcacionesDiaSel]
                        .sort((a, b) => a.hora.localeCompare(b.hora))
                        .map((m) => (
                        <div key={m.id} className="rounded-xl bg-bone px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                EVENT_BADGE[m.tipo] || "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {EVENT_LABEL[m.tipo] || m.tipo}
                            </span>
                            <span className="text-sm font-semibold">{formatHora12(m.hora)}</span>
                          </div>
                          {m.tipo === "CLOCK_OUT" && (m.nota || m.puntualidad) ? (
                            <p className="mt-1 text-xs text-coffee/75">
                              Nota: {m.nota || m.puntualidad}
                            </p>
                          ) : null}
                          {m.tipo === "CLOCK_IN" && (m.puntualidad || typeof m.lateMin === "number") ? (
                            <p className="mt-1 text-[10px] text-amber-900/90">
                              {etiquetaPuntualidadIngreso(
                                m,
                                getJornadaPlanificada(
                                  m.colaboradorId,
                                  m.sede || colaboradorActivo.sedes?.[0] || "Comas",
                                  fechaSeleccionada,
                                  jornadas,
                                  turnosPlan,
                                  colaboradorActivo.horario,
                                  "17:00"
                                )
                              )}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ) : staffPanel === "comandasMes" ? (
                <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                  <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-peruRed">
                    <ChefHat size={18} aria-hidden /> Comandas del mes
                  </h3>
                  <label className="mt-3 block text-xs font-semibold text-coffee">
                    Mes
                    <input
                      type="month"
                      value={staffComandasMesYm}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) setStaffComandasMesYm(v);
                      }}
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    />
                  </label>
                  <p className="mt-3 rounded-xl bg-peruMustard/15 px-3 py-2 text-sm font-semibold text-coffee">
                    Total {staffComandasMesLabel ? `(${staffComandasMesLabel})` : ""}: S/{" "}
                    {totalComandasStaffMes.toFixed(2)}
                  </p>
                  <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
                    {comandasStaffMes.length === 0 ? (
                      <li className="rounded-xl bg-bone px-3 py-2 text-coffee/70">
                        Sin comandas en este mes. El administrador las registra en la pestaña Comandas.
                      </li>
                    ) : (
                      comandasStaffMes.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-col gap-1 rounded-xl bg-bone px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-peruRed">Boleta {c.numeroBoleta || "—"}</p>
                            <p className="text-xs text-coffee">
                              {c.fecha} · {c.sede} · {c.concepto || "Consumo"}
                            </p>
                            {c.fotoDataUrl ? (
                              <img
                                src={c.fotoDataUrl}
                                alt=""
                                className="mt-2 max-h-28 w-full max-w-[200px] rounded-lg border border-peruRed/15 object-contain"
                              />
                            ) : null}
                          </div>
                          <span className="font-semibold sm:shrink-0">S/ {Number(c.monto).toFixed(2)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </article>
              ) : staffPanel === "organizacion" ? (
                <div className="space-y-4">
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-peruRed">
                      <CalendarDays size={18} aria-hidden /> Días libre · {anioCalendarioActual()}
                    </h3>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div className="rounded-xl bg-bone px-3 py-2">
                        <p className="text-[10px] uppercase text-coffee/60">Asignados</p>
                        <p className="text-xl font-bold text-coffee">{staffDiasLibres.anuales}</p>
                      </div>
                      <div className="rounded-xl bg-bone px-3 py-2">
                        <p className="text-[10px] uppercase text-coffee/60">Usados</p>
                        <p className="text-xl font-bold text-coffee">{staffDiasLibres.usados}</p>
                      </div>
                      <div className="rounded-xl bg-bone px-3 py-2">
                        <p className="text-[10px] uppercase text-coffee/60">Pendientes</p>
                        <p className="text-xl font-bold text-amber-900">{staffDiasLibres.pendientes}</p>
                      </div>
                      <div className="rounded-xl bg-peruMustard/20 px-3 py-2 ring-1 ring-peruMustard/40">
                        <p className="text-[10px] uppercase text-coffee/60">Sobrantes</p>
                        <p className="text-xl font-bold text-peruRed">{staffDiasLibres.sobrantes}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => abrirSolicitudStaff({ tipo: "dia_libre", fecha: fechaHoy })}
                      className="mt-4 w-full rounded-xl bg-peruRed px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      Solicitar día libre
                    </button>
                  </article>
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="text-lg font-bold text-peruRed">Mis solicitudes</h3>
                    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
                      {staffDiasLibres.historial.length === 0 ? (
                        <li className="text-coffee/70">Aún no has enviado solicitudes este año.</li>
                      ) : (
                        staffDiasLibres.historial.map((s) => (
                          <li key={s.id} className="rounded-xl bg-bone px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-semibold">
                                {etiquetaTipoSolicitud(s.tipo)} · {s.fecha}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  s.status === "aprobada"
                                    ? "bg-green-100 text-green-900"
                                    : s.status === "rechazada"
                                      ? "bg-red-100 text-red-900"
                                      : "bg-amber-100 text-amber-900"
                                }`}
                              >
                                {etiquetaEstadoSolicitud(s.status)}
                              </span>
                            </div>
                            {s.detalle ? (
                              <p className="mt-1 text-xs text-coffee/75">{s.detalle}</p>
                            ) : null}
                          </li>
                        ))
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => abrirSolicitudStaff({ tipo: "cambio_turno", fecha: fechaHoy })}
                      className="mt-3 w-full rounded-xl border border-peruRed/25 bg-white px-3 py-2 text-xs font-semibold text-peruRed"
                    >
                      Otra solicitud (cambio de turno)
                    </button>
                  </article>
                  <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-peruRed">
                      <Bell size={18} aria-hidden /> Avisos
                    </h3>
                    <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
                      {misNotificacionesStaff.length === 0 ? (
                        <li className="text-coffee/70">Sin avisos recientes.</li>
                      ) : (
                        misNotificacionesStaff.map((n) => (
                          <li
                            key={n.id}
                            className={`rounded-xl px-3 py-2 ${n.leida ? "bg-bone/80" : "bg-peruMustard/15 ring-1 ring-peruMustard/30"}`}
                          >
                            <p className="font-semibold text-coffee">{n.titulo}</p>
                            <p className="text-xs text-coffee/80">{n.detalle}</p>
                            <p className="mt-1 text-[10px] text-coffee/55">{n.fecha}</p>
                          </li>
                        ))
                      )}
                    </ul>
                  </article>
                </div>
              ) : (
                <article className="rounded-3xl border border-peruRed/15 bg-white p-4 shadow-bento sm:p-5">
                  <div className="mb-1 text-center">
                    <h3 className="text-base font-bold text-peruRed sm:text-lg">Jornadas</h3>
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-peruRed/10 pb-3">
                    <button
                      type="button"
                      onClick={() => setScheduleWeekStart((s) => addDaysIso(s, -7))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-peruRed/20 bg-white text-coffee shadow-sm"
                      aria-label="Semana anterior"
                    >
                      <ChevronLeft size={18} aria-hidden />
                    </button>
                    <p className="min-w-0 flex-1 text-center text-sm font-semibold text-coffee">
                      {scheduleWeekRangeLabel}
                    </p>
                    <button
                      type="button"
                      onClick={() => setScheduleWeekStart((s) => addDaysIso(s, 7))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-peruRed/20 bg-white text-coffee shadow-sm"
                      aria-label="Semana siguiente"
                    >
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </div>

                  <div className="mb-3 flex justify-between gap-1 sm:justify-center sm:gap-2">
                    {scheduleWeekDays.map((iso, i) => {
                      const sel = i === scheduleDayIndex;
                      const isToday = iso === fechaHoy;
                      const narrow = new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
                        weekday: "narrow"
                      });
                      return (
                        <button
                          type="button"
                          key={iso}
                          onClick={() => setScheduleDayIndex(i)}
                          className={`flex h-11 w-11 flex-col items-center justify-center rounded-full border-2 text-[10px] font-bold transition sm:h-12 sm:w-12 ${
                            sel
                              ? "border-peruRed bg-peruRed text-white shadow-md"
                              : "border-peruRed/35 bg-white text-coffee"
                          } ${isToday && !sel ? "ring-2 ring-peruMustard/70 ring-offset-1" : ""}`}
                          aria-current={sel ? "date" : undefined}
                          aria-label={`${iso}`}
                        >
                          <span className="text-[9px] uppercase leading-none opacity-90">{narrow}</span>
                          <span className="text-sm leading-none sm:text-base">{iso.slice(8, 10)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-3 flex border-b-2 border-peruRed/10">
                    <button
                      type="button"
                      onClick={() => setScheduleListMode("day")}
                      className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
                        scheduleListMode === "day"
                          ? "border-b-2 border-peruRed text-peruRed"
                          : "text-coffee/60"
                      }`}
                    >
                      Vista día
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleListMode("week")}
                      className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
                        scheduleListMode === "week"
                          ? "border-b-2 border-peruRed text-peruRed"
                          : "text-coffee/60"
                      }`}
                    >
                      Vista semana
                    </button>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleScope("solo")}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          scheduleScope === "solo"
                            ? "bg-peruRed text-white"
                            : "bg-bone text-coffee ring-1 ring-peruRed/15"
                        }`}
                      >
                        <User size={14} aria-hidden /> Solo yo
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleScope("todos")}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          scheduleScope === "todos"
                            ? "bg-peruRed text-white"
                            : "bg-bone text-coffee ring-1 ring-peruRed/15"
                        }`}
                      >
                        <Users size={14} aria-hidden /> Equipo
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScheduleWeekStart(startOfWeekMondayFromIso(fechaHoy))}
                      className="text-xs font-semibold text-peruRed underline decoration-peruRed/30 underline-offset-2"
                    >
                      Semana actual
                    </button>
                  </div>

                  <p className="mb-2 flex flex-wrap gap-2 text-[10px] text-coffee/60">
                    <span>Programado</span>
                    <span>·</span>
                    <span>Fichado</span>
                    <span>·</span>
                    <span>Cambio del día</span>
                  </p>

                  <div className="max-h-[min(32rem,70vh)] space-y-6 overflow-y-auto pr-1">
                    {scheduleListMode === "day" ? (
                      <div>
                        <h4 className="mb-3 text-sm font-bold capitalize text-coffee">
                          {new Date(`${scheduleFocusDay}T12:00:00`).toLocaleDateString("es-PE", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric"
                          })}
                        </h4>
                        {shiftsDayView.length === 0 ? (
                          <p className="rounded-2xl bg-bone/80 px-4 py-6 text-center text-sm text-coffee/60">
                            {[0, 6].includes(new Date(`${scheduleFocusDay}T12:00:00`).getDay())
                              ? "Fin de semana: aquí solo mostramos lun–vie según planilla."
                              : "No hay turnos para mostrar."}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {shiftsDayView.map((shift) => (
                                <div
                                  key={shift.key}
                                  className="flex items-stretch gap-3 rounded-2xl border border-peruRed/12 bg-white p-3 shadow-sm"
                                >
                                  <div className="flex w-[3.25rem] shrink-0 flex-col items-end justify-center border-r border-peruRed/10 pr-3 text-right">
                                    <span className="text-[9px] font-semibold uppercase text-coffee/45">
                                      Prog.
                                    </span>
                                    <span className="text-sm font-bold tabular-nums text-coffee">
                                      {shift.j.ingreso}
                                    </span>
                                    <span className="text-xs tabular-nums text-coffee/50">
                                      {shift.j.salida}
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-peruRed/12 text-xs font-bold text-peruRed">
                                      {inicialesNombre(shift.p.nombre)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-semibold text-coffee">{shift.p.nombre}</p>
                                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-coffee/70">
                                        <span
                                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                            shift.sede === "Comas" ? "bg-peruRed" : "bg-peruMustard"
                                          }`}
                                          aria-hidden
                                        />
                                        <span>{shift.sede}</span>
                                        <span className="text-coffee/40">·</span>
                                        <span>{shift.p.rol}</span>
                                        <span className="text-coffee/40">·</span>
                                        <span>{formatMinutes(shift.netMin)} netas</span>
                                      </p>
                                    </div>
                                  </div>
                                  {renderShiftStatusBadges({
                                    shift,
                                    iso: scheduleFocusDay,
                                    marcaciones
                                  })}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      shiftsByDayWeek.map(({ iso, header, shifts }) => (
                        <section key={iso}>
                          <h4 className="mb-2 border-b border-peruRed/10 pb-1 text-sm font-bold capitalize text-coffee">
                            {header}
                          </h4>
                          {shifts.length === 0 ? (
                            <p className="rounded-xl bg-bone/60 px-3 py-4 text-center text-xs text-coffee/55">
                              {[0, 6].includes(new Date(`${iso}T12:00:00`).getDay())
                                ? "Descanso — planilla solo lun–vie en esta vista."
                                : "Sin turnos cargados."}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {shifts.map((shift) => (
                                  <div
                                    key={shift.key}
                                    className="flex items-stretch gap-3 rounded-2xl border border-peruRed/12 bg-white p-3 shadow-sm"
                                  >
                                    <div className="flex w-[3.25rem] shrink-0 flex-col items-end justify-center border-r border-peruRed/10 pr-3 text-right">
                                      <span className="text-[9px] font-semibold uppercase text-coffee/45">
                                        Prog.
                                      </span>
                                      <span className="text-sm font-bold tabular-nums text-coffee">
                                        {shift.j.ingreso}
                                      </span>
                                      <span className="text-xs tabular-nums text-coffee/50">
                                        {shift.j.salida}
                                      </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-peruRed/12 text-xs font-bold text-peruRed">
                                        {inicialesNombre(shift.p.nombre)}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-coffee">{shift.p.nombre}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-coffee/70">
                                          <span
                                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                              shift.sede === "Comas" ? "bg-peruRed" : "bg-peruMustard"
                                            }`}
                                            aria-hidden
                                          />
                                          <span>{shift.sede}</span>
                                          <span className="text-coffee/40">·</span>
                                          <span>{shift.p.rol}</span>
                                          <span className="text-coffee/40">·</span>
                                          <span>{formatMinutes(shift.netMin)} netas</span>
                                        </p>
                                      </div>
                                    </div>
                                    {renderShiftStatusBadges({ shift, iso, marcaciones })}
                                  </div>
                                ))}
                            </div>
                          )}


                        </section>
                      ))
                    )}
                  </div>

                  <details className="mt-5 rounded-xl border border-peruRed/10 bg-bone/50 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-peruRed">
                      Plantilla habitual por sede
                    </summary>
                    <div className="mt-3 max-h-48 space-y-3 overflow-y-auto pr-1">
                      {personasHorarioCal.map((p) => (
                        <div
                          key={`det-${p.id}`}
                          className="rounded-xl bg-white/90 p-2 ring-1 ring-peruRed/8"
                        >
                          <p className="font-bold text-coffee">
                            {p.nombre}{" "}
                            <span className="font-normal text-coffee/65">· {p.rol}</span>
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {p.sedes.map((sede) => {
                              const j = jornadaFilaParaUI(
                                jornadas[`${p.id}:${sede}`],
                                p.horario,
                                "17:00"
                              );
                              return (
                                <div key={sede} className="rounded-lg bg-bone px-2 py-1.5 text-[11px]">
                                  <p className="font-semibold text-peruRed">{sede}</p>
                                  <p>
                                    Labor {j.ingreso} – {j.salida}
                                  </p>
                                  <p className="text-coffee/75">
                                    Ref. {j.refrigerioInicio} – {j.refrigerioFin}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              )}

            </aside>
              </section>
            ) : (
              <article className="rounded-3xl border border-peruRed/15 bg-white p-5 text-sm text-coffee shadow-bento">
                Inicia sesión para continuar.
              </article>
            )}
          </section>
        </div>

        <div className={vista === "admin" ? "space-y-5" : "hidden"} aria-hidden={vista !== "admin"}>
          <section className="space-y-5">
            <article
              ref={adminNavRef}
              className="sticky top-3 z-20 rounded-[1.25rem] border border-peruRed/10 bg-white/95 p-4 shadow-[0_4px_28px_rgba(107,45,45,0.08)] backdrop-blur-md"
            >
              <h2 className="mb-3 text-xl font-bold text-peruRed">Vista Administrador</h2>
              <div
                className="flex flex-wrap gap-2"
                role="tablist"
                aria-label="Secciones de administración"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "equipo"}
                  onClick={() => cambiarAdminTab("equipo")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
                    adminTab === "equipo"
                      ? "bg-peruRed text-white shadow-md"
                      : "bg-bone/80 text-coffee hover:bg-peruMustard/35"
                  }`}
                >
                  Control de equipo
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "avisos"}
                  onClick={() => cambiarAdminTab("avisos")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
                    adminTab === "avisos"
                      ? "bg-peruRed text-white shadow-md"
                      : "bg-bone/80 text-coffee hover:bg-peruMustard/35"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Bell size={16} aria-hidden /> Avisos
                    {avisosPendientesCount > 0 ? (
                      <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-peruRed">
                        {avisosPendientesCount}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "comandas"}
                  onClick={() => cambiarAdminTab("comandas")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
                    adminTab === "comandas"
                      ? "bg-peruRed text-white shadow-md"
                      : "bg-bone/80 text-coffee hover:bg-peruMustard/35"
                  }`}
                >
                  Comandas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "marcacion"}
                  onClick={() => cambiarAdminTab("marcacion")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
                    adminTab === "marcacion"
                      ? "bg-peruRed text-white shadow-md"
                      : "bg-bone/80 text-coffee hover:bg-peruMustard/35"
                  }`}
                >
                  Mi marcación
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "analisis"}
                  onClick={() => cambiarAdminTab("analisis")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
                    adminTab === "analisis"
                      ? "bg-peruRed text-white shadow-md"
                      : "bg-bone/80 text-coffee hover:bg-peruMustard/35"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <BarChart3 size={16} aria-hidden /> Análisis
                  </span>
                </button>
              </div>
            </article>

            <div className={adminTab === "equipo" ? "space-y-4" : "hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-peruRed/10 bg-white/90 px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin size={16} className="text-peruRed" aria-hidden />
                <span className="text-xs font-semibold text-coffee/70">Local:</span>
                <button
                  type="button"
                  onClick={() => setFiltroSede("Todas")}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    filtroSede === "Todas" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSede("Comas")}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    filtroSede === "Comas" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Comas
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSede("Surquillo")}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    filtroSede === "Surquillo" ? "bg-peruRed text-white" : "bg-bone text-coffee"
                  }`}
                >
                  Surquillo
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  setModalAltaColab((m) => ({
                    ...m,
                    open: true,
                    apellido: m.apellido ?? "",
                    formError: ""
                  }))
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-peruRed px-4 py-2 text-xs font-semibold text-white shadow-sm sm:text-sm"
              >
                <User size={16} aria-hidden />
                Agregar trabajador
              </button>
            </div>

            <div className="flex flex-wrap gap-1 rounded-[1.25rem] border border-peruRed/10 bg-white p-1.5 shadow-sm sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdminEquipoPanel("horarios");
                  setAdminHorariosPanel("calendario");
                }}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold sm:flex-none sm:px-4 ${
                  adminEquipoPanel === "horarios" && adminHorariosPanel === "calendario"
                    ? "bg-peruRed text-white"
                    : "bg-bone/80 text-coffee hover:bg-peruMustard/25"
                }`}
              >
                Calendario
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminEquipoPanel("horarios");
                  setAdminHorariosPanel("porColaborador");
                }}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold sm:flex-none sm:px-4 ${
                  adminEquipoPanel === "horarios" && adminHorariosPanel === "porColaborador"
                    ? "bg-peruRed text-white"
                    : "bg-bone/80 text-coffee hover:bg-peruMustard/25"
                }`}
              >
                Por persona
              </button>
              <button
                type="button"
                onClick={() => setAdminEquipoPanel("progreso")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold sm:flex-none sm:px-4 ${
                  adminEquipoPanel === "progreso"
                    ? "bg-peruRed text-white"
                    : "bg-bone/80 text-coffee hover:bg-peruMustard/25"
                }`}
              >
                Marcaciones
              </button>
            </div>

            {adminEquipoPanel === "progreso" && (
            <article className="rounded-[1.25rem] border border-peruRed/10 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-lg font-bold text-peruRed">Marcaciones de hoy</h3>
              <p className="mb-3 text-xs text-coffee/65">Revisa progreso y edita fichas del día seleccionado.</p>

              {avisosPendientesCount > 0 ? (
                <div className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-sm text-coffee">
                  <strong>{avisosPendientesCount}</strong> aviso(s) pendiente(s) —{" "}
                  <button
                    type="button"
                    onClick={() => cambiarAdminTab("avisos")}
                    className="font-bold text-peruRed underline"
                  >
                    ir a Avisos
                  </button>
                </div>
              ) : null}

              {overtimePendiente.filter((o) => o.status === "pendiente").length > 0 ? (
                <div className="mb-4 rounded-xl border border-peruRed/15 bg-bone/80 p-3">
                  <p className="mb-2 text-xs font-bold uppercase text-peruRed">Horas extra por aprobar</p>
                  <ul className="space-y-2">
                    {overtimePendiente
                      .filter((o) => o.status === "pendiente")
                      .slice(0, 6)
                      .map((o) => (
                        <li
                          key={o.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                        >
                          <span>
                            <strong>{o.nombre}</strong> · {o.fecha} · +{formatMinutes(o.overtimeMin)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setModalAprobarExtra({
                                open: true,
                                itemId: o.id,
                                minutosAprobar: String(Math.round(o.overtimeMin)),
                                fechaCompensacion: ""
                              })
                            }
                            className="rounded-full bg-peruRed px-3 py-1 text-xs font-semibold text-white"
                          >
                            Aprobar
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <SelectorFechaProgresoEquipo
                adminEquipoVista={adminEquipoVista}
                setAdminEquipoVista={setAdminEquipoVista}
                fechaSeleccionada={fechaSeleccionada}
                setFechaSeleccionada={setFechaSeleccionada}
                fechaSeleccionadaTexto={fechaSeleccionadaTexto}
                fechaHoy={fechaHoy}
                moverFecha={moverFecha}
                adminEquipoWeekRangeLabel={adminEquipoWeekRangeLabel}
                adminEquipoWeekDays={adminEquipoWeekDays}
                shiftEquipoSemanaAdmin={shiftEquipoSemanaAdmin}
                irSemanaActualEquipoAdmin={irSemanaActualEquipoAdmin}
                adminEquipoMonth={adminEquipoMonth}
                setAdminEquipoMonth={setAdminEquipoMonth}
                adminEquipoMonthLabel={adminEquipoMonthLabel}
                adminEquipoMonthWeeks={adminEquipoMonthWeeks}
              />

              <div className="mb-4 flex border-b border-peruRed/10">
                <button
                  type="button"
                  onClick={() => setAdminEquipoDiaTab("progreso")}
                  className={`flex-1 rounded-t-lg py-2.5 text-center text-xs font-semibold sm:text-sm ${
                    adminEquipoDiaTab === "progreso"
                      ? "border-b-2 border-peruRed text-peruRed"
                      : "text-coffee/55"
                  }`}
                >
                  Progreso
                </button>
                <button
                  type="button"
                  onClick={() => setAdminEquipoDiaTab("edicion")}
                  className={`flex-1 rounded-t-lg py-2.5 text-center text-xs font-semibold sm:text-sm ${
                    adminEquipoDiaTab === "edicion"
                      ? "border-b-2 border-peruRed text-peruRed"
                      : "text-coffee/55"
                  }`}
                >
                  Edición y estado
                </button>
              </div>

              {adminEquipoDiaTab === "progreso" && (
                <div className="space-y-2">
                  {progresoPersonal.map((item) => (
                    <div key={`pr-${item.id}`} className="rounded-xl bg-bone/90 p-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">
                          {item.nombre} · {item.rol}
                        </span>
                        <span>
                          {formatMinutes(item.worked)} / {formatMinutes(item.goalNet)}
                          {item.late > 0 ? ` · Tarde ${item.late} min` : ""}
                          {item.overtime > 0 ? ` · Extra +${formatMinutes(item.overtime)}` : ""}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-peruRed transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminEquipoDiaTab === "edicion" && (
                <div>
                  <div className="overflow-x-auto rounded-xl border border-peruRed/10">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="border-b border-peruRed/10 text-left text-peruRed">
                          <th className="p-2">Colaborador</th>
                          <th className="p-2">Rol</th>
                          <th className="p-2">Sede</th>
                          <th className="p-2">Estado</th>
                          <th className="p-2">Horario (ref.)</th>
                          <th className="p-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wide">
                            Entrada
                          </th>
                          <th className="p-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wide">
                            Break in
                          </th>
                          <th className="p-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wide">
                            Break out
                          </th>
                          <th className="p-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wide">
                            Salida
                          </th>
                          <th className="p-2">Tardanza</th>
                          <th className="p-2">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffFiltradoAdmin.map((p) => {
                          const eventosDia = marcaciones.filter(
                            (m) => m.colaboradorId === p.id && m.fecha === fechaSeleccionada
                          );
                          const sedeBase = p.sedes.includes(filtroSede) ? filtroSede : p.sedes[0];
                          const jornadaTabla = getJornadaPlanificada(
                            p.id,
                            sedeBase,
                            fechaSeleccionada,
                            jornadas,
                            turnosPlan,
                            p.horario,
                            "17:00"
                          );
                          const primerIngreso = horaFichadaTipo(eventosDia, "CLOCK_IN", "first");
                          const tardanza =
                            fechaSeleccionada >= fechaHoy
                              ? tardanzaGuardadaEnEventos(eventosDia)
                              : latenessAfterGrace(jornadaTabla.ingreso, primerIngreso || jornadaTabla.ingreso);
                          const tiposHoy = eventosDia.map((e) => e.tipo);
                          const ultimoTipo = [...eventosDia].sort((a, b) =>
                            a.hora.localeCompare(b.hora)
                          ).slice(-1)[0]?.tipo;
                          const estado = !tiposHoy.includes("CLOCK_IN")
                            ? "Pendiente"
                            : ultimoTipo === "CLOCK_OUT"
                              ? "Entre turnos / cerrada"
                              : ultimoTipo === "BREAK_IN"
                                ? "En refrigerio"
                                : "Trabajando";
                          const entrada = horaFichadaTipo(eventosDia, "CLOCK_IN", "first");
                          const breakIn = horaFichadaTipo(eventosDia, "BREAK_IN");
                          const breakOut = horaFichadaTipo(eventosDia, "BREAK_OUT");
                          const salida = horaFichadaTipo(eventosDia, "CLOCK_OUT");
                          const dash = (h) => (h ? formatHora12(h) : "—");
                          return (
                            <tr key={p.id} className="border-b border-peruRed/5">
                              <td className="p-2 font-medium">{p.nombre}</td>
                              <td className="p-2">{p.rol}</td>
                              <td className="p-2">{p.sedes.join(" / ")}</td>
                              <td className="p-2">{estado}</td>
                              <td className="p-2 text-xs leading-snug">
                                <span className="font-medium text-coffee">
                                  {jornadaTabla.ingreso} – {jornadaTabla.salida}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-coffee/65">
                                  Ref. {jornadaTabla.refrigerioInicio} – {jornadaTabla.refrigerioFin}
                                </span>
                              </td>
                              <td className="p-2 font-mono text-xs tabular-nums text-coffee">{dash(entrada)}</td>
                              <td className="p-2 font-mono text-xs tabular-nums text-coffee">{dash(breakIn)}</td>
                              <td className="p-2 font-mono text-xs tabular-nums text-coffee">{dash(breakOut)}</td>
                              <td className="p-2 font-mono text-xs tabular-nums text-coffee">{dash(salida)}</td>
                              <td className="p-2">
                                {tardanza > 0
                                  ? `${tardanza} min`
                                  : primerIngreso
                                    ? "0 min"
                                    : "—"}
                              </td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  onClick={() => openEdit(p)}
                                  className="rounded-full bg-peruMustard px-3 py-1 text-xs font-semibold text-coffee"
                                >
                                  Editar marcaciones
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}
            </article>
            )}

            {adminEquipoPanel === "horarios" && (
            <article className="rounded-[1.25rem] border border-peruRed/10 bg-white p-4 shadow-sm">
              <div className={adminHorariosPanel === "calendario" ? "space-y-4" : "hidden"}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-peruRed">Calendario del equipo</h3>
                  <p className="text-xs text-coffee/65">Elige Día, Semana o Mes. Toca un turno para editarlo.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdminPlanView("month");
                    setAdminMesSeleccionModo(true);
                    abrirModalBulkPlan(adminMesFechasSel.length ? [...adminMesFechasSel] : null);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-peruRed px-4 py-2.5 text-sm font-semibold text-white"
                >
                  {adminMesFechasSel.length > 0
                    ? `Planificar ${adminMesFechasSel.length} día(s)`
                    : "Planificar fechas"}
                </button>
              </div>
              {adminMesFechasSel.length > 0 ? (
                <p className="rounded-xl bg-peruMustard/25 px-3 py-2 text-xs font-semibold text-coffee">
                  {adminMesFechasSel.length} día(s) seleccionados en el mes.{" "}
                  <button type="button" className="underline" onClick={() => setAdminMesFechasSel([])}>
                    Limpiar
                  </button>
                </p>
              ) : null}

              <div className="mb-4 flex border-b-2 border-peruRed/10">
                <button
                  type="button"
                  onClick={() => setAdminPlanView("day")}
                  className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
                    adminPlanView === "day"
                      ? "border-b-2 border-peruRed text-peruRed"
                      : "text-coffee/55"
                  }`}
                >
                  Vista día
                </button>
                <button
                  type="button"
                  onClick={() => setAdminPlanView("week")}
                  className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
                    adminPlanView === "week"
                      ? "border-b-2 border-peruRed text-peruRed"
                      : "text-coffee/55"
                  }`}
                >
                  Vista semana
                </button>
                <button
                  type="button"
                  onClick={() => setAdminPlanView("month")}
                  className={`flex-1 py-2.5 text-center text-xs font-semibold sm:text-sm ${
                    adminPlanView === "month"
                      ? "border-b-2 border-peruRed text-peruRed"
                      : "text-coffee/55"
                  }`}
                >
                  Vista mes
                </button>
              </div>

              {adminPlanView === "month" ? (
                <div className="mb-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-bone px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setAdminPlanMonth((ym) => shiftMonthYm(ym, -1))}
                      className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
                      aria-label="Mes anterior"
                    >
                      <ChevronLeft size={18} aria-hidden />
                    </button>
                    <p className="text-sm font-semibold capitalize text-coffee">{adminPlanMonthLabel}</p>
                    <button
                      type="button"
                      onClick={() => setAdminPlanMonth((ym) => shiftMonthYm(ym, 1))}
                      className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
                      aria-label="Mes siguiente"
                    >
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (adminMesSeleccionModo) {
                          setAdminMesFechasSel([]);
                          setAdminMesSeleccionModo(false);
                        } else {
                          setAdminMesSeleccionModo(true);
                        }
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        adminMesSeleccionModo
                          ? "bg-peruRed text-white"
                          : "bg-white text-coffee ring-1 ring-peruRed/20"
                      }`}
                    >
                      {adminMesSeleccionModo ? "Listo (salir de selección múltiple)" : "Seleccionar varios días"}
                    </button>
                    {adminMesSeleccionModo ? (
                      <span className="text-xs font-medium text-coffee">
                        {adminMesFechasSel.length} día(s) marcado(s) — usa «Planificar fechas» arriba.
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-coffee/55">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                      <div key={`adm-dh-${d}`} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {adminPlanMonthWeeks.map((week, wi) => (
                      <div key={`adm-mw-${wi}`} className="grid grid-cols-7 gap-1">
                        {week.map((iso, di) => {
                          if (!iso) {
                            return (
                              <div
                                key={`adm-e-${wi}-${di}`}
                                className="min-h-[4rem] rounded-lg bg-bone/40"
                              />
                            );
                          }
                          const dayList = shiftsPlannedForDate(
                            iso,
                            staffFiltradoAdminOperativo,
                            jornadas,
                            turnosPlan
                          );
                          return (
                            <button
                              type="button"
                              key={iso}
                              onClick={() => {
                                if (adminMesSeleccionModo) {
                                  setAdminMesFechasSel((prev) =>
                                    prev.includes(iso)
                                      ? prev.filter((x) => x !== iso)
                                      : [...prev, iso].sort()
                                  );
                                  return;
                                }
                                const mon = startOfWeekMondayFromIso(iso);
                                const days = Array.from({ length: 7 }, (_, idx) => addDaysIso(mon, idx));
                                const idxFound = days.findIndex((d) => d === iso);
                                setAdminPlanWeekStart(mon);
                                setAdminPlanDayIndex(idxFound >= 0 ? idxFound : 0);
                                const dt = new Date(`${iso}T12:00:00`);
                                setAdminPlanMonth(
                                  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
                                );
                                setAdminPlanView("day");
                              }}
                              className={`flex min-h-[5.25rem] flex-col rounded-lg border border-peruRed/10 p-1 text-left text-xs transition hover:bg-peruMustard/15 ${
                                adminMesFechasSel.includes(iso)
                                  ? "bg-peruMustard/25 ring-2 ring-peruRed"
                                  : iso === fechaHoy
                                    ? "bg-white ring-2 ring-peruMustard"
                                    : "bg-white"
                              }`}
                            >
                              <span className="shrink-0 font-bold leading-none">
                                {Number(iso.slice(8, 10))}
                              </span>
                              <div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-hidden">
                                {dayList.slice(0, 2).map((s) => (
                                  <div
                                    key={s.key}
                                    className={`truncate rounded px-0.5 text-[8px] font-semibold leading-tight ${
                                      s.esExcepcion ? "bg-peruMustard/50 text-coffee" : "bg-peruRed/10 text-coffee"
                                    }`}
                                  >
                                    {inicialesNombre(s.p.nombre)} {s.j.ingreso}
                                  </div>
                                ))}
                                {dayList.length > 2 ? (
                                  <span className="text-[8px] font-bold text-coffee/55">
                                    +{dayList.length - 2}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirModalPlanTurno({ fecha: adminPlanFocusDay })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-peruRed py-2.5 text-sm font-semibold text-white"
                  >
                    <Plus size={18} aria-hidden /> Añadir o editar (día del círculo)
                  </button>
                </div>
              ) : (
                <div className="mb-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setAdminPlanWeekStart((s) => addDaysIso(s, -7))}
                      className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
                      aria-label="Semana anterior"
                    >
                      <ChevronLeft size={18} aria-hidden />
                    </button>
                    <p className="text-center text-sm font-semibold text-coffee">{adminPlanWeekRangeLabel}</p>
                    <button
                      type="button"
                      onClick={() => setAdminPlanWeekStart((s) => addDaysIso(s, 7))}
                      className="rounded-full border border-peruRed/20 bg-white p-2 shadow-sm"
                      aria-label="Semana siguiente"
                    >
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </div>
                  <div className="flex justify-between gap-1 sm:justify-center sm:gap-2">
                    {adminPlanWeekDays.map((iso, i) => {
                      const sel = i === adminPlanDayIndex;
                      const isToday = iso === fechaHoy;
                      const narrow = new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
                        weekday: "narrow"
                      });
                      return (
                        <button
                          type="button"
                          key={`adm-circ-${iso}`}
                          onClick={() => setAdminPlanDayIndex(i)}
                          className={`flex h-10 w-10 flex-col items-center justify-center rounded-full border-2 text-[9px] font-bold sm:h-11 sm:w-11 ${
                            sel
                              ? "border-peruRed bg-peruRed text-white"
                              : "border-peruRed/30 bg-white text-coffee"
                          } ${isToday && !sel ? "ring-2 ring-peruMustard/70 ring-offset-1" : ""}`}
                        >
                          <span className="uppercase leading-none">{narrow}</span>
                          <span className="text-xs leading-none">{iso.slice(8, 10)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirModalPlanTurno({ fecha: adminPlanFocusDay })}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white sm:flex-none"
                    >
                      <Plus size={17} aria-hidden /> Planificar día seleccionado
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminPlanWeekStart(startOfWeekMondayFromIso(fechaHoy))}
                      className="rounded-xl bg-peruMustard/40 px-3 py-2 text-xs font-bold text-coffee"
                    >
                      Semana actual
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-[min(28rem,65vh)] space-y-4 overflow-y-auto border-t border-peruRed/10 pt-4 pr-1">
                {adminPlanView === "day" ? (
                  <div>
                    <h4 className="mb-2 text-sm font-bold capitalize text-coffee">
                      {new Date(`${adminPlanFocusDay}T12:00:00`).toLocaleDateString("es-PE", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                      })}
                    </h4>
                    {shiftsPlannedForDate(adminPlanFocusDay, staffFiltradoAdminOperativo, jornadas, turnosPlan)
                      .length === 0 ? (
                      <p className="rounded-xl bg-bone px-3 py-4 text-center text-sm text-coffee/60">
                        {[0, 6].includes(new Date(`${adminPlanFocusDay}T12:00:00`).getDay())
                          ? "Fin de semana: sin bloques lun–vie en esta vista."
                          : "Sin turnos para el filtro de búsqueda / sede."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {shiftsPlannedForDate(
                          adminPlanFocusDay,
                          staffFiltradoAdminOperativo,
                          jornadas,
                          turnosPlan
                        ).map((shift) => (
                          <div
                            key={shift.key}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-peruRed/12 bg-bone/50 p-3"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-coffee">{shift.p.nombre}</p>
                              <p className="text-xs text-coffee/65">
                                <span className="font-mono font-bold text-peruRed">
                                  {shift.j.ingreso} – {shift.j.salida}
                                </span>{" "}
                                · {shift.sede} · {formatMinutes(shift.netMin)} en local
                                {shift.esExcepcion ? (
                                  <span className="ml-2 rounded-full bg-peruMustard/40 px-2 py-0.5 text-[10px] font-bold text-coffee">
                                    Plan del día
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  abrirModalPlanTurno({
                                    colaboradorId: shift.p.id,
                                    sede: shift.sede,
                                    fecha: adminPlanFocusDay
                                  })
                                }
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-peruRed ring-1 ring-peruRed/25"
                              >
                                Editar
                              </button>
                              {shift.esExcepcion ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    abrirModalQuitarPlanDia(
                                      shift.p.id,
                                      shift.p.nombre,
                                      adminPlanFocusDay
                                    )
                                  }
                                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
                                >
                                  Eliminar plan
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : adminPlanView === "week" ? (
                  adminPlanWeekDays.map((iso) => (
                    <section key={`adm-wk-${iso}`}>
                      <h4 className="mb-2 border-b border-peruRed/10 pb-1 text-sm font-bold capitalize text-coffee">
                        {new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}
                      </h4>
                      {shiftsPlannedForDate(iso, staffFiltradoAdminOperativo, jornadas, turnosPlan).length === 0 ? (
                        <p className="mb-4 rounded-lg bg-bone/60 px-3 py-2 text-center text-xs text-coffee/55">
                          Sin turnos
                        </p>
                      ) : (
                        <div className="mb-4 space-y-2">
                          {shiftsPlannedForDate(iso, staffFiltradoAdminOperativo, jornadas, turnosPlan).map(
                            (shift) => (
                              <div
                                key={shift.key}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-peruRed/12 bg-white p-3 shadow-sm"
                              >
                                <div className="min-w-0 text-xs">
                                  <span className="font-bold text-coffee">{shift.p.nombre}</span>
                                  <span className="text-coffee/60"> · {shift.sede} · </span>
                                  <span className="font-mono font-semibold text-coffee">
                                    {shift.j.ingreso}–{shift.j.salida}
                                  </span>
                                  {shift.esExcepcion ? (
                                    <span className="ml-1 rounded bg-peruMustard/35 px-1.5 text-[10px] font-bold text-coffee">
                                      Plan día
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      abrirModalPlanTurno({
                                        colaboradorId: shift.p.id,
                                        sede: shift.sede,
                                        fecha: iso
                                      })
                                    }
                                    className="text-xs font-semibold text-peruRed"
                                  >
                                    Editar
                                  </button>
                                  {shift.esExcepcion ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        abrirModalQuitarPlanDia(shift.p.id, shift.p.nombre, iso)
                                      }
                                      className="text-xs font-semibold text-red-800 underline decoration-red-300"
                                    >
                                      Eliminar plan
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </section>
                    ))
                ) : (
                  <p className="py-4 text-center text-sm text-coffee/60">
                    {adminMesSeleccionModo
                      ? "Toca días para marcarlos; luego «Planificar fechas» arriba."
                      : "Toca un día del mes, o cambia a Día / Semana."}
                  </p>
                )}
              </div>


              <details className="mt-4 rounded-xl border border-peruRed/10 bg-bone/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-coffee">
                  Plantillas habituales (horario base por sede)
                </summary>
                <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                  {staffFiltradoAdminOperativo.map((p) => (
                    <div key={`jor-simple-${p.id}`} className="rounded-xl bg-white p-3 ring-1 ring-peruRed/10">
                      <p className="mb-2 text-sm font-semibold">{p.nombre}</p>
                      <div className="flex flex-wrap gap-2">
                        {p.sedes.map((sede) => {
                          const key = `${p.id}:${sede}`;
                          const row = jornadaFilaParaUI(jornadas[key], p.horario, "17:00");
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => abrirModalJornadaPlantilla(p.id, sede)}
                              className="rounded-lg bg-bone px-3 py-2 text-left text-xs ring-1 ring-peruRed/10 hover:ring-peruRed/30"
                            >
                              <span className="font-bold text-peruRed">{sede}</span>
                              <span className="mt-0.5 block font-mono text-coffee">
                                {row.ingreso}–{row.salida}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              </div>

              <div className={adminHorariosPanel === "porColaborador" ? "space-y-3" : "hidden"}>
              <div>
                <h3 className="text-lg font-bold text-peruRed">Horario por persona</h3>
                <p className="mb-3 text-xs text-coffee/65">Elige a alguien y edita cada día del mes.</p>
              </div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <aside className="w-full shrink-0 rounded-2xl border border-peruRed/15 bg-bone/50 p-3 lg:w-52">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-peruRed">Equipo</p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[28rem]">
                    {staffFiltradoAdminOperativo.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setAdminVistaColabId(p.id)}
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                            adminVistaColabId === p.id
                              ? "bg-peruRed font-semibold text-white"
                              : "bg-white text-coffee hover:bg-peruMustard/20"
                          }`}
                        >
                          {p.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
                <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-bold text-coffee">
                  {adminVistaColabPersona?.nombre || "—"}
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl bg-bone px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setAdminVistaColabMonth((ym) => shiftMonthYm(ym, -1))}
                      className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
                      aria-label="Mes anterior"
                    >
                      <ChevronLeft size={18} aria-hidden />
                    </button>
                    <p className="min-w-[10rem] text-center text-sm font-semibold capitalize text-coffee">
                      {adminVistaColabMesLabel}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAdminVistaColabMonth((ym) => shiftMonthYm(ym, 1))}
                      className="rounded-lg bg-white p-2 ring-1 ring-peruRed/10"
                      aria-label="Mes siguiente"
                    >
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </div>
                  {adminVistaColabPersona ? (
                    <button
                      type="button"
                      onClick={() => abrirModalTrabajador(adminVistaColabPersona)}
                      className="rounded-xl border border-peruRed/25 bg-white px-3 py-2 text-xs font-semibold text-coffee"
                    >
                      Ver / editar datos
                    </button>
                  ) : null}
                  {adminVistaColabPersona && supa.enabled ? (
                    <button
                      type="button"
                      onClick={() => abrirModalEliminarTrabajador(adminVistaColabPersona)}
                      className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
                    >
                      Eliminar trabajador
                    </button>
                  ) : null}
                </div>
              </div>
              {adminVistaColabPersona ? (
                <>
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    {adminVistaColabPersona.sedes.map((sede) => {
                      const tplKey = `${adminVistaColabPersona.id}:${sede}`;
                      const row = jornadaFilaParaUI(
                        jornadas[tplKey],
                        adminVistaColabPersona.horario,
                        "17:00"
                      );
                      return (
                        <div
                          key={`vc-tpl-${sede}`}
                          className="rounded-xl border border-peruRed/15 bg-bone/80 p-3 text-sm"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wide text-peruRed">
                            Plantilla · {sede}
                          </p>
                          <p className="mt-1 font-mono font-semibold text-coffee">
                            {row.ingreso} – {row.salida}{" "}
                            <span className="text-xs font-normal text-coffee/70">
                              ref. {row.refrigerioInicio}–{row.refrigerioFin}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              abrirModalJornadaPlantilla(adminVistaColabPersona.id, sede)
                            }
                            className="mt-2 text-xs font-semibold text-peruRed underline decoration-peruRed/30"
                          >
                            Editar plantilla base
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-peruRed/15">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead>
                        <tr className="border-b border-peruRed/15 bg-bone/90 text-left text-xs font-bold uppercase text-coffee/70">
                          <th className="p-2">Fecha</th>
                          <th className="p-2">Día</th>
                          <th className="p-2">Sede</th>
                          <th className="p-2">Labor</th>
                          <th className="p-2">Refrigerio</th>
                          <th className="p-2 w-24"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminVistaColabMesDias.map(({ iso, row }) => {
                          const diaNom = new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
                            weekday: "short"
                          });
                          const laboral = row.kind === "laboral";
                          return (
                            <tr
                              key={`vc-${iso}`}
                              className={`border-b border-peruRed/5 ${
                                row.kind === "descanso" ? "bg-slate-50/80" : ""
                              }`}
                            >
                              <td className="p-2 font-mono text-xs">{iso}</td>
                              <td className="p-2 capitalize text-coffee/80">{diaNom}</td>
                              <td className="p-2">{laboral ? row.sede : "—"}</td>
                              <td className="p-2 font-mono text-xs">
                                {laboral ? `${row.j.ingreso} – ${row.j.salida}` : "—"}
                              </td>
                              <td className="p-2 font-mono text-xs text-coffee/80">
                                {laboral
                                  ? `${row.j.refrigerioInicio} – ${row.j.refrigerioFin}`
                                  : "—"}
                              </td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    abrirModalPlanTurno({
                                      colaboradorId: adminVistaColabPersona.id,
                                      sede:
                                        row.kind === "laboral"
                                          ? row.sede
                                          : adminVistaColabPersona.sedes.includes("Comas")
                                            ? "Comas"
                                            : adminVistaColabPersona.sedes[0],
                                      fecha: iso
                                    })
                                  }
                                  className="text-xs font-semibold text-peruRed"
                                >
                                  {laboral ? "Editar día" : "Planificar día"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-coffee/60">No hay colaborador seleccionado.</p>
              )}
                </div>
              </div>
              </div>
            </article>
            )}

            </div>

            <div className={adminTab === "avisos" ? "" : "hidden"}>
              <section className="rounded-[1.25rem] border border-peruRed/10 bg-white/95 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-peruRed">
                    <AlarmClock size={18} /> Centro de avisos
                    {avisosPendientesCount > 0 ? (
                      <span className="rounded-full bg-peruRed px-2 py-0.5 text-xs text-white">
                        {avisosPendientesCount}
                      </span>
                    ) : null}
                  </h3>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 border-b border-peruRed/10 pb-2">
                  {[
                    ["extra", "Horas extra"],
                    ["solicitudes", "Solicitudes"],
                    ["cambios", "Cambios horario"]
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCentroAvisosTab(id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        centroAvisosTab === id ? "bg-peruRed text-white" : "bg-bone text-coffee"
                      }`}
                    >
                      {label}
                      {id === "solicitudes" &&
                      solicitudes.filter((s) => s.status === "pendiente").length > 0 ? (
                        <span className="ml-1 rounded-full bg-white/90 px-1 text-[10px] text-peruRed">
                          {solicitudes.filter((s) => s.status === "pendiente").length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="max-h-[min(28rem,70vh)] space-y-2 overflow-auto text-sm">
                  {centroAvisosTab === "extra" &&
                    (overtimePendiente.length === 0 ? (
                      <p className="text-coffee/70">Sin horas extra registradas.</p>
                    ) : (
                      overtimePendiente.map((o) => (
                        <div key={o.id} className="rounded-xl bg-bone/90 p-2">
                          <p className="font-semibold">
                            {o.nombre} · {o.fecha} · +{formatMinutes(o.overtimeMin)}
                            <span className="ml-2 text-xs uppercase text-coffee/60">{o.status}</span>
                          </p>
                          {o.status === "pendiente" ? (
                            <button
                              type="button"
                              onClick={() =>
                                setModalAprobarExtra({
                                  open: true,
                                  itemId: o.id,
                                  minutosAprobar: String(Math.round(o.overtimeMin)),
                                  fechaCompensacion: ""
                                })
                              }
                              className="mt-1 text-xs font-semibold text-peruRed underline"
                            >
                              Aprobar / compensar en otro día
                            </button>
                          ) : o.fechaCompensacion ? (
                            <p className="text-xs text-coffee/70">
                              Compensado en {o.fechaCompensacion} ·{" "}
                              {formatMinutes(o.minutosAprobados || 0)}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ))}
                  {centroAvisosTab === "solicitudes" &&
                    (solicitudes.length === 0 ? (
                      <p className="text-coffee/70">Sin solicitudes del equipo.</p>
                    ) : (
                      solicitudes.map((s) => (
                        <div key={s.id} className="rounded-xl bg-bone/90 p-2">
                          <p className="font-semibold">
                            {s.nombre} · {etiquetaTipoSolicitud(s.tipo)} · {s.fecha}
                          </p>
                          <p className="text-xs text-coffee/80">{s.detalle}</p>
                          <p className="text-[10px] uppercase text-coffee/55">
                            {etiquetaEstadoSolicitud(s.status)}
                          </p>
                          {s.status === "pendiente" ? (
                            <div className="mt-1 flex gap-2">
                              <button
                                type="button"
                                onClick={() => resolverSolicitud(s.id, "aprobada")}
                                className="text-xs font-semibold text-green-800"
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                onClick={() => resolverSolicitud(s.id, "rechazada")}
                                className="text-xs font-semibold text-red-800"
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ))}
                  {centroAvisosTab === "cambios" &&
                    (notificaciones.filter((n) => n.tipo !== "extra" && n.tipo !== "solicitud").length ===
                    0 ? (
                      <p className="text-coffee/70">Sin cambios de horario recientes.</p>
                    ) : (
                      notificaciones
                        .filter((n) => n.tipo !== "extra" && n.tipo !== "solicitud")
                        .slice(0, 30)
                        .map((n) => (
                          <div key={n.id} className="rounded-xl bg-bone/90 p-2">
                            <p className="font-semibold">{n.titulo}</p>
                            <p className="text-xs text-coffee/80">{n.detalle}</p>
                            <p className="text-[10px] text-coffee/55">{n.fecha}</p>
                          </div>
                        ))
                    ))}
                </div>

              </section>
            </div>

            <div className={adminTab === "comandas" ? "" : "hidden"}>
              <article className="rounded-3xl border border-peruRed/15 bg-white p-5 shadow-bento">
                <h3 className="mb-4 text-lg font-bold text-peruRed">Registrar comanda</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-coffee">
                    Colaborador
                    <select
                      value={formaComanda.colaboradorId}
                      onChange={(e) =>
                        setFormaComanda((f) => ({ ...f, colaboradorId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    >
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {p.rol}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Sede del consumo
                    <select
                      value={formaComanda.sede}
                      onChange={(e) => setFormaComanda((f) => ({ ...f, sede: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    >
                      <option value="Comas">Comas</option>
                      <option value="Surquillo">Surquillo</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Fecha del registro
                    <input
                      type="date"
                      value={formaComanda.fechaRegistro}
                      onChange={(e) =>
                        setFormaComanda((f) => ({ ...f, fechaRegistro: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Monto S/
                    <input
                      inputMode="decimal"
                      placeholder="Ej. 12.50"
                      value={formaComanda.monto}
                      onChange={(e) => setFormaComanda((f) => ({ ...f, monto: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee sm:col-span-2">
                    Concepto
                    <input
                      type="text"
                      placeholder="Ej. Almuerzo personal"
                      value={formaComanda.concepto}
                      onChange={(e) =>
                        setFormaComanda((f) => ({ ...f, concepto: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee sm:col-span-2">
                    Número de boleta obligatorio
                    <input
                      type="text"
                      placeholder="Ej. B001-4521"
                      value={formaComanda.numeroBoleta}
                      onChange={(e) =>
                        setFormaComanda((f) => ({ ...f, numeroBoleta: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-coffee">Foto de boleta obligatoria</p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                      <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-peruRed/35 bg-bone px-4 py-6">
                        <Camera className="mb-2 text-peruRed" size={28} />
                        <span className="text-center text-xs font-semibold text-coffee">
                          Toca para tomar o elegir foto
                        </span>
                        <input
                          id="comanda-foto-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={onComandaFotoChange}
                          className="hidden"
                        />
                      </label>
                      {formaComanda.fotoDataUrl ? (
                        <div className="flex flex-1 flex-col gap-2">
                          <p className="truncate text-[11px] text-coffee/70">{formaComanda.fotoNombre}</p>
                          <img
                            src={formaComanda.fotoDataUrl}
                            alt="Vista previa boleta"
                            className="max-h-48 w-full max-w-xs rounded-xl border border-peruRed/20 object-contain shadow-sm"
                          />
                        </div>
                      ) : (
                        <p className="flex flex-1 items-center text-xs text-coffee/60">
                          Sin foto aún. La vista previa aparecerá aquí.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={registrarComandaAdministrador}
                  disabled={isBusy("saveComanda")}
                  className="mt-4 w-full rounded-xl bg-peruMustard px-4 py-3 text-sm font-bold text-coffee disabled:opacity-50 sm:w-auto"
                >
                  {isBusy("saveComanda") ? "Guardando comanda..." : "Guardar comanda con código admin"}
                </button>
                <div className="mt-6">
                  <h4 className="mb-2 text-sm font-semibold text-peruRed">Últimos registros</h4>
                  <div className="max-h-60 space-y-2 overflow-auto">
                    {comandasLista.length === 0 ? (
                      <p className="text-sm text-coffee/70">
                        Todavía no hay comandas. El equipo no verá montos hasta que registres una aquí.
                      </p>
                    ) : (
                      comandasLista.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-col gap-2 rounded-xl bg-bone p-3 text-xs"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span>
                              {c.nombre} · {c.sede} · {c.fecha}
                              <span className="block font-semibold text-peruRed">
                                Boleta: {c.numeroBoleta || "—"}
                              </span>
                              <span className="block text-[10px] text-coffee/60">{c.concepto}</span>
                            </span>
                            <span className="font-semibold">S/ {c.monto.toFixed(2)}</span>
                          </div>
                          {c.fotoDataUrl ? (
                            <img
                              src={c.fotoDataUrl}
                              alt={`Boleta ${c.numeroBoleta || ""}`}
                              className="max-h-40 w-full max-w-[200px] rounded-lg border border-peruRed/15 object-contain"
                            />
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </article>
            </div>

            <div className={adminTab === "marcacion" ? "" : "hidden"}>
              <article className="rounded-[1.25rem] border border-peruRed/10 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-peruRed/10 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-peruRed">Tu turno · Administrador</h3>
                    <p className="text-xs text-coffee/70">{colaboradorActivo.nombre}</p>
                  </div>
                  <span className="rounded-full bg-peruMustard/30 px-2.5 py-0.5 text-[10px] font-bold text-coffee">
                    {statusBadge}
                  </span>
                </div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-br from-peruRed to-peruRed/85 px-3 py-2 text-white shadow-md">
                      <Clock3 size={20} className="shrink-0 opacity-90" aria-hidden />
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide opacity-90">Ahora</p>
                        <p className="text-xl font-bold tabular-nums tracking-tight">{formatHora12(horaActual)}</p>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl border border-peruRed/10 bg-bone/80 px-3 py-2">
                      <p className="text-[10px] font-semibold text-coffee">Fecha de fichas</p>
                      <p className="mt-1 text-sm font-semibold text-coffee">
                        {new Date(`${fechaHoy}T12:00:00`).toLocaleDateString("es-PE", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}
                      </p>
                      <p className="mt-1 text-[11px] text-coffee/70">
                        Turno <strong>{sedeTurno}</strong>: {formatHora12(jornadaActiva.ingreso)}–
                        {formatHora12(jornadaActiva.salida)}, ref.{" "}
                        {formatHora12(jornadaActiva.refrigerioInicio)}–
                        {formatHora12(jornadaActiva.refrigerioFin)}. Próximo:{" "}
                        <strong>{EVENT_LABEL[siguiente] || "—"}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {(pulseState === "CLOCK_IN" || pulseState === "NEW_SHIFT") && (
                        <button
                          type="button"
                          onClick={() => registrarMarcacion("CLOCK_IN")}
                          disabled={!accionesPermitidas.includes("CLOCK_IN") || isBusy("marcacion:CLOCK_IN")}
                          className="rounded-full bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
                        >
                          {isBusy("marcacion:CLOCK_IN")
                            ? "Registrando..."
                            : pulseState === "NEW_SHIFT"
                              ? "Nuevo ingreso"
                              : "Registrar ingreso"}
                        </button>
                      )}
                      {pulseState === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            onClick={() => registrarMarcacion("BREAK_IN")}
                            disabled={!accionesPermitidas.includes("BREAK_IN") || isBusy("marcacion:BREAK_IN")}
                            className="rounded-full bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                          >
                            {isBusy("marcacion:BREAK_IN") ? "Registrando..." : "Inicio refrigerio"}
                          </button>
                          <button
                            type="button"
                            onClick={solicitarRegistroSalida}
                            disabled={!accionesPermitidas.includes("CLOCK_OUT") || isBusy("marcacion:CLOCK_OUT")}
                            className="rounded-full bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                          >
                            {isBusy("marcacion:CLOCK_OUT") ? "Registrando..." : "Salida"}
                          </button>
                        </>
                      )}
                      {pulseState === "BREAK_OUT" && (
                        <button
                          type="button"
                          onClick={() => registrarMarcacion("BREAK_OUT")}
                          disabled={!accionesPermitidas.includes("BREAK_OUT") || isBusy("marcacion:BREAK_OUT")}
                          className="rounded-full bg-yellow-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                        >
                          {isBusy("marcacion:BREAK_OUT") ? "Registrando..." : "Fin refrigerio"}
                        </button>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold text-coffee/80">Sede del turno</p>
                      {sedeProgramadaHoy ? (
                        <p className="mb-1 text-[10px] text-coffee/65">
                          Hoy toca: <strong>{sedeProgramadaHoy}</strong>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {colaboradorActivo.sedes.map((sede) => (
                          <button
                            type="button"
                            key={sede}
                            onClick={() => setSedeTurno(sede)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                              sedeTurno === sede
                                ? "bg-peruRed text-white"
                                : sedeProgramadaHoy === sede
                                  ? "bg-peruMustard/50 text-coffee ring-1 ring-peruRed/25"
                                  : "bg-white text-coffee ring-1 ring-peruRed/15"
                            }`}
                          >
                            {sede}
                          </button>
                        ))}
                      </div>
                      {sedeDistintaProgramada ? (
                        <p className="mt-1 text-[10px] text-amber-800">
                          Sede distinta al horario — se generará aviso al fichar.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div className={adminTab === "analisis" ? "space-y-4" : "hidden"}>
              <article className="rounded-[1.25rem] border border-peruRed/10 bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-peruRed">
                  <BarChart3 size={22} aria-hidden /> Análisis operativo
                </h3>
                <PanelAnalisisOperativo
                  stats={adminAnalisisStats}
                  rangoTexto={formatoRangoHumano(analisisAdminRango.desde, analisisAdminRango.hasta)}
                  onEditRango={() => abrirModalRangoAnalisis("admin")}
                  onDetalle={(tipo) => setDetalleAnalisis({ open: true, scope: "admin", tipo })}
                  onExportAdmin={() => descargarNominaExcel()}
                  onExportDueno={undefined}
                  onEnviarReportes={() => mockOwnerAction("Enviar reportes (análisis administrador)")}
                />
              </article>
              <section className="space-y-4">
                <article className="rounded-3xl border border-peruRed/20 bg-white p-4 shadow-bento">
                  <h3 className="text-lg font-bold text-peruRed">Resumen del período</h3>
                  <p className="text-xs text-coffee/70">
                    {formatoRangoHumano(analisisAdminRango.desde, analisisAdminRango.hasta)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => descargarNominaExcel()}
                      className="flex items-center gap-2 rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
                    >
                      <FileSpreadsheet size={16} /> Descargar Excel (Admin)
                    </button>
                  </div>
                </article>
                <div className="grid gap-4 md:grid-cols-3">
                  <article className="rounded-3xl border border-peruRed/20 bg-white p-4 shadow-bento">
                    <p className="text-xs uppercase text-coffee/60">Horas Totales de Planilla</p>
                    <p className="mt-1 text-2xl font-bold text-peruRed">
                      {((adminAnalisisStats.comas + adminAnalisisStats.surquillo) / 60).toFixed(1)}h
                    </p>
                    <p className="text-xs text-coffee/70">
                      Comas {(adminAnalisisStats.comas / 60).toFixed(1)}h vs Surquillo{" "}
                      {(adminAnalisisStats.surquillo / 60).toFixed(1)}h
                    </p>
                  </article>
                  <article className="rounded-3xl border border-peruRed/20 bg-white p-4 shadow-bento">
                    <p className="text-xs uppercase text-coffee/60">Tardanza Total</p>
                    <p className="mt-1 text-2xl font-bold text-peruRed">{adminAnalisisStats.tardanzaTotal} min</p>
                    <p className="text-xs text-coffee/70">
                      Más recurrente: {adminAnalisisStats.topTarde?.nombre || "-"}
                    </p>
                  </article>
                  <article className="rounded-3xl border border-peruRed/20 bg-white p-4 shadow-bento">
                    <p className="text-xs uppercase text-coffee/60">Comandas Total</p>
                    <p className="mt-1 text-2xl font-bold text-peruRed">
                      S/ {adminAnalisisStats.comandasTotal.toFixed(2)}
                    </p>
                  </article>
                </div>
              </section>
            </div>

            <HistorialEdicionesAdmin historialPorColab={historialPorColab} personas={personas} />

          </section>
        </div>

      </div>

      {modalAnalisisRango.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-bold text-peruRed">Período de análisis</h4>
              <button
                type="button"
                onClick={() => setModalAnalisisRango((m) => ({ ...m, open: false }))}
                className="rounded-lg p-1 text-coffee hover:bg-bone"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-coffee">
              Desde
              <input
                type="date"
                value={modalAnalisisRango.desde}
                onChange={(e) =>
                  setModalAnalisisRango((m) => ({ ...m, desde: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Hasta
              <input
                type="date"
                value={modalAnalisisRango.hasta}
                onChange={(e) =>
                  setModalAnalisisRango((m) => ({ ...m, hasta: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalAnalisisRango((m) => ({ ...m, ...defaultAnalisisMonthRange() }))
                }
                className="rounded-xl bg-bone px-3 py-1.5 text-xs font-semibold text-coffee"
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={() =>
                  setModalAnalisisRango((m) => ({ ...m, ...presetAnalisisMesAnterior() }))
                }
                className="rounded-xl bg-bone px-3 py-1.5 text-xs font-semibold text-coffee"
              >
                Mes anterior
              </button>
              <button
                type="button"
                onClick={() =>
                  setModalAnalisisRango((m) => ({ ...m, ...presetAnalisisUltimos30Dias() }))
                }
                className="rounded-xl bg-bone px-3 py-1.5 text-xs font-semibold text-coffee"
              >
                Últimos 30 días
              </button>
              <button
                type="button"
                onClick={() =>
                  setModalAnalisisRango((m) => ({ ...m, ...presetAnalisisAnioEnCurso() }))
                }
                className="rounded-xl bg-bone px-3 py-1.5 text-xs font-semibold text-coffee"
              >
                Año en curso
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAnalisisRango((m) => ({ ...m, open: false }))}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-coffee"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarModalRangoAnalisis}
                className="rounded-xl bg-peruRed px-4 py-2 text-sm font-semibold text-white"
              >
                Guardar período
              </button>
            </div>
          </div>
        </div>
      )}

      {detalleAnalisis.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-peruRed/10 px-5 py-4">
              <h4 className="pr-4 text-lg font-bold text-peruRed">
                {detalleAnalisis.tipo === "horas" && "Detalle · horas netas por día"}
                {detalleAnalisis.tipo === "tardanza" && "Detalle · tardanza por colaborador"}
                {detalleAnalisis.tipo === "comandas" && "Detalle · comandas del período"}
                {detalleAnalisis.tipo === "deuda" && "Detalle · deuda vs meta (por colaborador)"}
              </h4>
              <button
                type="button"
                onClick={() => setDetalleAnalisis((d) => ({ ...d, open: false }))}
                className="shrink-0 rounded-lg p-1 text-coffee hover:bg-bone"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <p className="border-b border-peruRed/5 px-5 py-2 text-xs text-coffee/70">
              Origen:{" "}
              <strong>Administrador</strong> · Período:{" "}
              {formatoRangoHumano(detalleRangoView.desde, detalleRangoView.hasta)}
            </p>
            <div className="overflow-auto p-5">
              {detalleAnalisis.tipo === "horas" &&
                (detalleStatsView.jornadaRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-coffee/60">
                    Sin jornadas con fichas completas en este rango.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-peruRed/15 text-xs font-bold uppercase text-coffee/60">
                          <th className="p-2">Fecha</th>
                          <th className="p-2">Colaborador</th>
                          <th className="p-2">Sede</th>
                          <th className="p-2">Horas netas</th>
                          <th className="p-2">Tardanza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...detalleStatsView.jornadaRows]
                          .sort(
                            (a, b) =>
                              b.fecha.localeCompare(a.fecha) ||
                              a.nombre.localeCompare(b.nombre, "es")
                          )
                          .map((row) => (
                            <tr
                              key={`${row.colaboradorId}-${row.fecha}`}
                              className="border-b border-peruRed/5"
                            >
                              <td className="p-2 font-mono text-xs">{row.fecha}</td>
                              <td className="p-2">{row.nombre}</td>
                              <td className="p-2">{row.sede}</td>
                              <td className="p-2">{(row.worked / 60).toFixed(2)} h</td>
                              <td className="p-2">{row.lateMin} min</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              {detalleAnalisis.tipo === "tardanza" && (
                <ul className="space-y-2 text-sm">
                  {[...detalleStatsView.resumenPorColab]
                    .sort((a, b) => b.lateMin - a.lateMin)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex justify-between rounded-xl bg-bone px-3 py-2"
                      >
                        <span>
                          {p.nombre} <span className="text-xs text-coffee/55">({p.rol})</span>
                        </span>
                        <span className="font-mono font-semibold">{p.lateMin} min</span>
                      </li>
                    ))}
                </ul>
              )}
              {detalleAnalisis.tipo === "comandas" && (
                <div className="space-y-2">
                  {detalleStatsView.comandasEnRango.length === 0 ? (
                    <p className="text-sm text-coffee/60">No hay comandas con fecha en este período.</p>
                  ) : (
                    detalleStatsView.comandasEnRango.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bone p-3 text-sm"
                      >
                        <span>
                          <strong>{c.fecha}</strong> · {c.nombre} · {c.sede}
                          <span className="block text-xs text-coffee/65">{c.concepto}</span>
                        </span>
                        <span className="font-semibold text-peruRed">S/ {c.monto.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {detalleAnalisis.tipo === "deuda" && (
                <ul className="space-y-2 text-sm">
                  {[...detalleStatsView.resumenPorColab]
                    .sort((a, b) => b.debt - a.debt)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex justify-between rounded-xl bg-bone px-3 py-2"
                      >
                        <span>{p.nombre}</span>
                        <span className="font-mono">
                          {(p.debt / 60).toFixed(2)} h ({p.debt} min)
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {modalPlan.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Plan de turno para un día</h4>

            <label className="mt-4 block text-xs font-semibold text-coffee">Colaborador</label>
            <select
              value={modalPlan.colaboradorId}
              onChange={(e) => {
                const colaboradorId = e.target.value;
                const p = personas.find((x) => x.id === colaboradorId);
                const sede =
                  p?.sedes.includes(modalPlan.sede) && modalPlan.sede
                    ? modalPlan.sede
                    : p?.sedes[0] || "Comas";
                const j = getJornadaPlanificada(
                  colaboradorId,
                  sede,
                  modalPlan.fecha,
                  jornadas,
                  turnosPlan,
                  p?.horario,
                  "17:00"
                );
                setModalPlan((prev) => ({
                  ...prev,
                  colaboradorId,
                  sede,
                  plantillaTurnoId: matchTurnTemplateId(j),
                  ingreso: j.ingreso,
                  salida: j.salida,
                  refrigerioInicio: j.refrigerioInicio,
                  refrigerioFin: j.refrigerioFin
                }));
              }}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.rol}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-semibold text-coffee">Sede del turno</label>
            <select
              value={modalPlan.sede}
              onChange={(e) => {
                const sede = e.target.value;
                const p = personas.find((x) => x.id === modalPlan.colaboradorId);
                const j = getJornadaPlanificada(
                  modalPlan.colaboradorId,
                  sede,
                  modalPlan.fecha,
                  jornadas,
                  turnosPlan,
                  p?.horario,
                  "17:00"
                );
                setModalPlan((prev) => ({
                  ...prev,
                  sede,
                  plantillaTurnoId: matchTurnTemplateId(j),
                  ingreso: j.ingreso,
                  salida: j.salida,
                  refrigerioInicio: j.refrigerioInicio,
                  refrigerioFin: j.refrigerioFin
                }));
              }}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
            >
              {(personas.find((x) => x.id === modalPlan.colaboradorId)?.sedes || ["Comas"]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-semibold text-coffee">Fecha</label>
            <input
              type="date"
              value={modalPlan.fecha}
              onChange={(e) => {
                const fecha = e.target.value;
                const p = personas.find((x) => x.id === modalPlan.colaboradorId);
                const j = getJornadaPlanificada(
                  modalPlan.colaboradorId,
                  modalPlan.sede,
                  fecha,
                  jornadas,
                  turnosPlan,
                  p?.horario,
                  "17:00"
                );
                setModalPlan((prev) => ({
                  ...prev,
                  fecha,
                  plantillaTurnoId: matchTurnTemplateId(j),
                  ingreso: j.ingreso,
                  salida: j.salida,
                  refrigerioInicio: j.refrigerioInicio,
                  refrigerioFin: j.refrigerioFin
                }));
              }}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
            />

            <EditorPlantillaTurno
              plantillaTurnoId={modalPlan.plantillaTurnoId}
              onPlantillaChange={(id) => setModalPlan((prev) => ({ ...prev, plantillaTurnoId: id }))}
              ingreso={modalPlan.ingreso}
              salida={modalPlan.salida}
              refrigerioInicio={modalPlan.refrigerioInicio}
              refrigerioFin={modalPlan.refrigerioFin}
              onTimesChange={(times) => setModalPlan((prev) => ({ ...prev, ...times }))}
            />

            <label className="mt-3 block text-sm font-semibold">{adminPinLabel}</label>
            <input
              type="password"
              inputMode={supa.enabled ? "numeric" : undefined}
              maxLength={supa.enabled ? 6 : undefined}
              value={modalPlan.code}
              onChange={(e) => setModalPlan((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
              placeholder="••••••"
              autoComplete="off"
            />

            {findPlanEntryForPersonDate(turnosPlan, modalPlan.colaboradorId, modalPlan.fecha) && (
              <p className="mt-2 text-[11px] text-amber-800">
                Ya hay plan este día; guardar lo reemplaza.
              </p>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-peruRed/10 pt-4">
              <button
                type="button"
                onClick={() => setModalPlan((m) => ({ ...m, open: false, code: "" }))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runBusyAction("saveDayPlan", async () => guardarModalPlanTurno())}
                disabled={isBusy("saveDayPlan")}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("saveDayPlan") ? "Guardando..." : "Guardar plan del día"}
              </button>
            </div>

            {findPlanEntryForPersonDate(turnosPlan, modalPlan.colaboradorId, modalPlan.fecha) ? (
              <div className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50/80 p-4">
                <p className="text-sm font-bold text-red-900">Eliminar este plan del día</p>
                <p className="mt-1 text-xs text-coffee/80">
                  Quita la excepción: ese día volverá a calcularse solo con la <strong>plantilla fija</strong> (una
                  fila por persona, sede con ingreso más temprano).
                </p>
                <button
                  type="button"
                  onClick={() => runBusyAction("deleteDayPlan", async () => eliminarPlanTurnoDia())}
                  disabled={isBusy("deleteDayPlan")}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-400 bg-white px-3 py-2.5 text-sm font-semibold text-red-900 shadow-sm disabled:opacity-50 sm:w-auto"
                >
                  <Trash2 size={18} aria-hidden />{" "}
                  {isBusy("deleteDayPlan")
                    ? "Eliminando plan..."
                    : "Eliminar plan del día (código arriba)"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {modalQuitarPlanDia.open && (
        <div className="fixed inset-0 z-[52] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-red-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-red-900">Eliminar plan del día</h4>
            <p className="mt-2 text-sm text-coffee">
              ¿Quitar el plan de <strong>{modalQuitarPlanDia.nombre}</strong> el{" "}
              <strong>{modalQuitarPlanDia.fecha}</strong>? Volverá la plantilla habitual para esa fecha.
            </p>
            <label className="mt-4 block text-sm font-semibold">{adminPinLabel}</label>
            <input
              type="password"
              inputMode={supa.enabled ? "numeric" : undefined}
              maxLength={supa.enabled ? 6 : undefined}
              value={modalQuitarPlanDia.code}
              onChange={(e) =>
                setModalQuitarPlanDia((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))
              }
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
              placeholder="••••••"
              autoComplete="off"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalQuitarPlanDia({
                    open: false,
                    colaboradorId: "",
                    nombre: "",
                    fecha: "",
                    code: ""
                  })
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  runBusyAction("confirmDeleteDayPlan", async () => confirmarQuitarPlanDiaLista())
                }
                disabled={isBusy("confirmDeleteDayPlan")}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("confirmDeleteDayPlan") ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalBulkPlan.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Plan en varias fechas</h4>
            <p className="mt-1 text-xs text-coffee/70">
              Mismo horario para cada fecha indicada. <strong>Una jornada planificada por persona y día</strong>:
              en cada fecha se borra cualquier plan previo de esa persona y se guarda este bloque en la sede
              elegida.
            </p>

            {Array.isArray(modalBulkPlan.fechasPreset) && modalBulkPlan.fechasPreset.length > 0 ? (
              <p className="mt-3 rounded-lg bg-peruMustard/25 px-3 py-2 text-xs font-semibold text-coffee">
                Se aplicará a {modalBulkPlan.fechasPreset.length} día(s) elegidos en el calendario.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-coffee">
                  Desde
                  <input
                    type="date"
                    value={modalBulkPlan.fechaDesde}
                    onChange={(e) =>
                      setModalBulkPlan((prev) => ({ ...prev, fechaDesde: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-coffee">
                  Hasta
                  <input
                    type="date"
                    value={modalBulkPlan.fechaHasta}
                    onChange={(e) =>
                      setModalBulkPlan((prev) => ({ ...prev, fechaHasta: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                  />
                </label>
                <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-coffee">
                  <input
                    type="checkbox"
                    checked={modalBulkPlan.omitirFinDeSemana}
                    onChange={(e) =>
                      setModalBulkPlan((prev) => ({ ...prev, omitirFinDeSemana: e.target.checked }))
                    }
                    className="rounded border-peruRed/40"
                  />
                  Omitir sábados y domingos en el rango
                </label>
              </div>
            )}

            <label className="mt-4 block text-xs font-semibold text-coffee">Colaborador</label>
            <select
              value={modalBulkPlan.colaboradorId}
              onChange={(e) => {
                const colaboradorId = e.target.value;
                const p = personas.find((x) => x.id === colaboradorId);
                const sede =
                  p?.sedes.includes(modalBulkPlan.sede) && modalBulkPlan.sede
                    ? modalBulkPlan.sede
                    : p?.sedes[0] || "Comas";
                setModalBulkPlan((prev) => ({ ...prev, colaboradorId, sede }));
              }}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
            >
              {staffFiltradoAdminOperativo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.rol}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-semibold text-coffee">Sede del turno</label>
            <select
              value={modalBulkPlan.sede}
              onChange={(e) => setModalBulkPlan((prev) => ({ ...prev, sede: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
            >
              {(
                personas.find((x) => x.id === modalBulkPlan.colaboradorId)?.sedes || ["Comas"]
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <EditorPlantillaTurno
              plantillaTurnoId={modalBulkPlan.plantillaTurnoId}
              onPlantillaChange={(id) => setModalBulkPlan((prev) => ({ ...prev, plantillaTurnoId: id }))}
              ingreso={modalBulkPlan.ingreso}
              salida={modalBulkPlan.salida}
              refrigerioInicio={modalBulkPlan.refrigerioInicio}
              refrigerioFin={modalBulkPlan.refrigerioFin}
              onTimesChange={(times) => setModalBulkPlan((prev) => ({ ...prev, ...times }))}
            />

            <label className="mt-3 block text-sm font-semibold">{adminPinLabel}</label>
            <input
              type="password"
              inputMode={supa.enabled ? "numeric" : undefined}
              maxLength={supa.enabled ? 6 : undefined}
              value={modalBulkPlan.code}
              onChange={(e) => setModalBulkPlan((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
              placeholder="••••••"
              autoComplete="off"
            />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalBulkPlan((m) => ({ ...m, open: false, code: "", fechasPreset: null }))
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runBusyAction("saveBulkPlan", async () => guardarModalBulkPlan())}
                disabled={isBusy("saveBulkPlan")}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("saveBulkPlan") ? "Aplicando..." : "Aplicar a las fechas"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalJornadaTpl.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Editar plantilla de jornada</h4>
            <p className="mt-1 text-xs text-coffee/70">
              {personas.find((x) => x.id === modalJornadaTpl.colaboradorId)?.nombre} · {modalJornadaTpl.sede}
            </p>
            <EditorPlantillaTurno
              plantillaTurnoId={modalJornadaTpl.plantillaTurnoId}
              onPlantillaChange={(id) => setModalJornadaTpl((prev) => ({ ...prev, plantillaTurnoId: id }))}
              ingreso={modalJornadaTpl.ingreso}
              salida={modalJornadaTpl.salida}
              refrigerioInicio={modalJornadaTpl.refrigerioInicio}
              refrigerioFin={modalJornadaTpl.refrigerioFin}
              onTimesChange={(times) => setModalJornadaTpl((prev) => ({ ...prev, ...times }))}
            />
            <label className="mt-3 block text-sm font-semibold">{adminPinLabel}</label>
            <input
              type="password"
              inputMode={supa.enabled ? "numeric" : undefined}
              maxLength={supa.enabled ? 6 : undefined}
              value={modalJornadaTpl.code}
              onChange={(e) => setModalJornadaTpl((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
              placeholder="••••••"
              autoComplete="off"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalJornadaTpl((m) => ({ ...m, open: false, code: "" }))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runBusyAction("saveTemplate", async () => guardarModalJornadaPlantilla())}
                disabled={isBusy("saveTemplate")}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("saveTemplate") ? "Guardando..." : "Guardar plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEliminarJornadaTpl.open && (
        <div className="fixed inset-0 z-[51] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-red-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-red-900">Confirmar eliminación de plantilla</h4>
            <p className="mt-2 text-sm text-coffee">
              ¿Quitar la <strong>plantilla fija</strong> de jornada para{" "}
              <strong>
                {personas.find((x) => x.id === modalEliminarJornadaTpl.colaboradorId)?.nombre}
              </strong>{" "}
              en <strong>{modalEliminarJornadaTpl.sede}</strong>?
            </p>
            <label className="mt-4 block text-sm font-semibold">{adminPinLabel}</label>
            <input
              type="password"
              inputMode={supa.enabled ? "numeric" : undefined}
              maxLength={supa.enabled ? 6 : undefined}
              value={modalEliminarJornadaTpl.code}
              onChange={(e) =>
                setModalEliminarJornadaTpl((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))
              }
              className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
              placeholder="••••••"
              autoComplete="off"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalEliminarJornadaTpl({ open: false, colaboradorId: "", sede: "", code: "" })
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runBusyAction("deleteTemplate", async () => confirmarEliminarJornadaPlantilla())}
                disabled={isBusy("deleteTemplate")}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("deleteTemplate") ? "Eliminando..." : "Sí, eliminar plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEdit.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Flujo seguro de edición</h4>
            <p className="mt-1 text-sm">{modalEdit.colab?.nombre}</p>
            <p className="mt-1 text-xs text-coffee/70">
              Fecha de las marcaciones: <span className="font-semibold">{fechaSeleccionadaTexto}</span>
            </p>

            {modalEdit.step === "verify" ? (
              <>
                <label className="mt-3 block text-sm font-semibold">{adminPinLabel}</label>
                <input
                  type="password"
                  inputMode={supa.enabled ? "numeric" : undefined}
                  maxLength={supa.enabled ? 6 : undefined}
                  value={modalEdit.code}
                  onChange={(e) => setModalEdit((prev) => ({ ...prev, code: patchAdminPinInput(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 tracking-[0.25em]"
                  placeholder="••••••"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.form?.requestSubmit?.();
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (await verifyAdminCode(modalEdit.code)) {
                      setModalEdit((prev) => ({ ...prev, step: "edit" }));
                      setMensaje("Identidad verificada.");
                    } else {
                      setMensaje(supa.enabled ? "PIN de gerente incorrecto." : "Código admin inválido.");
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
                >
                  Verificar código
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-[11px] text-coffee/65">
                  Ajusta solo los campos que correspondan; los vacíos se eliminan del día para ese tipo de
                  marcación.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-coffee">
                    Ingreso
                    <input
                      type="time"
                      value={modalEdit.horaIngreso}
                      onChange={(e) =>
                        setModalEdit((prev) => ({ ...prev, horaIngreso: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Inicio refrigerio
                    <input
                      type="time"
                      value={modalEdit.horaBreakIn}
                      onChange={(e) =>
                        setModalEdit((prev) => ({ ...prev, horaBreakIn: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Fin refrigerio
                    <input
                      type="time"
                      value={modalEdit.horaBreakOut}
                      onChange={(e) =>
                        setModalEdit((prev) => ({ ...prev, horaBreakOut: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-coffee">
                    Salida
                    <input
                      type="time"
                      value={modalEdit.horaSalida}
                      onChange={(e) =>
                        setModalEdit((prev) => ({ ...prev, horaSalida: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-sm font-semibold">Justificacion obligatoria</label>
                <textarea
                  value={motivoEdit}
                  onChange={(e) => setMotivoEdit(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2"
                  placeholder="Explica por que se cambia el horario..."
                />
                <label className="mt-3 block text-sm font-semibold">Cargar evidencia obligatoria</label>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-peruRed/30 px-3 py-2">
                  <Camera size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEvidenciaEdit(e.target.files?.[0] || null)}
                    className="w-full text-xs"
                  />
                </div>
                {evidenciaEdit && <p className="mt-1 text-xs text-coffee/70">{evidenciaEdit.name}</p>}
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalEdit({
                    open: false,
                    colab: null,
                    step: "verify",
                    code: "",
                    horaIngreso: "",
                    horaBreakIn: "",
                    horaBreakOut: "",
                    horaSalida: ""
                  })
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runBusyAction("saveEdit", async () => saveEdit())}
                disabled={
                  isBusy("saveEdit") ||
                  modalEdit.step !== "edit" ||
                  !motivoEdit.trim() ||
                  !evidenciaEdit ||
                  !(
                    modalEdit.horaIngreso ||
                    modalEdit.horaBreakIn ||
                    modalEdit.horaBreakOut ||
                    modalEdit.horaSalida
                  )
                }
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isBusy("saveEdit") ? "Guardando..." : "Guardar ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAprobarExtra.open && (
        <div className="fixed inset-0 z-[56] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Aprobar horas extra</h4>
            <p className="mt-2 text-sm text-coffee/75">
              Confirma cuántas horas extra reconoces. Opcional: asigna esas horas a otro día de la semana
              (compensación).
            </p>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Minutos a aprobar
              <input
                type="number"
                min={1}
                value={modalAprobarExtra.minutosAprobar}
                onChange={(e) =>
                  setModalAprobarExtra((m) => ({ ...m, minutosAprobar: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Compensar en otro día (opcional)
              <input
                type="date"
                value={modalAprobarExtra.fechaCompensacion}
                onChange={(e) =>
                  setModalAprobarExtra((m) => ({ ...m, fechaCompensacion: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalAprobarExtra({
                    open: false,
                    itemId: "",
                    minutosAprobar: "",
                    fechaCompensacion: ""
                  })
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aprobarExtraPendiente}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
              >
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalSolicitudStaff.open && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Solicitud al gerente</h4>
            {modalSolicitudStaff.tipo === "dia_libre" ? (
              <p className="mt-2 text-xs text-coffee/75">
                Indica la fecha y el motivo breve. Gerencia revisará en Avisos; el saldo aparece en
                Organización.
              </p>
            ) : null}
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Tipo
              <select
                value={modalSolicitudStaff.tipo}
                onChange={(e) =>
                  setModalSolicitudStaff((m) => ({ ...m, tipo: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              >
                <option value="dia_libre">Día libre</option>
                <option value="cambio_turno">Cambio de turno</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Fecha relacionada
              <input
                type="date"
                value={modalSolicitudStaff.fecha}
                onChange={(e) =>
                  setModalSolicitudStaff((m) => ({ ...m, fecha: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Detalle breve
              <textarea
                rows={3}
                value={modalSolicitudStaff.detalle}
                onChange={(e) =>
                  setModalSolicitudStaff((m) => ({ ...m, detalle: e.target.value.slice(0, 280) }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                placeholder="Ej.: necesito el viernes libre por cita médica"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalSolicitudStaff({ open: false, tipo: "dia_libre", fecha: "", detalle: "" })
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviarSolicitudStaff}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalSalidaNota.open && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Registrar salida</h4>
            <p className="mt-2 text-sm text-coffee/75">
              Hora: <strong>{formatHora12(horaActual)}</strong>. Opcional: deja un comentario (entrega, novedad, etc.).
            </p>
            <label className="mt-4 block text-xs font-semibold text-coffee">
              Comentario (opcional)
              <textarea
                value={modalSalidaNota.nota}
                onChange={(e) => setModalSalidaNota((m) => ({ ...m, nota: e.target.value.slice(0, 240) }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-peruRed/20 px-3 py-2 text-sm"
                placeholder="Ej.: Turno completo, entrega de caja…"
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalSalidaNota({ open: false, nota: "" })}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarSalidaConNota}
                disabled={isBusy("marcacion:CLOCK_OUT")}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("marcacion:CLOCK_OUT") ? "Registrando…" : "Confirmar salida"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalDeleteWorker.open && (
        <div className="fixed inset-0 z-[54] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-red-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-red-900">Eliminar trabajador</h4>
            <p className="mt-2 text-sm text-coffee">
              Vas a eliminar a <strong>{modalDeleteWorker.nombre}</strong>. Enviaremos un código de 6
              dígitos a <strong>{supa.adminNotifyEmail}</strong>.
            </p>
            {modalDeleteWorker.step === "request" ? (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setModalDeleteWorker({
                      open: false,
                      workerId: "",
                      nombre: "",
                      step: "request",
                      code: "",
                      devHint: ""
                    })
                  }
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={solicitarCodigoEliminarTrabajador}
                  disabled={isBusy("deleteWorkerRequest")}
                  className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isBusy("deleteWorkerRequest") ? "Enviando…" : "Enviar código al correo"}
                </button>
              </div>
            ) : (
              <>
                {modalDeleteWorker.devHint ? (
                  <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-coffee">
                    {modalDeleteWorker.emailSent
                      ? "Si no llegó el correo, usa este código:"
                      : "Correo no enviado — usa este código para confirmar:"}{" "}
                    <strong className="font-mono text-lg tracking-widest">{modalDeleteWorker.devHint}</strong>
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-coffee/70">
                    Revisa la bandeja de <strong>{supa.adminNotifyEmail}</strong> (y spam).
                  </p>
                )}
                <label className="mt-4 block text-xs font-semibold text-coffee">
                  Código del correo (6 dígitos)
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={modalDeleteWorker.code}
                    onChange={(e) =>
                      setModalDeleteWorker((m) => ({
                        ...m,
                        code: e.target.value.replace(/\D/g, "").slice(0, 6)
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
                    autoComplete="off"
                  />
                </label>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setModalDeleteWorker((m) => ({ ...m, step: "request", code: "" }))
                    }
                    className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
                  >
                    Reenviar código
                  </button>
                  <button
                    type="button"
                    onClick={confirmarEliminarTrabajador}
                    disabled={isBusy("deleteWorkerConfirm")}
                    className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isBusy("deleteWorkerConfirm") ? "Eliminando…" : "Confirmar eliminación"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalWorkerCreado.open && (
        <div className="fixed inset-0 z-[53] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Trabajador creado</h4>
            <p className="mt-2 text-sm text-coffee">
              <strong>{modalWorkerCreado.nombre}</strong> ({modalWorkerCreado.email}) ya está en el equipo.
            </p>
            {modalWorkerCreado.emailStatus === "sent" ? (
              <p className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Correo de PIN enviado a <strong>{modalWorkerCreado.email}</strong>
                {modalWorkerCreado.adminNotified
                  ? `. Confirmación a gerencia: ${modalWorkerCreado.adminNotified}.`
                  : "."}
              </p>
            ) : (
              <div
                className="mt-2 rounded-xl border-2 border-red-400 bg-red-50 px-3 py-2 text-xs text-red-900"
                role="alert"
              >
                <p className="font-bold">Correo al trabajador NO enviado</p>
                <p className="mt-1">{modalWorkerCreado.emailError}</p>
                <p className="mt-2 font-semibold text-red-950">
                  El trabajador igual quedó creado — usa <strong>Copiar</strong> o{" "}
                  <strong>Abrir enlace</strong> para el PIN.
                </p>
              </div>
            )}
            <p className="mt-3 text-xs font-semibold text-coffee">
              Enlace para crear PIN (obligatorio si el correo falló):
            </p>
            <div className="mt-1 flex gap-2">
              <input
                readOnly
                value={modalWorkerCreado.link}
                className="min-w-0 flex-1 rounded-xl border border-peruRed/25 bg-bone px-2 py-2 text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(modalWorkerCreado.link);
                  setMensaje("Enlace copiado al portapapeles.");
                }}
                className="shrink-0 rounded-xl bg-peruRed px-3 py-2 text-xs font-semibold text-white"
              >
                Copiar
              </button>
            </div>
            <a
              href={modalWorkerCreado.link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-peruRed underline"
            >
              Abrir enlace de PIN ahora
            </a>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setModalWorkerCreado({
                    open: false,
                    nombre: "",
                    email: "",
                    link: "",
                    adminNotified: "",
                    emailStatus: "failed",
                    emailError: ""
                  })
                }
                className="rounded-xl bg-peruRed px-4 py-2 text-sm font-semibold text-white"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAltaColab.open && (
        <div className="fixed inset-0 z-[52] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Agregar trabajador</h4>
            {modalAltaColab.formError ? (
              <div
                className="mt-3 rounded-xl border-2 border-red-400 bg-red-50 px-3 py-2 text-xs text-red-900"
                role="alert"
              >
                <p className="font-bold">No se puede crear aún</p>
                <p className="mt-1">{modalAltaColab.formError}</p>
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-coffee">
                Nombre *
                <input
                  type="text"
                  value={modalAltaColab.nombre}
                  onChange={(e) =>
                    setModalAltaColab((m) => ({ ...m, nombre: e.target.value, formError: "" }))
                  }
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                  autoComplete="given-name"
                />
              </label>
              <label className="block text-xs font-semibold text-coffee">
                Apellido *
                <input
                  type="text"
                  value={modalAltaColab.apellido}
                  onChange={(e) =>
                    setModalAltaColab((m) => ({ ...m, apellido: e.target.value, formError: "" }))
                  }
                  className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                  autoComplete="family-name"
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Correo
              <input
                type="email"
                value={modalAltaColab.email}
                onChange={(e) =>
                  setModalAltaColab((m) => ({ ...m, email: e.target.value, formError: "" }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
                autoComplete="email"
              />
            </label>
            <CampoTelefono
              label="WhatsApp (teléfono)"
              required
              id="alta-whatsapp"
              country={modalAltaColab.whatsappCountry}
              number={modalAltaColab.whatsappNumber}
              onCountry={(v) => setModalAltaColab((m) => ({ ...m, whatsappCountry: v, formError: "" }))}
              onNumber={(v) => setModalAltaColab((m) => ({ ...m, whatsappNumber: v, formError: "" }))}
            />
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Fecha de nacimiento
              <input
                type="date"
                value={modalAltaColab.fechaNacimiento}
                onChange={(e) => setModalAltaColab((m) => ({ ...m, fechaNacimiento: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Dirección
              <input
                type="text"
                value={modalAltaColab.direccion}
                onChange={(e) => setModalAltaColab((m) => ({ ...m, direccion: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Contacto de emergencia — nombre
              <input
                type="text"
                value={modalAltaColab.contactoEmergenciaNombre}
                onChange={(e) =>
                  setModalAltaColab((m) => ({ ...m, contactoEmergenciaNombre: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              />
            </label>
            <CampoTelefono
              label="Contacto de emergencia — teléfono"
              id="alta-emerg"
              country={modalAltaColab.emergCountry}
              number={modalAltaColab.emergNumber}
              onCountry={(v) => setModalAltaColab((m) => ({ ...m, emergCountry: v }))}
              onNumber={(v) => setModalAltaColab((m) => ({ ...m, emergNumber: v }))}
            />
            <EditorPlantillaTurno
              plantillaTurnoId={modalAltaColab.plantillaTurnoId}
              onPlantillaChange={(id) => setModalAltaColab((m) => ({ ...m, plantillaTurnoId: id }))}
              ingreso={modalAltaColab.ingreso}
              salida={modalAltaColab.salida}
              refrigerioInicio={modalAltaColab.refrigerioInicio}
              refrigerioFin={modalAltaColab.refrigerioFin}
              onTimesChange={(times) =>
                setModalAltaColab((m) => ({
                  ...m,
                  ...times,
                  horario: times.ingreso ?? m.ingreso
                }))
              }
            />
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Días libre al año
              <input
                type="number"
                min={0}
                max={60}
                value={modalAltaColab.diasLibresAnuales}
                onChange={(e) =>
                  setModalAltaColab((m) => ({ ...m, diasLibresAnuales: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm"
              />
            </label>
            <p className="mt-3 text-xs font-semibold text-coffee">Sedes</p>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={modalAltaColab.comas}
                  onChange={(e) =>
                    setModalAltaColab((m) => ({ ...m, comas: e.target.checked, formError: "" }))
                  }
                />
                Comas
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={modalAltaColab.surquillo}
                  onChange={(e) =>
                    setModalAltaColab((m) => ({ ...m, surquillo: e.target.checked, formError: "" }))
                  }
                />
                Surquillo
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={resetModalAltaColab} className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAltaColaborador}
                disabled={isBusy("createWorker")}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("createWorker") ? "Registrando…" : "Crear trabajador"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalTrabajadorInfo.open && (
        <div className="fixed inset-0 z-[52] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-lg font-bold text-peruRed">
                {modalTrabajadorInfo.editing ? "Editar trabajador" : "Datos del trabajador"}
              </h4>
              {!modalTrabajadorInfo.editing && vista === "admin" ? (
                <button
                  type="button"
                  onClick={() => setModalTrabajadorInfo((m) => ({ ...m, editing: true }))}
                  className="rounded-lg bg-bone px-2 py-1 text-xs font-semibold text-coffee"
                >
                  Editar
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-coffee">{modalTrabajadorInfo.nombre}</p>
            {modalTrabajadorInfo.editing ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-coffee">
                  Correo
                  <input
                    type="email"
                    value={modalTrabajadorInfo.email}
                    onChange={(e) =>
                      setModalTrabajadorInfo((m) => ({ ...m, email: e.target.value }))
                    }
                    disabled={modalTrabajadorInfo.supabaseWorker}
                    className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </label>
                <EditorPlantillaTurno
                  plantillaTurnoId={modalTrabajadorInfo.plantillaTurnoId}
                  onPlantillaChange={(id) =>
                    setModalTrabajadorInfo((m) => ({ ...m, plantillaTurnoId: id }))
                  }
                  ingreso={modalTrabajadorInfo.ingreso}
                  salida={modalTrabajadorInfo.salida}
                  refrigerioInicio={modalTrabajadorInfo.refrigerioInicio}
                  refrigerioFin={modalTrabajadorInfo.refrigerioFin}
                  onTimesChange={(times) =>
                    setModalTrabajadorInfo((m) => ({
                      ...m,
                      ...times,
                      horario: times.ingreso ?? m.ingreso
                    }))
                  }
                />
                <p className="mt-3 text-xs font-semibold text-coffee">Sedes</p>
                <div className="mt-1 flex flex-wrap gap-3 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modalTrabajadorInfo.comas}
                      disabled={modalTrabajadorInfo.supabaseWorker}
                      onChange={(e) =>
                        setModalTrabajadorInfo((m) => ({ ...m, comas: e.target.checked }))
                      }
                    />
                    Comas
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modalTrabajadorInfo.surquillo}
                      disabled={modalTrabajadorInfo.supabaseWorker}
                      onChange={(e) =>
                        setModalTrabajadorInfo((m) => ({ ...m, surquillo: e.target.checked }))
                      }
                    />
                    Surquillo
                  </label>
                </div>
                {modalTrabajadorInfo.supabaseWorker ? (
                  <p className="mt-2 text-[11px] text-coffee/65">
                    Correo y sedes: editar en Supabase.
                  </p>
                ) : null}
              </>
            ) : (
              <dl className="mt-3 space-y-2 text-sm text-coffee">
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Correo</dt>
                  <dd>{modalTrabajadorInfo.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">WhatsApp</dt>
                  <dd>
                    {formatPhoneDisplay(
                      joinPhoneE164(
                        modalTrabajadorInfo.whatsappCountry,
                        modalTrabajadorInfo.whatsappNumber
                      )
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Fecha de nacimiento</dt>
                  <dd>{modalTrabajadorInfo.fechaNacimiento || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Dirección</dt>
                  <dd>{modalTrabajadorInfo.direccion || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Emergencia</dt>
                  <dd>
                    {modalTrabajadorInfo.emergNombre || "—"} ·{" "}
                    {formatPhoneDisplay(
                      joinPhoneE164(modalTrabajadorInfo.emergCountry, modalTrabajadorInfo.emergNumber)
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Turno habitual</dt>
                  <dd>
                    {TURN_TEMPLATES[modalTrabajadorInfo.plantillaTurnoId]?.label ||
                      "Horario personalizado"}{" "}
                    · {formatHora12(modalTrabajadorInfo.ingreso)} –{" "}
                    {formatHora12(modalTrabajadorInfo.salida)}
                    <span className="block text-xs text-coffee/65">
                      Ref. {modalTrabajadorInfo.refrigerioInicio} – {modalTrabajadorInfo.refrigerioFin}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase text-coffee/55">Sedes</dt>
                  <dd>
                    {[
                      modalTrabajadorInfo.comas && "Comas",
                      modalTrabajadorInfo.surquillo && "Surquillo"
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </dd>
                </div>
              </dl>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setModalTrabajadorInfo((m) => ({ ...m, open: false, editing: false }))
                }
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cerrar
              </button>
              {modalTrabajadorInfo.editing ? (
                <button
                  type="button"
                  onClick={guardarEdicionTrabajador}
                  className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
                >
                  Guardar cambios
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {modalCrearPin.open && (
        <div className="fixed inset-0 z-[52] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">Crea tu PIN</h4>
            <p className="mt-1 text-sm text-coffee">
              Hola <strong>{modalCrearPin.nombre}</strong>. Crea tu PIN de <strong>6 dígitos</strong> y confírmalo.
            </p>
            <label className="mt-4 block text-xs font-semibold text-coffee">
              PIN (6 dígitos)
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={modalCrearPin.pin}
                onChange={(e) =>
                  setModalCrearPin((m) => ({ ...m, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
                placeholder="••••••"
                autoComplete="new-password"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-coffee">
              Repetir PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={modalCrearPin.pin2}
                onChange={(e) =>
                  setModalCrearPin((m) => ({ ...m, pin2: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                }
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
                autoComplete="new-password"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalCrearPin({
                    open: false,
                    token: "",
                    colaboradorId: "",
                    nombre: "",
                    pin: "",
                    pin2: ""
                  });
                  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
                }}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={guardarPinInvitado}
                disabled={isBusy("saveInvitePin")}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isBusy("saveInvitePin") ? "Guardando..." : "Guardar PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPinGerente.open && (
        <div className="fixed inset-0 z-[56] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-peruRed">{modalPinGerente.title}</h4>
            <label className="mt-4 block text-xs font-semibold text-coffee">
              {supa.enabled ? "PIN (6 dígitos)" : "Código"}
              <input
                type="password"
                inputMode={supa.enabled ? "numeric" : undefined}
                maxLength={supa.enabled ? 6 : undefined}
                value={modalPinGerente.pin}
                onChange={(e) =>
                  setModalPinGerente((m) => ({ ...m, pin: patchAdminPinInput(e.target.value) }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarModalPinGerente();
                }}
                className="mt-1 w-full rounded-xl border border-peruRed/25 px-3 py-2 text-sm tracking-[0.25em]"
                placeholder="••••••"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => cerrarModalPinGerente(null)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmarModalPinGerente()}
                className="rounded-xl bg-peruRed px-3 py-2 text-sm font-semibold text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label="Abrir ayuda de asistencia"
        aria-expanded={ayudaAsistenciaAbierta}
        onClick={() => setAyudaAsistenciaAbierta(true)}
        className="fixed bottom-6 right-4 z-[45] flex h-12 w-12 items-center justify-center rounded-full border border-peruRed/25 bg-bone text-peruRed shadow-md transition hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-peruRed/45"
      >
        <HelpCircle size={22} strokeWidth={1.75} aria-hidden />
      </button>

      {ayudaAsistenciaAbierta && (
        <>
          <div
            role="presentation"
            className="fixed inset-0 z-[46] bg-coffee/20 backdrop-blur-[1px]"
            onClick={() => setAyudaAsistenciaAbierta(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ayuda-asistencia-titulo"
            className="fixed right-0 top-0 z-[47] flex h-full w-full max-w-sm flex-col border-l border-peruRed/15 bg-bone shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-peruRed/10 px-4 py-3">
              <h2 id="ayuda-asistencia-titulo" className="text-base font-semibold text-coffee">
                Ayuda
              </h2>
              <button
                type="button"
                aria-label="Cerrar ayuda"
                onClick={() => setAyudaAsistenciaAbierta(false)}
                className="rounded-full p-2 text-coffee/70 transition hover:bg-peruRed/10 hover:text-coffee focus:outline-none focus-visible:ring-2 focus-visible:ring-peruRed/40"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <ul className="list-disc space-y-3 overflow-y-auto px-6 py-4 pl-8 text-sm leading-relaxed text-coffee/85">
              {bulletsAyuda.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
