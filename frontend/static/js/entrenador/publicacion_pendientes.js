const API_BASE =
  window.API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:5002`;

const state = {
  filter: "hoy",
  sesiones: [],
  selected: new Set(),
  pendingScheduleIds: [],
};

const $ = (selector) => document.querySelector(selector);

const getCsrfToken = async () => {
  if (window.CSRF && typeof window.CSRF.ensureToken === "function") {
    return window.CSRF.ensureToken(true);
  }
  return localStorage.getItem("csrfToken");
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function normalizarTipo(value) {
  const tipo = String(value || "custom").toLowerCase();
  return ["warmup", "interval", "rest", "repeat", "cooldown", "custom"].includes(tipo)
    ? tipo
    : "custom";
}

function labelEstado(session) {
  if (session.estado_visibilidad === "programado") return "Programado";
  if (session.estado_visibilidad === "visible") return "Visible";
  return "Oculto";
}

function visibilidadIconClass(session) {
  return session.estado_visibilidad === "visible" ? "visibility-eye--visible" : "visibility-eye--hidden";
}

function formatFecha(value) {
  const d = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return value || "";
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }).replace(".", "");
}

function formatProgramacion(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) +
    " · " +
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje =
      res.status === 401 || res.status === 403
        ? "Tu sesión no tiene permiso de entrenador para esto. Vuelve a iniciar sesión e inténtalo de nuevo."
        : data.error || "Error de servidor";
    const error = new Error(mensaje);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function writeJson(path, method, body) {
  const token = await getCsrfToken();
  return fetchJson(path, {
    method,
    headers: { ...(token ? { "X-CSRF-Token": token } : {}) },
    body: JSON.stringify(body || {}),
  });
}

function showMessage(message, type = "info") {
  const summary = $("#publication-summary");
  if (!summary) return;
  summary.textContent = message;
  summary.classList.remove("publication-summary--error", "publication-summary--success");
  if (type === "error") summary.classList.add("publication-summary--error");
  if (type === "success") summary.classList.add("publication-summary--success");
}

function selectedIds() {
  return Array.from(state.selected);
}

function updateSelectionBar() {
  const bar = $("#publication-selection");
  const count = state.selected.size;
  if (!bar) return;
  bar.hidden = count === 0;
  $("#selected-count").textContent = `${count} seleccionado${count === 1 ? "" : "s"}`;
}

function render() {
  const list = $("#publication-list");
  const summary = $("#publication-summary");
  if (summary) showMessage(`${state.sesiones.length} pendiente${state.sesiones.length === 1 ? "" : "s"} de publicar`);
  updateSelectionBar();
  if (!state.sesiones.length) {
    list.innerHTML = '<div class="publication-empty">No hay entrenamientos pendientes en este filtro.</div>';
    return;
  }
  list.innerHTML = state.sesiones.map((session) => {
    const checked = state.selected.has(Number(session.id)) ? "checked" : "";
    const estado = labelEstado(session);
    const tipo = normalizarTipo(session.tipo_principal);
    return `
      <article class="publication-card publication-card--${escapeHtml(tipo)}">
        <label class="publication-check">
          <input type="checkbox" data-select-id="${session.id}" ${checked}>
          <span></span>
        </label>
        <div class="publication-date">
          <strong>${escapeHtml(formatFecha(session.fecha))}</strong>
          <small>${escapeHtml(session.franja || "")}</small>
        </div>
        <div class="publication-main-card">
          <small>${escapeHtml(session.atleta || "Atleta")}</small>
          <strong>${escapeHtml(session.nombre || "Entrenamiento")}</strong>
          <span>${escapeHtml(session.objetivo || session.notas || "Sesión planificada")}</span>
        </div>
        <div class="publication-status">
          <strong>
            <span class="visibility-eye ${escapeHtml(visibilidadIconClass(session))}" aria-hidden="true"></span>
            ${escapeHtml(estado)}
          </strong>
          <span>${escapeHtml(formatProgramacion(session.publicar_en))}</span>
        </div>
        <div class="publication-actions">
          <button class="btn btn-brand" type="button" data-action="publish" data-id="${session.id}">Publicar ahora</button>
          <button class="btn btn-outline-brand" type="button" data-action="schedule" data-id="${session.id}">
            ${session.estado_visibilidad === "programado" ? "Cambiar" : "Programar"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-select-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = Number(input.dataset.selectId);
      if (input.checked) state.selected.add(id);
      else state.selected.delete(id);
      updateSelectionBar();
    });
  });
  list.querySelectorAll("[data-action='publish']").forEach((btn) => {
    btn.addEventListener("click", () => publishIds([Number(btn.dataset.id)]));
  });
  list.querySelectorAll("[data-action='schedule']").forEach((btn) => {
    btn.addEventListener("click", () => openSchedule([Number(btn.dataset.id)]));
  });
}

async function loadPendientes() {
  const params = new URLSearchParams({ filtro: state.filter });
  const q = $("#publication-search")?.value.trim();
  if (q) params.set("q", q);
  try {
    const data = await fetchJson(`/planificacion/publicacion/pendientes?${params.toString()}`);
    state.sesiones = data.sesiones || [];
    const ids = new Set(state.sesiones.map((item) => Number(item.id)));
    state.selected = new Set(Array.from(state.selected).filter((id) => ids.has(id)));
    render();
  } catch (err) {
    showMessage(err.message || "No se pudieron cargar los pendientes.", "error");
  }
}

async function publishIds(ids) {
  if (!ids.length) return;
  setBusy(true);
  try {
    const data = await writeJson("/planificacion/publicacion/publicar", "POST", { ids });
    ids.forEach((id) => state.selected.delete(id));
    await loadPendientes();
    const publicados = data.publicados || [];
    const estadosEnvio = publicados.map((item) => item.envio?.estado).filter(Boolean);
    const hayEnviado = estadosEnvio.includes("enviado");
    const hayError = estadosEnvio.includes("error");
    const hayDeshabilitado = estadosEnvio.includes("deshabilitado");
    if (hayError) {
      showMessage("Entrenamiento publicado. No se pudo enviar el aviso por WhatsApp.", "error");
    } else if (hayEnviado) {
      showMessage("Entrenamiento publicado. WhatsApp enviado correctamente.", "success");
    } else if (hayDeshabilitado) {
      showMessage("Entrenamiento publicado. WhatsApp está deshabilitado.", "success");
    } else {
      showMessage(`${ids.length} entrenamiento${ids.length === 1 ? "" : "s"} publicado${ids.length === 1 ? "" : "s"}.`, "success");
    }
  } catch (err) {
    showMessage(err.message || "No se pudo publicar.", "error");
  } finally {
    setBusy(false);
  }
}

function showScheduleError(message) {
  const el = $("#schedule-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function openSchedule(ids) {
  state.pendingScheduleIds = ids;
  const first = state.sesiones.find((item) => Number(item.id) === Number(ids[0]));
  $("#schedule-datetime").value = first?.publicar_en ? String(first.publicar_en).slice(0, 16).replace(" ", "T") : "";
  showScheduleError(null);
  bootstrap.Modal.getOrCreateInstance($("#scheduleModal")).show();
}

async function submitSchedule(event) {
  event.preventDefault();
  showScheduleError(null);
  const submitBtn = $("#schedule-submit");
  setBusy(true);
  if (submitBtn) submitBtn.disabled = true;
  try {
    await writeJson("/planificacion/publicacion/programar", "POST", {
      ids: state.pendingScheduleIds,
      publicar_en: $("#schedule-datetime").value,
    });
    state.pendingScheduleIds.forEach((id) => state.selected.delete(id));
    state.pendingScheduleIds = [];
    bootstrap.Modal.getOrCreateInstance($("#scheduleModal")).hide();
    await loadPendientes();
    showMessage("Publicación programada.", "success");
  } catch (err) {
    // Se muestra dentro del propio modal -- si solo se actualizaba el
    // resumen de la página, con el modal abierto tapándola, un fallo
    // (p.ej. sesión sin permiso de entrenador) podía parecer que el
    // botón "Guardar" simplemente no hacía nada.
    showScheduleError(err.message || "No se pudo programar. Inténtalo de nuevo.");
  } finally {
    setBusy(false);
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setBusy(isBusy) {
  document.querySelectorAll("[data-action='publish'], [data-action='schedule'], #bulk-publish, #bulk-schedule")
    .forEach((button) => {
      button.disabled = isBusy;
    });
}

function setupEvents() {
  document.querySelectorAll(".publication-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".publication-tab").forEach((item) => item.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.filter = btn.dataset.filter || "hoy";
      await loadPendientes();
    });
  });
  $("#publication-search").addEventListener("input", loadPendientes);
  $("#bulk-publish").addEventListener("click", () => publishIds(selectedIds()));
  $("#bulk-schedule").addEventListener("click", () => openSchedule(selectedIds()));
  $("#schedule-form").addEventListener("submit", submitSchedule);
}

document.addEventListener("DOMContentLoaded", async () => {
  setupEvents();
  await loadPendientes();
});
