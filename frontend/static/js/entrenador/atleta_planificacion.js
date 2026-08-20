const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");

const WEEKDAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const state = {
  atletaId: new URLSearchParams(window.location.search).get("atletaId"),
  currentMonth: new Date(),
  atleta: null,
  sesiones: [],
  selectedDate: null,
  selectedSession: null,
  library: [],
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// date.toISOString() convierte a UTC: en una zona horaria adelantada a
// UTC (como España) la medianoche local del día D cae en el día D-1 en
// UTC, así que la celda del calendario etiquetada "D" acababa buscando
// las sesiones de "D-1" -- una sesión del lunes se veía en la casilla
// del martes. Se compone la fecha con los componentes locales en vez
// de convertir a UTC, igual que ya se hace en calendario.js,
// entrenamientos.js y planificacion_semanal.js.
const isoDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const normalizarFranja = (value) => (value === "tarde" ? "tarde" : "manana");
const normalizarTipo = (value) => {
  const val = String(value || "custom").toLowerCase();
  return ["warmup", "interval", "rest", "repeat", "cooldown", "custom"].includes(val) ? val : "custom";
};
const visibilidadIconClass = (value) => (value === "visible" ? "visibility-eye--visible" : "visibility-eye--hidden");

const getCsrfToken = async () => {
  if (window.CSRF?.ensureToken) return window.CSRF.ensureToken(true);
  return localStorage.getItem("csrfToken");
};

async function fetchJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { credentials: "include", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

async function writeJson(url, method, payload) {
  const token = await getCsrfToken();
  return fetchJson(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-CSRF-Token": token } : {}),
    },
    body: JSON.stringify(payload || {}),
  });
}

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

function setMonthTitle() {
  $("#month-title").textContent = state.currentMonth
    .toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    .toUpperCase();
}

function sessionsByDate() {
  return state.sesiones.reduce((acc, session) => {
    const key = String(session.fecha).slice(0, 10);
    acc[key] = acc[key] || [];
    acc[key].push(session);
    return acc;
  }, {});
}

function renderCalendar() {
  setMonthTitle();
  const container = $("#monthly-calendar");
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
    const shown = daySessions.slice(0, 2);
    cells.push(`
      <button class="calendar-day ${d.getMonth() !== month ? "is-muted" : ""} ${key === today ? "is-today" : ""}"
              data-date="${key}" type="button">
        <span class="calendar-day__num">${d.getDate()}</span>
        <span class="day-badges">
          ${shown.map((session) => `
            <span class="session-badge session-badge--${escapeHtml(normalizarTipo(session.tipo_principal))} session-badge--state-${escapeHtml(session.estado_visibilidad || "oculto")}"
                  data-calendar-session-id="${session.id}"
                  role="button"
                  tabindex="0">
              <span class="visibility-eye ${escapeHtml(visibilidadIconClass(session.estado_visibilidad))}" aria-label="${escapeHtml(labelVisibilidad(session.estado_visibilidad))}"></span>
              <span class="session-badge__label">${escapeHtml(session.nombre || "Sesión")}</span>
            </span>
          `).join("")}
          ${daySessions.length > shown.length ? `<span class="session-more">+${daySessions.length - shown.length}</span>` : ""}
          ${!daySessions.length && d.getMonth() === month ? '<span class="session-badge session-badge--descanso">Descanso</span>' : ""}
        </span>
      </button>
    `);
  }
  container.innerHTML = cells.join("");
  container.querySelectorAll(".calendar-day").forEach((day) => {
    day.addEventListener("click", () => openDay(day.dataset.date));
  });
  container.querySelectorAll("[data-calendar-session-id]").forEach((badge) => {
    const openFromBadge = (event) => {
      event.stopPropagation();
      const session = state.sesiones.find((item) => Number(item.id) === Number(badge.dataset.calendarSessionId));
      if (session) openEditSession(session);
    };
    badge.addEventListener("click", openFromBadge);
    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFromBadge(event);
      }
    });
  });
}

async function loadMonth() {
  if (!state.atletaId) {
    window.location.href = "atletas.html";
    return;
  }
  const data = await fetchJson(`/planificacion/atleta/${state.atletaId}/calendario?mes=${monthKey(state.currentMonth)}`);
  state.atleta = data.atleta;
  state.sesiones = data.sesiones || [];
  const name = `${state.atleta.nombre || ""} ${state.atleta.apellidos || ""}`.trim() || "Atleta";
  $("#athlete-name").textContent = name;
  renderCalendar();
}

function formatDayTitle(fecha) {
  const date = new Date(`${fecha}T12:00:00`);
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

async function openDay(fecha) {
  state.selectedDate = fecha;
  $("#day-modal-title").textContent = formatDayTitle(fecha).replace(/^./, (c) => c.toUpperCase());
  $("#day-modal-subtitle").textContent = "Entrenamientos asignados";
  await loadDaySessions();
  await loadLibrary();
  bootstrap.Modal.getOrCreateInstance($("#dayModal")).show();
}

async function loadDaySessions() {
  const data = await fetchJson(`/planificacion/atleta/${state.atletaId}/dia?fecha=${state.selectedDate}`);
  renderDaySessions(data.sesiones || []);
}

function sessionCard(session) {
  return `
    <article class="assigned-session-card" data-card-session-id="${session.id}" tabindex="0" role="button">
      <strong class="assigned-session-title assigned-session-title--${escapeHtml(normalizarTipo(session.tipo_principal))}">${escapeHtml(session.nombre || "Sesión")}</strong>
      <small>${escapeHtml(session.objetivo || session.notas || "")}</small>
      <span class="visibility-chip visibility-chip--${escapeHtml(session.estado_visibilidad || "oculto")}">
        <span class="visibility-eye ${escapeHtml(visibilidadIconClass(session.estado_visibilidad))}" aria-hidden="true"></span>
        ${escapeHtml(labelVisibilidad(session.estado_visibilidad))}
      </span>
      <div class="session-card-actions" hidden>
        <button class="btn btn-sm btn-outline-secondary" data-action="view" data-session-id="${session.id}" type="button">Ver</button>
        <button class="btn btn-sm btn-primary" data-action="edit" data-session-id="${session.id}" type="button">Editar</button>
        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-session-id="${session.id}" type="button">Eliminar</button>
        <button class="btn btn-sm btn-outline-secondary" data-action="duplicate" data-session-id="${session.id}" type="button">Duplicar</button>
        <button class="btn btn-sm btn-outline-primary" data-action="toggle-slot" data-session-id="${session.id}" type="button">
          ${session.franja === "tarde" ? "Pasar a AM" : "Pasar a PM"}
        </button>
      </div>
    </article>
  `;
}

function labelVisibilidad(value) {
  if (value === "visible") return "Visible";
  if (value === "programado") return "Programado";
  return "Oculto";
}

function renderDaySessions(sessions) {
  const morning = sessions.filter((item) => normalizarFranja(item.franja) === "manana");
  const afternoon = sessions.filter((item) => normalizarFranja(item.franja) === "tarde");
  $("#morning-sessions").innerHTML = morning.length
    ? morning.map(sessionCard).join("")
    : '<div class="empty-state">Sin sesiones de mañana.</div>';
  $("#afternoon-sessions").innerHTML = afternoon.length
    ? afternoon.map(sessionCard).join("")
    : '<div class="empty-state">Sin sesiones de tarde.</div>';

  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleSessionAction(button.dataset.action, Number(button.dataset.sessionId), sessions);
    });
  });

  document.querySelectorAll("[data-card-session-id]").forEach((card) => {
    card.addEventListener("click", () => toggleSessionActions(card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSessionActions(card);
      }
    });
  });
}

function toggleSessionActions(card) {
  const actions = card.querySelector(".session-card-actions");
  if (!actions) return;
  const willOpen = actions.hidden;
  document.querySelectorAll(".assigned-session-card").forEach((item) => {
    item.classList.remove("is-open");
    const itemActions = item.querySelector(".session-card-actions");
    if (itemActions) itemActions.hidden = true;
  });
  actions.hidden = !willOpen;
  card.classList.toggle("is-open", willOpen);
}

async function handleSessionAction(action, id, sessions) {
  const session = sessions.find((item) => Number(item.id) === id);
  if (!session) return;
  if (action === "view" || action === "edit") {
    openEditSession(session);
    return;
  }
  try {
    if (action === "toggle-slot") {
      await writeJson(`/planificacion/sesiones/${id}`, "PUT", {
        ...session,
        franja: session.franja === "tarde" ? "manana" : "tarde",
      });
      await refreshAfterWrite();
    }
    if (action === "delete") {
      if (!window.confirm("¿Eliminar esta sesión de la planificación?")) return;
      await writeJson(`/planificacion/sesiones/${id}`, "DELETE");
      await refreshAfterWrite();
    }
    if (action === "duplicate") {
      await writeJson(`/planificacion/sesiones/${id}/duplicar`, "POST", {
        fecha: session.fecha,
        franja: session.franja,
      });
      await refreshAfterWrite();
    }
  } catch (err) {
    console.error(`Error en acción "${action}" sobre sesión ${id}:`, err);
    alert(err.message || "No se pudo completar la acción sobre la sesión.");
  }
}

function openEditSession(session) {
  state.selectedSession = session;
  $("#edit-session-id").value = session.id;
  $("#edit-session-name").value = session.nombre || "";
  $("#edit-session-date").value = String(session.fecha).slice(0, 10);
  $("#edit-session-franja").value = normalizarFranja(session.franja);
  $("#edit-session-visibility").value = session.estado_visibilidad || "oculto";
  $("#edit-session-publish").value = session.publicar_en ? String(session.publicar_en).slice(0, 16) : "";
  $("#edit-session-notes").value = session.notas || "";
  bootstrap.Modal.getOrCreateInstance($("#editSessionModal")).show();
}

async function saveSession(event) {
  event.preventDefault();
  const id = Number($("#edit-session-id").value);
  const visibility = $("#edit-session-visibility").value;
  const publicarEn = $("#edit-session-publish").value;
  if (visibility === "programado" && !publicarEn) {
    alert("Indica fecha y hora de publicación.");
    return;
  }
  try {
    await writeJson(`/planificacion/sesiones/${id}`, "PUT", {
      nombre: $("#edit-session-name").value.trim(),
      fecha: $("#edit-session-date").value,
      franja: $("#edit-session-franja").value,
      notas: $("#edit-session-notes").value,
      visible: visibility === "visible" ? 1 : 0,
      publicar_en: visibility === "programado" ? publicarEn : null,
    });
    await writeJson(`/planificacion/sesiones/${id}/visibilidad`, "PUT", {
      estado: visibility,
      publicar_en: publicarEn,
    });
    bootstrap.Modal.getOrCreateInstance($("#editSessionModal")).hide();
  } catch (err) {
    console.error(`Error guardando sesión ${id}:`, err);
    alert(err.message || "No se pudo guardar la sesión. Revisa los cambios y vuelve a intentarlo.");
    // No cerramos el modal: puede que el primer PUT (datos) haya entrado
    // bien y el segundo (visibilidad) haya fallado; refrescamos el
    // calendario para reflejar lo que sí quedó guardado y dejamos el
    // modal abierto para que el entrenador vea el aviso y reintente.
  } finally {
    await refreshAfterWrite();
  }
}

async function deleteSession() {
  const id = Number($("#edit-session-id").value);
  try {
    await writeJson(`/planificacion/sesiones/${id}`, "DELETE");
    bootstrap.Modal.getOrCreateInstance($("#editSessionModal")).hide();
    await refreshAfterWrite();
  } catch (err) {
    console.error(`Error eliminando sesión ${id}:`, err);
    alert(err.message || "No se pudo eliminar la sesión.");
  }
}

async function duplicateSession() {
  const id = Number($("#edit-session-id").value);
  try {
    await writeJson(`/planificacion/sesiones/${id}/duplicar`, "POST", {
      fecha: $("#edit-session-date").value,
      franja: $("#edit-session-franja").value,
    });
    bootstrap.Modal.getOrCreateInstance($("#editSessionModal")).hide();
    await refreshAfterWrite();
  } catch (err) {
    console.error(`Error duplicando sesión ${id}:`, err);
    alert(err.message || "No se pudo duplicar la sesión.");
  }
}

async function refreshAfterWrite() {
  await loadMonth();
  if (state.selectedDate) {
    await loadDaySessions();
  }
}

async function loadLibrary() {
  const q = $("#library-search").value.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const data = await fetchJson(`/planificacion/biblioteca?${params.toString()}`);
  state.library = data.entrenamientos || [];
  renderLibrary();
}

function renderLibrary() {
  const list = $("#library-list");
  if (!state.library.length) {
    list.innerHTML = '<div class="empty-state">No hay entrenamientos en biblioteca.</div>';
    return;
  }
  list.innerHTML = state.library.map((workout) => `
    <button class="workout-card workout-card--${escapeHtml(normalizarTipo(workout.tipo_principal))}" data-workout-id="${workout.id}" type="button">
      <em>${escapeHtml(workout.bloque_principal || workout.objetivo || "Entrenamiento")}</em>
      <strong>${escapeHtml(workout.nombre)}</strong>
      <small>${escapeHtml(workout.objetivo || workout.notas || "")}</small>
    </button>
  `).join("");
  list.querySelectorAll(".workout-card").forEach((button) => {
    button.addEventListener("click", () => addWorkout(Number(button.dataset.workoutId)));
  });
}

async function addWorkout(entrenamientoId) {
  try {
    await writeJson(`/planificacion/atleta/${state.atletaId}/sesiones`, "POST", {
      fecha: state.selectedDate,
      entrenamiento_id: entrenamientoId,
      franja: $("#library-franja").value,
    });
    await refreshAfterWrite();
  } catch (err) {
    console.error("Error añadiendo entrenamiento a la planificación:", err);
    alert(err.message || "No se pudo añadir el entrenamiento a la planificación.");
  }
}

function setupEvents() {
  $("#prev-month").addEventListener("click", async () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    await loadMonth();
  });
  $("#next-month").addEventListener("click", async () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    await loadMonth();
  });
  $("#today-month").addEventListener("click", async () => {
    state.currentMonth = new Date();
    await loadMonth();
  });
  $("#library-search").addEventListener("input", loadLibrary);
  $("#edit-session-form").addEventListener("submit", saveSession);
  $("#delete-session").addEventListener("click", deleteSession);
  $("#duplicate-session").addEventListener("click", duplicateSession);
}

document.addEventListener("DOMContentLoaded", async () => {
  setupIdentity();
  setupEvents();
  await loadMonth();
});
