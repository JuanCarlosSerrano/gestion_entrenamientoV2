import { API, getAtletaId, fetchJSON, authHeader, getCsrfToken } from "./api.js";
import { buildTreeFromFlat, renderPasos } from "./pasos.js";

const $ = (selector) => document.querySelector(selector);

const state = {
  weekStart: null,
  entrenos: [],
  byId: new Map(),
  selected: null,
  zonas: null,
  step: 0,
  feedback: {},
  fitFile: null,
};

const parseDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isoLocal = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const startOfWeek = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatShort = (date) => date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const formatFull = (date) => date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const summary = (ent) => [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "Sesión planificada";

const parseTimeToSeconds = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?::([0-5]?\d))(?::([0-5]?\d))?$/);
  if (!match) return Number.NaN;
  const first = Number(match[1]);
  const second = Number(match[2] || 0);
  const third = match[3] == null ? null : Number(match[3]);
  return third == null ? first * 60 + second : first * 3600 + second * 60 + third;
};

const parseKm = (value) => {
  const text = String(value || "").trim().replace(",", ".");
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) && num >= 0 ? num : Number.NaN;
};

const loadZonas = async (atletaId) => {
  try {
    state.zonas = await fetchJSON(`${API}/zonas_atleta/${atletaId}`);
  } catch {
    state.zonas = null;
  }
};

const loadDetail = async (ent) => {
  if (ent.pasos) return ent;
  try {
    const flat = await fetchJSON(`${API}/entrenamientos_asignados/${ent.id}/detalle`);
    ent.pasos = buildTreeFromFlat(flat);
  } catch {
    ent.pasos = [];
  }
  return ent;
};

const renderWeek = () => {
  const start = state.weekStart;
  const end = addDays(start, 6);
  $("#week-label").textContent = `Semana ${Math.ceil((((start - new Date(start.getFullYear(), 0, 1)) / 86400000) + 1) / 7)}`;
  $("#week-range").textContent = `${formatShort(start)} - ${formatShort(end)}`;
  const todayIso = isoLocal(new Date());
  const grid = $("#week-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(start, i);
    const iso = isoLocal(date);
    const dayItems = state.entrenos.filter((ent) => String(ent.fecha || "").slice(0, 10) === iso);
    const day = document.createElement("article");
    day.className = `athlete-day ${iso === todayIso ? "is-today" : ""}`;
    day.innerHTML = `
      <div>
        <div class="athlete-muted">${date.toLocaleDateString("es-ES", { weekday: "long" })}</div>
        <div class="athlete-day__date">${date.getDate()}</div>
      </div>
      <div class="athlete-day__sessions"></div>
    `;
    const list = day.querySelector(".athlete-day__sessions");
    if (!dayItems.length) {
      list.innerHTML = '<div class="athlete-muted">Descanso</div>';
    } else {
      dayItems.forEach((ent) => {
        const btn = document.createElement("button");
        btn.className = "athlete-session-pill";
        btn.type = "button";
        btn.innerHTML = `${ent.franja ? `<small>${String(ent.franja).toUpperCase()}</small>` : ""}${ent.nombre || "Entrenamiento"}<small>${summary(ent)}</small>`;
        btn.addEventListener("click", () => selectTraining(ent.id));
        list.appendChild(btn);
      });
    }
    grid.appendChild(day);
  }
};

const selectTraining = async (id) => {
  const ent = state.byId.get(Number(id));
  if (!ent) return;
  state.selected = await loadDetail(ent);
  $("#detail-date").textContent = formatFull(parseDate(ent.fecha) || new Date());
  $("#detail-title").textContent = ent.nombre || "Entrenamiento";
  $("#detail-summary").textContent = summary(ent);
  $("#detail-blocks").innerHTML = renderPasos(ent.pasos || [], state.zonas, { editableResults: true });
  resetWizard();
  $("#feedback-empty").classList.add("athlete-hidden");
  $("#feedback-wizard").classList.remove("athlete-hidden");
  $("#feedback-confirmation").classList.add("athlete-hidden");
  renderWizardStep();
};

const choiceGrid = (items, key) => `
  <div class="athlete-choice-grid ${key === "rpe" ? "athlete-choice-grid--rpe" : ""}">
    ${items.map((item) => `
      <button class="athlete-choice ${state.feedback[key] === item.value ? "is-selected" : ""}" type="button" data-choice-key="${key}" data-choice-value="${item.value}">
        ${item.label}
      </button>
    `).join("")}
  </div>`;

const steps = [
  () => ({ question: "¿Completaste el entrenamiento?", html: choiceGrid([
    { label: "Sí", value: "si" },
    { label: "Parcialmente", value: "parcial" },
    { label: "No", value: "no" },
  ], "completado") }),
  () => ({ question: "¿Cómo de duro fue?", html: choiceGrid(Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), "rpe") }),
  () => ({ question: "¿Cómo te sentiste?", html: choiceGrid([
    { label: "Muy bien", value: "muy bien" },
    { label: "Bien", value: "bien" },
    { label: "Normal", value: "normal" },
    { label: "Mal", value: "mal" },
    { label: "Muy mal", value: "muy mal" },
  ], "sensacion") }),
  () => ({ question: "Fatiga", html: choiceGrid([
    { label: "Baja", value: "baja" },
    { label: "Normal", value: "normal" },
    { label: "Alta", value: "alta" },
    { label: "Muy alta", value: "muy alta" },
  ], "fatiga") }),
  () => ({
    question: "¿Tienes molestias?",
    html: choiceGrid([{ label: "No", value: "no" }, { label: "Sí", value: "si" }], "dolor"),
    extra: state.feedback.dolor === "si"
      ? `<label class="form-label fw-semibold">Zona de dolor<input class="form-control" id="feedback-zona-dolor" placeholder="Rodilla, gemelo, isquio..."></label>
         <label class="form-label fw-semibold">Comentario breve<textarea class="form-control" id="feedback-dolor-comentario" rows="2" placeholder="Qué notas y cuándo aparece"></textarea></label>`
      : "",
  }),
  () => ({ question: "¿Quieres añadir algo?", html: '<textarea class="form-control" id="feedback-comentario" rows="4" placeholder="Comentario opcional"></textarea>' }),
  () => ({ question: "Subir archivo FIT", html: `
    <input class="form-control" type="file" id="feedback-fit-file" accept=".fit">
    <div class="athlete-muted mt-2">Puedes terminar sin FIT y subirlo más adelante.</div>
  ` }),
];

const resetWizard = () => {
  state.step = 0;
  state.feedback = {};
  state.fitFile = null;
};

const renderWizardStep = () => {
  const data = steps[state.step]();
  $("#feedback-step-label").textContent = `Paso ${state.step + 1} de ${steps.length}`;
  $("#feedback-question").textContent = data.question;
  $("#feedback-options").innerHTML = data.html;
  $("#feedback-extra").innerHTML = data.extra || "";
  $("#feedback-prev").disabled = state.step === 0;
  $("#feedback-next").textContent = state.step === steps.length - 1 ? "Terminar" : "Siguiente";
  $("#feedback-options").querySelectorAll("[data-choice-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.feedback[btn.dataset.choiceKey] = btn.dataset.choiceValue;
      renderWizardStep();
    });
  });
};

const collectStep = () => {
  const requiredByStep = {
    0: ["completado", "Selecciona si completaste el entrenamiento."],
    1: ["rpe", "Selecciona un RPE."],
    2: ["sensacion", "Selecciona tus sensaciones."],
    3: ["fatiga", "Selecciona la fatiga."],
    4: ["dolor", "Indica si tienes molestias."],
  };
  const required = requiredByStep[state.step];
  if (required && !state.feedback[required[0]]) {
    alert(required[1]);
    return false;
  }
  if (state.step === 4 && state.feedback.dolor === "si") {
    state.feedback.zona_dolor = $("#feedback-zona-dolor")?.value.trim() || "";
    state.feedback.comentario_dolor = $("#feedback-dolor-comentario")?.value.trim() || "";
    if (!state.feedback.zona_dolor) {
      alert("Indica la zona de dolor.");
      return false;
    }
  }
  if (state.step === 5) state.feedback.comentario = $("#feedback-comentario")?.value.trim() || "";
  if (state.step === 6) state.fitFile = $("#feedback-fit-file")?.files?.[0] || null;
  return true;
};

const sendFit = async () => {
  if (!state.fitFile || !state.selected) return;
  const data = new FormData();
  data.append("archivo", state.fitFile);
  data.append("origen", "manual");
  const csrf = await getCsrfToken();
  await fetchJSON(`${API}/sesiones/${state.selected.id}/archivo`, {
    method: "POST",
    headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    body: data,
  });
};

const collectWorkoutResults = () => {
  const rows = Array.from(document.querySelectorAll("[data-result-step]"));
  const series = [];
  let kmTotal = 0;
  let hasData = false;

  for (const row of rows) {
    const stepId = Number(row.dataset.resultStep);
    const timeInput = row.querySelector("[data-result-time]");
    const kmInput = row.querySelector("[data-result-km]");
    const timeText = timeInput?.value || "";
    const kmText = kmInput?.value || "";
    const seconds = parseTimeToSeconds(timeText);
    const km = parseKm(kmText);

    if (Number.isNaN(seconds)) {
      timeInput?.focus();
      throw new Error("Introduce el tiempo con formato mm:ss o hh:mm:ss.");
    }
    if (Number.isNaN(km)) {
      kmInput?.focus();
      throw new Error("Introduce los kilómetros con un número válido.");
    }
    if (seconds == null && km == null) continue;

    hasData = true;
    if (km != null) kmTotal += km;
    series.push({
      paso_detalle_id: stepId,
      repeticion: 1,
      tiempo_real_seg: seconds,
      km_realizados: km,
    });
  }

  return hasData ? { series, km_realizados: kmTotal || null } : null;
};

const sendWorkoutResults = async (payload = null) => {
  if (!state.selected) return;
  const data = payload || collectWorkoutResults();
  if (!data) return;
  const csrf = await getCsrfToken();
  await fetchJSON(`${API}/entrenamientos_asignados/${state.selected.id}/resultados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(data),
  });
};

const finishFeedback = async () => {
  if (!state.selected) return;
  const workoutResults = collectWorkoutResults();
  const hasResults = Boolean(workoutResults);
  const confirmMessage = state.fitFile
    ? "Se guardará tu feedback, los datos introducidos por bloque y el archivo FIT seleccionado. ¿Quieres enviarlo ahora?"
    : hasResults
      ? "Se guardará tu feedback y los datos introducidos por bloque. ¿Quieres enviarlo ahora?"
      : "Se guardará tu feedback del entrenamiento. ¿Quieres enviarlo ahora?";
  if (!window.confirm(confirmMessage)) return;
  await sendWorkoutResults(workoutResults);
  const completedMap = { si: true, parcial: false, no: false };
  const comentario = [state.feedback.comentario, state.feedback.comentario_dolor].filter(Boolean).join(" · ");
  const payload = {
    entrenamiento_id: state.selected.id,
    completado: completedMap[state.feedback.completado],
    rpe: state.feedback.rpe ? Number(state.feedback.rpe) : null,
    sensacion: state.feedback.sensacion || null,
    fatiga: state.feedback.fatiga || null,
    dolor: state.feedback.dolor === "si",
    zona_dolor: state.feedback.dolor === "si" ? state.feedback.zona_dolor : null,
    comentario,
  };
  const csrf = await getCsrfToken();
  const authorization = authHeader();
  const response = await fetch(`${API}/feedback`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo guardar el feedback");
  let fitStatus = "";
  if (state.fitFile) {
    try {
      await sendFit();
      fitStatus = " Archivo FIT guardado.";
    } catch (err) {
      fitStatus = " El feedback se guardó, pero el archivo FIT no pudo subirse.";
      alert(fitStatus);
    }
  }
  $("#feedback-wizard").classList.add("athlete-hidden");
  const success = $("#feedback-confirmation .config-success");
  if (success) success.textContent = `Entrenamiento registrado correctamente.${fitStatus}`;
  $("#feedback-confirmation").classList.remove("athlete-hidden");
};

const init = async () => {
  const atletaId = getAtletaId();
  state.weekStart = startOfWeek(new Date());
  if (!atletaId) return;
  await loadZonas(atletaId);
  const entrenos = await fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`);
  state.entrenos = (entrenos || []).map((ent) => ({ ...ent, _date: parseDate(ent.fecha) })).filter((ent) => ent._date);
  state.byId = new Map(state.entrenos.map((ent) => [Number(ent.id), ent]));
  renderWeek();
  const hash = window.location.hash.match(/entreno-(\d+)/);
  if (hash) selectTraining(Number(hash[1]));
};

$("#prev-week")?.addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, -7);
  renderWeek();
});
$("#next-week")?.addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, 7);
  renderWeek();
});
$("#current-week")?.addEventListener("click", () => {
  state.weekStart = startOfWeek(new Date());
  renderWeek();
});
$("#feedback-prev")?.addEventListener("click", () => {
  if (state.step > 0) {
    state.step -= 1;
    renderWizardStep();
  }
});
$("#feedback-next")?.addEventListener("click", async () => {
  if (!collectStep()) return;
  if (state.step < steps.length - 1) {
    state.step += 1;
    renderWizardStep();
    return;
  }
  try {
    $("#feedback-next").disabled = true;
    await finishFeedback();
  } catch (err) {
    alert(err.message || "No se pudo registrar el entrenamiento.");
  } finally {
    $("#feedback-next").disabled = false;
  }
});

// Los campos "Tiempo real" (data-result-time, en pasos.js) usan
// inputmode="numeric" para sacar el teclado numérico en tablet/móvil,
// que no tiene ":" -- y parseTimeToSeconds exige mm:ss o hh:mm:ss. Con
// esto basta con teclear los dígitos (p.ej. "4520") y el campo se
// autoformatea ("45:20"), igual que ya se hace en utilidades.js.
// Delegado en document (no en el contenedor de los pasos) porque
// renderPasos() reemplaza ese HTML entero cada vez que se abre un
// entrenamiento, y un listener puesto directamente en los <input> se
// perdería con ese reemplazo.
document.addEventListener("input", (event) => {
  const input = event.target.closest("[data-result-time]");
  if (!input) return;
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  input.value = digits.length > 2 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits;
});

document.addEventListener("DOMContentLoaded", init);
