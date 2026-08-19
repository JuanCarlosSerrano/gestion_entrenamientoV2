const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");

const DAYS = [
  { id: 1, label: "LUN" },
  { id: 2, label: "MAR" },
  { id: 3, label: "MIÉ" },
  { id: 4, label: "JUE" },
  { id: 5, label: "VIE" },
  { id: 6, label: "SÁB" },
  { id: 7, label: "DOM" },
];

const state = {
  athletes: [],
  selectedAthletes: new Set(),
  filtersLoaded: false,
  workouts: [],
  weekTemplates: [],
  sessions: [],
  draggedSessionId: null,
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getCsrfToken = async () => {
  if (window.CSRF?.ensureToken) return window.CSRF.ensureToken(true);
  return localStorage.getItem("csrfToken");
};

const showStatus = (message, type = "info") => {
  const el = $("#planning-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
};

// d.toISOString() convierte a UTC: entre medianoche y ~1-2h de madrugada
// (según el huso horario del entrenador) eso puede devolver el día anterior.
// Formateamos en local para que la fecha coincida con la que ve el usuario.
const toLocalISODate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const mondayOf = (date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return toLocalISODate(d);
};

const sessionId = () => `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const formatKm = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
};

const normalizarFranja = (value) => (value === "tarde" ? "tarde" : "manana");

const goToControlCenter = () => {
  window.location.href = "index.html";
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

async function fetchJson(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function postJson(url, payload) {
  const token = await getCsrfToken();
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-CSRF-Token": token } : {}),
    },
    body: JSON.stringify(payload),
  });
}

function renderWeekBoard() {
  const board = $("#week-board");
  board.innerHTML = DAYS.map((day) => `
    <section class="day-column" data-day="${day.id}">
      <div class="day-title">${day.label}</div>
      ${["manana", "tarde"].map((slot) => `
        <div class="slot" data-day="${day.id}" data-slot="${slot}">
          <span class="slot-label">${slot === "manana" ? "MAÑANA" : "TARDE"}</span>
          <div class="slot-sessions"></div>
        </div>
      `).join("")}
    </section>
  `).join("");

  board.querySelectorAll(".slot").forEach((slot) => {
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("is-over");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
    slot.addEventListener("drop", onDropIntoSlot);
  });
  renderSessions();
}

function renderSessions() {
  document.querySelectorAll(".slot-sessions").forEach((el) => {
    el.innerHTML = "";
  });

  const ordered = [...state.sessions].sort((a, b) => a.orden - b.orden);
  ordered.forEach((session) => {
    const target = document.querySelector(
      `.slot[data-day="${session.dia_semana}"][data-slot="${session.franja}"] .slot-sessions`
    );
    if (!target) return;
    const el = document.createElement("article");
    el.className = "planned-session";
    el.draggable = true;
    el.dataset.sessionId = session.id;
    el.innerHTML = `
      <strong>${escapeHtml(session.nombre)}</strong>
      <small>${escapeHtml(session.objetivo || "")}</small>
      <div class="session-actions">
        <button type="button" data-action="duplicate" title="Duplicar">⧉</button>
        <button type="button" data-action="delete" title="Eliminar">×</button>
      </div>
    `;
    el.addEventListener("dragstart", (event) => {
      state.draggedSessionId = session.id;
      event.dataTransfer.setData("text/plain", `session:${session.id}`);
    });
    el.querySelector('[data-action="duplicate"]').addEventListener("click", () => duplicateSession(session.id));
    el.querySelector('[data-action="delete"]').addEventListener("click", () => deleteSession(session.id));
    target.appendChild(el);
  });

  const totalKm = state.sessions.reduce((sum, item) => sum + Number(item.km_totales || 0), 0);
  $("#session-count").textContent = `${state.sessions.length} ${state.sessions.length === 1 ? "sesión" : "sesiones"}`;
  $("#km-count").textContent = `${formatKm(totalKm)} km`;
}

function addSessionFromWorkout(workout, day, slot) {
  const sameSlot = state.sessions.filter((s) => s.dia_semana === day && s.franja === slot);
  state.sessions.push({
    id: sessionId(),
    entrenamiento_id: workout.id,
    nombre: workout.nombre,
    objetivo: workout.objetivo,
    notas: workout.notas,
    km_totales: workout.km_totales || 0,
    dia_semana: day,
    franja: slot,
    orden: sameSlot.length + 1,
  });
  renderSessions();
}

function onDropIntoSlot(event) {
  event.preventDefault();
  const slot = event.currentTarget;
  slot.classList.remove("is-over");
  const day = Number(slot.dataset.day);
  const franja = normalizarFranja(slot.dataset.slot);
  const raw = event.dataTransfer.getData("text/plain");

  if (raw.startsWith("workout:")) {
    const workoutId = Number(raw.replace("workout:", ""));
    const workout = state.workouts.find((item) => Number(item.id) === workoutId);
    if (workout) addSessionFromWorkout(workout, day, franja);
    return;
  }

  if (raw.startsWith("session:")) {
    const id = raw.replace("session:", "");
    const session = state.sessions.find((item) => item.id === id);
    if (!session) return;
    session.dia_semana = day;
    session.franja = franja;
    session.orden = state.sessions.filter((s) => s.dia_semana === day && s.franja === franja).length + 1;
    renderSessions();
  }
}

function duplicateSession(id) {
  const session = state.sessions.find((item) => item.id === id);
  if (!session) return;
  state.sessions.push({
    ...session,
    id: sessionId(),
    orden: state.sessions.filter((s) => s.dia_semana === session.dia_semana && s.franja === session.franja).length + 1,
  });
  renderSessions();
}

function deleteSession(id) {
  state.sessions = state.sessions.filter((item) => item.id !== id);
  renderSessions();
}

function renderAthletes() {
  const list = $("#athlete-list");
  if (!state.athletes.length) {
    list.innerHTML = '<div class="empty-state">No hay atletas con esos filtros.</div>';
    updateSelectedCount();
    return;
  }

  list.innerHTML = state.athletes.map((athlete) => {
    const name = `${athlete.nombre || ""} ${athlete.apellidos || ""}`.trim() || athlete.email;
    const selected = state.selectedAthletes.has(Number(athlete.id));
    const meta = [athlete.grupo, athlete.subgrupo, athlete.categoria].filter(Boolean).join(" · ");
    return `
      <button class="athlete-card ${selected ? "is-selected" : ""}" data-athlete-id="${athlete.id}" type="button">
        <strong>${escapeHtml(name)} ${selected ? "✓" : ""}</strong>
        <small>${escapeHtml(meta || "Sin grupo")}</small>
        <small>${athlete.tiene_zonas ? "Zonas registradas" : "Sin zonas registradas"}</small>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".athlete-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.athleteId);
      if (state.selectedAthletes.has(id)) state.selectedAthletes.delete(id);
      else state.selectedAthletes.add(id);
      renderAthletes();
    });
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = state.selectedAthletes.size;
  $("#selected-count").textContent = `${count} ${count === 1 ? "seleccionado" : "seleccionados"}`;
}

function fillSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  select.value = current;
}

async function loadAthletes() {
  const params = new URLSearchParams();
  const q = $("#athlete-search").value.trim();
  const group = $("#filter-group").value;
  const subgroup = $("#filter-subgroup").value;
  const category = $("#filter-category").value;
  if (q) params.set("q", q);
  if (group) params.set("grupo", group);
  if (subgroup) params.set("subgrupo", subgroup);
  if (category) params.set("categoria", category);

  try {
    const data = await fetchJson(`/planificacion/atletas?${params.toString()}`);
    state.athletes = data.atletas || [];
    if (!state.filtersLoaded && data.filtros) {
      fillSelect($("#filter-group"), data.filtros.grupos || [], "Todos los grupos");
      fillSelect($("#filter-subgroup"), data.filtros.subgrupos || [], "Todos los subgrupos");
      fillSelect($("#filter-category"), data.filtros.categorias || [], "Todas las categorías");
      state.filtersLoaded = true;
    }
    renderAthletes();
  } catch (error) {
    showStatus(error.message || "No se pudieron cargar atletas", "danger");
  }
}

function renderWorkouts() {
  const list = $("#workout-list");
  if (!state.workouts.length) {
    list.innerHTML = '<div class="empty-state">No hay entrenamientos en tu biblioteca.</div>';
    return;
  }
  list.innerHTML = state.workouts.map((workout) => `
    <article class="workout-card" draggable="true" data-workout-id="${workout.id}">
      <em>${escapeHtml(workout.bloque_principal || workout.objetivo || "Entrenamiento")}</em>
      <strong>${escapeHtml(workout.nombre)}</strong>
      <small>${escapeHtml(workout.objetivo || workout.notas || "")}</small>
      <small>${formatKm(workout.km_totales)} km</small>
    </article>
  `).join("");
  list.querySelectorAll(".workout-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", `workout:${card.dataset.workoutId}`);
    });
    card.addEventListener("click", () => {
      const firstSlot = document.querySelector('.slot[data-day="1"][data-slot="manana"]');
      const workout = state.workouts.find((item) => Number(item.id) === Number(card.dataset.workoutId));
      if (workout && firstSlot) addSessionFromWorkout(workout, 1, "manana");
    });
  });
}

async function loadWorkouts() {
  const params = new URLSearchParams();
  const q = $("#workout-search").value.trim();
  const type = $("#workout-type").value;
  if (q) params.set("q", q);
  if (type) params.set("tipo", type);
  try {
    const data = await fetchJson(`/planificacion/biblioteca?${params.toString()}`);
    state.workouts = data.entrenamientos || [];
    renderWorkouts();
  } catch (error) {
    $("#workout-list").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderWeekTemplates() {
  const list = $("#week-template-list");
  if (!state.weekTemplates.length) {
    list.innerHTML = '<div class="empty-state">Todavía no hay Semanas tipo.</div>';
    return;
  }
  list.innerHTML = state.weekTemplates.map((week) => `
    <article class="week-template-card">
      <strong>${escapeHtml(week.nombre)}</strong>
      <small>${Number(week.sesiones || 0)} sesiones · ${formatKm(week.km_totales)} km</small>
      <small>${escapeHtml(week.objetivo || "")}</small>
      <div class="week-template-actions">
        <button class="btn btn-sm btn-outline-secondary" data-action="preview" data-week-id="${week.id}" type="button">Vista previa</button>
        <button class="btn btn-sm btn-primary" data-action="apply" data-week-id="${week.id}" type="button">Aplicar</button>
      </div>
    </article>
  `).join("");
  list.querySelectorAll('[data-action="apply"]').forEach((button) => {
    button.addEventListener("click", () => applyWeekTemplate(Number(button.dataset.weekId)));
  });
  list.querySelectorAll('[data-action="preview"]').forEach((button) => {
    button.addEventListener("click", () => previewWeekTemplate(Number(button.dataset.weekId)));
  });
}

async function loadWeekTemplates() {
  try {
    state.weekTemplates = await fetchJson("/semanas_tipo");
    renderWeekTemplates();
  } catch (error) {
    $("#week-template-list").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function applyWeekTemplate(id) {
  try {
    const data = await fetchJson(`/semanas_tipo/${id}`);
    state.sessions = (data.sesiones || []).map((session, index) => ({
      id: sessionId(),
      entrenamiento_id: session.entrenamiento_id,
      nombre: session.nombre,
      objetivo: session.objetivo,
      notas: session.notas,
      km_totales: session.km_totales || 0,
      dia_semana: Number(session.dia_semana || session.dia_relativo || 1),
      franja: normalizarFranja(session.franja),
      orden: session.orden || index + 1,
    }));
    renderSessions();
    showStatus(`Semana tipo cargada: ${data.nombre}. Puedes editarla antes de asignar.`, "success");
  } catch (error) {
    showStatus(error.message || "No se pudo aplicar la Semana tipo", "danger");
  }
}

async function previewWeekTemplate(id) {
  try {
    const data = await fetchJson(`/semanas_tipo/${id}`);
    const total = (data.sesiones || []).length;
    showStatus(`${data.nombre}: ${total} sesiones. Pulsa Aplicar para cargar una copia editable.`, "info");
  } catch (error) {
    showStatus(error.message || "No se pudo cargar la vista previa", "danger");
  }
}

async function assignWeek() {
  if (!state.selectedAthletes.size) {
    showStatus("Selecciona al menos un atleta.", "warning");
    return;
  }
  if (!state.sessions.length) {
    showStatus("Añade entrenamientos a la mesa semanal.", "warning");
    return;
  }
  const fechaInicio = $("#week-start").value;
  try {
    const payload = {
      fecha_inicio: fechaInicio,
      atletas_ids: [...state.selectedAthletes],
      sesiones: state.sessions.map((session, index) => ({
        entrenamiento_id: session.entrenamiento_id,
        dia_semana: session.dia_semana,
        franja: session.franja,
        orden: session.orden || index + 1,
        nombre: session.nombre,
        notas: session.notas,
      })),
    };
    const data = await postJson("/planificacion/semanal/asignar", payload);
    showStatus(`${data.creados} entrenamientos asignados ocultos. Puedes guardar esta estructura como Semana tipo.`, "success");
    const modal = bootstrap.Modal.getOrCreateInstance($("#saveWeekModal"));
    modal.show();
  } catch (error) {
    showStatus(error.message || "No se pudo asignar la semana", "danger");
  }
}

async function saveWeekTemplate(event) {
  event.preventDefault();
  const nombre = $("#week-template-name").value.trim();
  if (!nombre || !state.sessions.length) return;
  try {
    await postJson("/planificacion/semanal/guardar_semana_tipo", {
      nombre,
      objetivo: $("#week-template-objective").value.trim(),
      sesiones: state.sessions.map((session, index) => ({
        entrenamiento_id: session.entrenamiento_id,
        dia_semana: session.dia_semana,
        franja: session.franja,
        orden: session.orden || index + 1,
        notas: session.notas,
      })),
    });
    bootstrap.Modal.getOrCreateInstance($("#saveWeekModal")).hide();
    $("#week-template-name").value = "";
    $("#week-template-objective").value = "";
    await loadWeekTemplates();
    goToControlCenter();
  } catch (error) {
    showStatus(error.message || "No se pudo guardar la Semana tipo", "danger");
  }
}

function setupEvents() {
  $("#week-start").value = mondayOf(new Date());
  ["athlete-search", "filter-group", "filter-subgroup", "filter-category"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "athlete-search" ? "input" : "change", () => loadAthletes());
  });
  ["workout-search", "workout-type"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === "workout-search" ? "input" : "change", () => loadWorkouts());
  });
  $("#btn-select-filtered").addEventListener("click", () => {
    state.athletes.forEach((athlete) => state.selectedAthletes.add(Number(athlete.id)));
    renderAthletes();
  });
  $("#btn-clear-week").addEventListener("click", () => {
    state.sessions = [];
    renderSessions();
    showStatus("Mesa semanal vacía.", "info");
  });
  $("#btn-assign-week").addEventListener("click", assignWeek);
  $("#save-week-form").addEventListener("submit", saveWeekTemplate);
  $("#btn-skip-save-week").addEventListener("click", goToControlCenter);

  document.querySelectorAll(".library-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".library-tab").forEach((item) => item.classList.remove("is-active"));
      document.querySelectorAll(".library-panel").forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(tab.dataset.tab === "weeks" ? "library-weeks" : "library-workouts").classList.add("is-active");
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupIdentity();
  setupEvents();
  renderWeekBoard();
  await Promise.all([loadAthletes(), loadWorkouts(), loadWeekTemplates()]);
});
