const API_BASE =
  window.API_BASE_URL ||
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");

const WEEKDAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const state = {
  athletes: [],
  filters: {},
  selectedAthleteId: Number(new URLSearchParams(window.location.search).get("atletaId")) || null,
  currentMonth: new Date(),
  sessions: [],
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
// date.toISOString() convierte a UTC: en una zona horaria adelantada a
// UTC (como España) la medianoche local del día D cae en el día D-1 en
// UTC, así que la celda del calendario etiquetada "D" acababa buscando
// las sesiones de "D-1" -- un entrenamiento del lunes se veía en la
// casilla del martes. Se compone la fecha con los componentes locales,
// igual que en atleta_planificacion.js, calendario.js, entrenamientos.js
// y planificacion_semanal.js.
const isoDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function setupIdentity() {
  const storedName = localStorage.getItem("userName") || localStorage.getItem("userEmail") || "Entrenador";
  const displayName = storedName.includes("@") ? storedName.split("@")[0] : storedName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  $("#sidebar-trainer-name").textContent = displayName;
  $("#sidebar-trainer-initials").textContent = initials || "E";
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function formatDate(value) {
  const d = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return value || "";
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }).replace(".", "");
}

function formatLongDate(value) {
  const d = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return value || "";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatKm(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const rounded = Math.round(num * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} km`;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "—";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.round(total % 60);
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function normalizeType(value) {
  const val = String(value || "custom").toLowerCase();
  return ["warmup", "interval", "rest", "repeat", "cooldown", "custom"].includes(val) ? val : "custom";
}

function feedbackLabel(feedback) {
  if (!hasFeedback(feedback)) return "Sin feedback";
  if (feedback.estado === "no_completado") return "Feedback incompleto";
  return "Feedback completado";
}

function hasFeedback(feedback = {}) {
  return Boolean(
    feedback.id ||
      feedback.rpe != null ||
      feedback.sensacion ||
      feedback.fatiga ||
      feedback.dolor != null ||
      feedback.zona_dolor ||
      feedback.completado != null ||
      feedback.comentario
  );
}

function sessionStatusClass(session) {
  if (session.estado_ejecucion === "realizado") return "history-session--done";
  return "history-session--planned";
}

function sessionStatusLabel(session) {
  return session.estado_ejecucion === "realizado" ? "Realizado" : "Planificado";
}

function fillSelect(select, values, emptyLabel) {
  if (!select) return;
  select.innerHTML = `<option value="">${emptyLabel}</option>`;
  (values || []).forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function populateFilters(filters = {}) {
  fillSelect($("#history-filter-group"), filters.grupos, "Todos los grupos");
  fillSelect($("#history-filter-subgroup"), filters.subgrupos, "Todos los subgrupos");
  fillSelect($("#history-filter-category"), filters.categorias, "Todas las categorías");
}

function filteredAthletes() {
  const q = ($("#history-athlete-search")?.value || "").trim().toLowerCase();
  const group = $("#history-filter-group")?.value || "";
  const subgroup = $("#history-filter-subgroup")?.value || "";
  const category = $("#history-filter-category")?.value || "";
  return state.athletes.filter((athlete) => {
    const name = `${athlete.nombre || ""} ${athlete.apellidos || ""} ${athlete.email || ""}`.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (group && athlete.grupo !== group) return false;
    if (subgroup && athlete.subgrupo !== subgroup) return false;
    if (category && athlete.categoria !== category) return false;
    return true;
  });
}

function renderAthletes() {
  const list = $("#history-athlete-list");
  const athletes = filteredAthletes();
  $("#history-athletes-count").textContent = String(athletes.length);
  if (!athletes.length) {
    list.innerHTML = '<div class="history-empty">No hay atletas con esos filtros.</div>';
    return;
  }
  list.innerHTML = athletes.map((athlete) => {
    const name = `${athlete.nombre || ""} ${athlete.apellidos || ""}`.trim() || "Atleta";
    const active = Number(athlete.id) === Number(state.selectedAthleteId);
    return `
      <button class="history-athlete ${active ? "is-active" : ""}" type="button" data-athlete-id="${athlete.id}">
        <span>${escapeHtml(initialsFor(name))}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml([athlete.grupo, athlete.subgrupo, athlete.categoria].filter(Boolean).join(" · ") || athlete.email || "")}</small>
      </button>
    `;
  }).join("");
  list.querySelectorAll("[data-athlete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedAthleteId = Number(button.dataset.athleteId);
      renderAthletes();
      await loadCalendar();
    });
  });
}

function initialsFor(name) {
  return String(name || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function loadAthletes() {
  const data = await fetchJson("/planificacion/atletas");
  state.athletes = data.atletas || [];
  state.filters = data.filtros || {};
  populateFilters(state.filters);
  if (!state.selectedAthleteId && state.athletes.length) {
    state.selectedAthleteId = Number(state.athletes[0].id);
  }
  renderAthletes();
}

function sessionsByDate() {
  return state.sessions.reduce((acc, session) => {
    const key = String(session.fecha).slice(0, 10);
    acc[key] = acc[key] || [];
    acc[key].push(session);
    return acc;
  }, {});
}

function setMonthTitle() {
  $("#history-month-title").textContent = state.currentMonth
    .toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    .toUpperCase();
}

function updateKpis() {
  const planned = state.sessions.length;
  const done = state.sessions.filter((item) => item.estado_ejecucion === "realizado").length;
  const feedback = state.sessions.filter((item) => item.feedback?.id).length;
  $("#history-kpi-planned").textContent = String(planned);
  $("#history-kpi-done").textContent = String(done);
  $("#history-kpi-feedback").textContent = String(feedback);
  $("#history-kpi-missing").textContent = String(Math.max(planned - feedback, 0));
}

function renderCalendar() {
  setMonthTitle();
  updateKpis();
  const container = $("#history-calendar");
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const first = new Date(year, month, 1);
  const firstGrid = new Date(first);
  firstGrid.setDate(first.getDate() - ((first.getDay() || 7) - 1));
  const byDate = sessionsByDate();
  const today = isoDate(new Date());

  const cells = WEEKDAYS.map((day) => `<div class="calendar-weekday">${day}</div>`);
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(firstGrid);
    d.setDate(firstGrid.getDate() + i);
    const key = isoDate(d);
    const daySessions = byDate[key] || [];
    const shown = daySessions.slice(0, 3);
    cells.push(`
      <div class="calendar-day ${d.getMonth() !== month ? "is-muted" : ""} ${key === today ? "is-today" : ""}">
        <span class="calendar-day__num">${d.getDate()}</span>
        <span class="day-badges">
          ${shown.map((session) => sessionBadge(session)).join("")}
          ${daySessions.length > shown.length ? `<span class="session-more">+${daySessions.length - shown.length}</span>` : ""}
        </span>
      </div>
    `);
  }
  container.innerHTML = cells.join("");
  container.querySelectorAll("[data-history-session-id]").forEach((badge) => {
    badge.addEventListener("click", () => openSessionDetail(Number(badge.dataset.historySessionId)));
    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSessionDetail(Number(badge.dataset.historySessionId));
      }
    });
  });
}

function sessionBadge(session) {
  const feedbackClass = session.feedback?.id ? "has-feedback" : "missing-feedback";
  return `
    <button class="history-session session-badge session-badge--${escapeHtml(normalizeType(session.tipo_principal))} ${sessionStatusClass(session)} ${feedbackClass}"
            type="button"
            data-history-session-id="${session.id}">
      <span class="history-session__state" aria-hidden="true"></span>
      <span class="session-badge__label">${escapeHtml(session.nombre || "Sesión")}</span>
      <span class="history-session__feedback" title="${escapeHtml(feedbackLabel(session.feedback))}">${session.feedback?.id ? "✓" : "·"}</span>
    </button>
  `;
}

async function loadCalendar() {
  if (!state.selectedAthleteId) {
    $("#history-status").textContent = "No hay atletas disponibles.";
    $("#history-athlete-name").textContent = "Calendario del atleta";
    state.sessions = [];
    renderCalendar();
    return;
  }
  const data = await fetchJson(`/historial/entrenador/atletas/${state.selectedAthleteId}/calendario?mes=${monthKey(state.currentMonth)}`);
  state.sessions = data.sesiones || [];
  const athlete = data.atleta || {};
  const name = `${athlete.nombre || ""} ${athlete.apellidos || ""}`.trim() || "Atleta";
  $("#history-athlete-name").textContent = name;
  $("#history-status").textContent = `${state.sessions.length} entrenamiento${state.sessions.length === 1 ? "" : "s"} en ${$("#history-month-title")?.textContent || "el mes"}.`;
  renderCalendar();
}

async function openSessionDetail(id) {
  const session = state.sessions.find((item) => Number(item.id) === Number(id));
  $("#history-detail-body").innerHTML = '<div class="history-empty">Cargando detalle...</div>';
  bootstrap.Modal.getOrCreateInstance($("#historyDetailModal")).show();
  try {
    const data = await fetchJson(`/resultados/entrenador/${id}`);
    renderDetail(data, session);
  } catch (err) {
    $("#history-detail-body").innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || "No se pudo cargar el detalle.")}</div>`;
  }
}

function renderDetail(data, session = {}) {
  const workout = data.entrenamiento || {};
  const comp = data.comparativa || {};
  const feedbacks = data.feedbacks || [];
  const latestFeedback = feedbacks[0] || session.feedback || {};
  $("#history-detail-body").innerHTML = `
    <div class="history-detail-grid">
      <section>
        <p class="planner-eyebrow">${escapeHtml(formatLongDate(workout.fecha || session.fecha))}</p>
        <h3>${escapeHtml(workout.nombre || session.nombre || "Entrenamiento")}</h3>
        <p>${escapeHtml(workout.objetivo || session.objetivo || workout.notas || session.notas || "Sin notas.")}</p>
      </section>
      <aside class="history-detail-status">
        <span class="history-chip ${session?.estado_ejecucion === "realizado" ? "history-chip--success" : "history-chip--soft"}">${escapeHtml(sessionStatusLabel(session || {}))}</span>
        <span class="history-chip ${hasFeedback(latestFeedback) ? "history-chip--feedback" : "history-chip--warning"}">${escapeHtml(feedbackLabel(latestFeedback))}</span>
      </aside>
    </div>
    <div class="history-metrics">
      <div><span>Km planificados</span><strong>${escapeHtml(formatKm(comp.plan?.km ?? workout.km_planificados ?? workout.km_previstos))}</strong></div>
      <div><span>Km realizados</span><strong>${escapeHtml(formatKm(comp.real?.km ?? workout.km_realizados))}</strong></div>
      <div><span>Duración real</span><strong>${escapeHtml(formatDuration(comp.real?.duracion_seg ?? session.duracion_real_seg))}</strong></div>
      <div><span>Origen</span><strong>${escapeHtml(comp.origen_datos || session.origen_datos || "—")}</strong></div>
    </div>
    <section class="history-feedback-detail">
      <h4>Feedback del atleta</h4>
      ${renderFeedback(latestFeedback)}
    </section>
  `;
}

function renderFeedback(feedback = {}) {
  if (!hasFeedback(feedback)) {
    return '<p class="history-empty history-empty--inline">Sin feedback registrado.</p>';
  }
  return `
    <div class="history-feedback-grid">
      <span>RPE <strong>${escapeHtml(feedback.rpe ?? "—")}</strong></span>
      <span>Sensación <strong>${escapeHtml(feedback.sensacion || "—")}</strong></span>
      <span>Fatiga <strong>${escapeHtml(feedback.fatiga || "—")}</strong></span>
      <span>Dolor <strong>${feedback.dolor ? escapeHtml(feedback.zona_dolor || "Sí") : "No"}</strong></span>
      <span>Completado <strong>${feedback.completado === 0 || feedback.completado === false ? "No" : "Sí"}</strong></span>
    </div>
    ${feedback.comentario ? `<p class="history-feedback-comment">${escapeHtml(feedback.comentario)}</p>` : ""}
  `;
}

function setupEvents() {
  ["history-athlete-search", "history-filter-group", "history-filter-subgroup", "history-filter-category"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", renderAthletes);
    $(`#${id}`)?.addEventListener("change", renderAthletes);
  });
  $("#btn-refresh-history")?.addEventListener("click", async () => {
    await loadAthletes();
    await loadCalendar();
  });
  $("#history-prev-month")?.addEventListener("click", async () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    await loadCalendar();
  });
  $("#history-next-month")?.addEventListener("click", async () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    await loadCalendar();
  });
  $("#history-today-month")?.addEventListener("click", async () => {
    state.currentMonth = new Date();
    await loadCalendar();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupIdentity();
  setupEvents();
  try {
    await loadAthletes();
    await loadCalendar();
  } catch (err) {
    $("#history-status").textContent = err.message || "No se pudo cargar el historial.";
  }
});
