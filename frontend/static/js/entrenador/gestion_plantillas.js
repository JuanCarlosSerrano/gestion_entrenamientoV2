const API = window.API_BASE || "http://127.0.0.1:5000";
window.API_BASE = API;

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  entrenamientos: [],
  microciclos: [],
  mesociclos: [],
  macrociclos: [],
};

const modalState = {
  entrenamiento: null,
  micro: null,
  meso: null,
  macro: null,
  microDetalles: [],
};

let modalEntrenamiento;
let modalMicro;
let modalMeso;
let modalMacro;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail") || ""}:${localStorage.getItem("userPassword") || ""}`);

async function ensureCsrf() {
  if (window.CSRF?.ensureToken) {
    return window.CSRF.ensureToken();
  }
  return localStorage.getItem("csrfToken");
}

async function apiFetch(path, options = {}) {
  const opts = {
    credentials: "include",
    headers: {
      Authorization: authHeader(),
      ...(options.headers || {}),
    },
    ...options,
  };
  const method = opts.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    const token = await ensureCsrf();
    if (token) opts.headers["X-CSRF-Token"] = token;
    if (!(opts.body instanceof FormData) && !opts.headers["Content-Type"]) {
      opts.headers["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(`${API}${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data;
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `alert alert-${type} shadow position-fixed top-0 start-50 translate-middle-x mt-3`;
  el.style.zIndex = "5000";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function setupTabs() {
  const btns = qsa("[data-tab-btn]");
  const panels = qsa("[data-tab-panel]");
  const activate = (tab) => {
    btns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tabBtn === tab));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === tab));
  };
  btns.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.tabBtn)));
  const current = btns.find((b) => b.classList.contains("active")) || btns[0];
  if (current) activate(current.dataset.tabBtn);
}

async function cargarDatos() {
  try {
    const [entrenamientos, microciclos, mesociclos, macrociclos] = await Promise.all([
      apiFetch("/plantillas/entrenamientos"),
      apiFetch("/plantillas/microciclos"),
      apiFetch("/plantillas/mesociclos"),
      apiFetch("/plantillas/macrociclos"),
    ]);
    state.entrenamientos = entrenamientos;
    state.microciclos = microciclos;
    state.mesociclos = mesociclos;
    state.macrociclos = macrociclos;
    renderEntrenamientos();
    renderMicrociclos();
    renderMesociclos();
    renderMacrociclos();
    actualizarSelectores();
  } catch (err) {
    console.error(err);
    toast(err.message || "No se pudieron cargar los datos", "danger");
  }
}

function renderTabla(tbody, rowsHtml) {
  if (!tbody) return;
  tbody.innerHTML = rowsHtml || `<tr><td colspan="5" class="text-muted text-center">Sin registros</td></tr>`;
}

function renderEntrenamientos() {
  const tbody = qs("#tabla-entrenamientos tbody");
  const html = state.entrenamientos
    .map(
      (ent) => `
      <tr>
        <td>${ent.nombre}</td>
        <td>${ent.duracion_referencia ? `${ent.duracion_referencia} ${ent.tipo_duracion || ""}` : "-"}</td>
        <td>${ent.categoria || "-"}</td>
        <td>${ent.intensidad || "-"}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-entrenamiento" data-id="${ent.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-entrenamiento" data-id="${ent.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html);
}

function renderMicrociclos() {
  const tbody = qs("#tabla-microciclos tbody");
  const html = state.microciclos
    .map(
      (mi) => `
      <tr>
        <td>${mi.nombre}</td>
        <td>${mi.tipo_semana || "-"}</td>
        <td>${mi.detalles?.length || 0}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-micro" data-id="${mi.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-micro" data-id="${mi.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html);
}

function renderMesociclos() {
  const tbody = qs("#tabla-mesociclos tbody");
  const html = state.mesociclos
    .map(
      (me) => `
      <tr>
        <td>${me.nombre}</td>
        <td>${me.tipo_bloque || "-"}</td>
        <td>${me.microciclos?.length || 0}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-meso" data-id="${me.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-meso" data-id="${me.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html);
}

function renderMacrociclos() {
  const tbody = qs("#tabla-macrociclos tbody");
  const html = state.macrociclos
    .map(
      (ma) => `
      <tr>
        <td>${ma.nombre}</td>
        <td>${ma.objetivo_principal || "-"}</td>
        <td>${ma.mesociclos?.length || 0}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-macro" data-id="${ma.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-macro" data-id="${ma.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html);
}

function actualizarSelectores() {
  const selectEntreno = qs("#micro-detalle-entrenamiento");
  if (selectEntreno) {
    selectEntreno.innerHTML = state.entrenamientos
      .map((ent) => `<option value="${ent.id}">${ent.nombre}</option>`)
      .join("");
  }
  const microSelect = qs("#meso-micro-select");
  if (microSelect) {
    microSelect.innerHTML = state.microciclos.map((mi) => `<option value="${mi.id}">${mi.nombre}</option>`).join("");
  }
  const mesoSelect = qs("#macro-meso-select");
  if (mesoSelect) {
    mesoSelect.innerHTML = state.mesociclos.map((me) => `<option value="${me.id}">${me.nombre}</option>`).join("");
  }
}

function abrirModalEntrenamiento(entrenamiento) {
  qs("#entrenamiento-id").value = entrenamiento?.id || "";
  qs("#entrenamiento-nombre").value = entrenamiento?.nombre || "";
  qs("#entrenamiento-duracion").value = entrenamiento?.duracion_referencia || "";
  qs("#entrenamiento-tipo-duracion").value = entrenamiento?.tipo_duracion || "";
  qs("#entrenamiento-categoria").value = entrenamiento?.categoria || "";
  qs("#entrenamiento-intensidad").value = entrenamiento?.intensidad || "";
  qs("#entrenamiento-descripcion").value = entrenamiento?.descripcion || "";
  qs("#titulo-modal-entrenamiento").textContent = entrenamiento ? "Editar entrenamiento" : "Nuevo entrenamiento";
  modalEntrenamiento.show();
}

function abrirModalMicro(micro) {
  qs("#micro-id").value = micro?.id || "";
  qs("#micro-nombre").value = micro?.nombre || "";
  qs("#micro-tipo").value = micro?.tipo_semana || "";
  qs("#micro-descripcion").value = micro?.descripcion || "";
  modalState.microDetalles = (micro?.detalles || []).map((det) => ({
    dia_semana: det.dia_semana,
    sesion: det.sesion,
    entrenamiento_id: det.entrenamiento_id,
    entrenamiento_nombre: det.entrenamiento_nombre,
  }));
  renderDetallesMicro();
  qs("#titulo-modal-micro").textContent = micro ? "Editar microciclo" : "Nuevo microciclo";
  modalMicro.show();
}

function abrirModalMeso(meso) {
  qs("#meso-id").value = meso?.id || "";
  qs("#meso-nombre").value = meso?.nombre || "";
  qs("#meso-tipo").value = meso?.tipo_bloque || "";
  qs("#meso-descripcion").value = meso?.descripcion || "";
  const select = qs("#meso-micro-select");
  if (select) {
    Array.from(select.options).forEach((opt) => {
      opt.selected = meso?.microciclos?.some((m) => Number(m.microciclo_id) === Number(opt.value)) || false;
    });
  }
  qs("#titulo-modal-meso").textContent = meso ? "Editar mesociclo" : "Nuevo mesociclo";
  modalMeso.show();
}

function abrirModalMacro(macro) {
  qs("#macro-id").value = macro?.id || "";
  qs("#macro-nombre").value = macro?.nombre || "";
  qs("#macro-objetivo").value = macro?.objetivo_principal || "";
  qs("#macro-duracion").value = macro?.duracion_semanas || "";
  qs("#macro-descripcion").value = macro?.descripcion || "";
  const select = qs("#macro-meso-select");
  if (select) {
    Array.from(select.options).forEach((opt) => {
      opt.selected = macro?.mesociclos?.some((m) => Number(m.mesociclo_id) === Number(opt.value)) || false;
    });
  }
  qs("#titulo-modal-macro").textContent = macro ? "Editar macrociclo" : "Nuevo macrociclo";
  modalMacro.show();
}

function renderDetallesMicro() {
  const tbody = qs("#tabla-detalles-micro tbody");
  if (!tbody) return;
  if (!modalState.microDetalles.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aún no hay bloques</td></tr>';
    return;
  }
  tbody.innerHTML = modalState.microDetalles
    .map(
      (det, idx) => `
      <tr>
        <td>${["L", "M", "X", "J", "V", "S", "D"][det.dia_semana - 1] || det.dia_semana}</td>
        <td>${det.sesion}</td>
        <td>${det.entrenamiento_nombre || nombreEntrenamiento(det.entrenamiento_id)}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-detalle" data-index="${idx}">Quitar</button>
        </td>
      </tr>`
    )
    .join("");
}

function nombreEntrenamiento(id) {
  return state.entrenamientos.find((e) => Number(e.id) === Number(id))?.nombre || `Entrenamiento ${id}`;
}

function agregarDetalleMicro() {
  const entrenamientoId = qs("#micro-detalle-entrenamiento").value;
  if (!entrenamientoId) {
    toast("Selecciona un entrenamiento", "warning");
    return;
  }
  const dia = Number(qs("#micro-detalle-dia").value);
  const sesion = Number(qs("#micro-detalle-sesion").value);
  modalState.microDetalles.push({
    dia_semana: dia,
    sesion,
    entrenamiento_id: Number(entrenamientoId),
    entrenamiento_nombre: nombreEntrenamiento(entrenamientoId),
  });
  renderDetallesMicro();
}

function quitarDetalleMicro(index) {
  modalState.microDetalles.splice(index, 1);
  renderDetallesMicro();
}

async function guardarEntrenamiento(e) {
  e.preventDefault();
  const body = {
    nombre: qs("#entrenamiento-nombre").value,
    duracion_referencia: qs("#entrenamiento-duracion").value || null,
    tipo_duracion: qs("#entrenamiento-tipo-duracion").value || null,
    categoria: qs("#entrenamiento-categoria").value || null,
    intensidad: qs("#entrenamiento-intensidad").value || null,
    descripcion: qs("#entrenamiento-descripcion").value || null,
  };
  const id = qs("#entrenamiento-id").value;
  try {
    if (id) {
      await apiFetch(`/plantillas/entrenamientos/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Entrenamiento actualizado");
    } else {
      await apiFetch("/plantillas/entrenamientos", { method: "POST", body: JSON.stringify(body) });
      toast("Entrenamiento creado");
    }
    modalEntrenamiento.hide();
    await cargarDatos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function guardarMicro(e) {
  e.preventDefault();
  const id = qs("#micro-id").value;
  const body = {
    nombre: qs("#micro-nombre").value,
    tipo_semana: qs("#micro-tipo").value || null,
    descripcion: qs("#micro-descripcion").value || null,
    detalles: modalState.microDetalles.map((det, idx) => ({
      dia_semana: det.dia_semana,
      sesion: det.sesion,
      orden: idx + 1,
      entrenamiento_id: det.entrenamiento_id,
    })),
  };
  if (!body.detalles.length) {
    toast("Añade al menos un entrenamiento", "warning");
    return;
  }
  try {
    if (id) {
      await apiFetch(`/plantillas/microciclos/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Microciclo actualizado");
    } else {
      await apiFetch("/plantillas/microciclos", { method: "POST", body: JSON.stringify(body) });
      toast("Microciclo creado");
    }
    modalMicro.hide();
    await cargarDatos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

function valoresSeleccion(select) {
  return Array.from(select.selectedOptions).map((opt) => Number(opt.value));
}

async function guardarMeso(e) {
  e.preventDefault();
  const id = qs("#meso-id").value;
  const body = {
    nombre: qs("#meso-nombre").value,
    tipo_bloque: qs("#meso-tipo").value || null,
    descripcion: qs("#meso-descripcion").value || null,
    microciclos: valoresSeleccion(qs("#meso-micro-select")),
  };
  if (!body.microciclos.length) {
    toast("Selecciona al menos un microciclo", "warning");
    return;
  }
  try {
    if (id) {
      await apiFetch(`/plantillas/mesociclos/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Mesociclo actualizado");
    } else {
      await apiFetch("/plantillas/mesociclos", { method: "POST", body: JSON.stringify(body) });
      toast("Mesociclo creado");
    }
    modalMeso.hide();
    await cargarDatos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function guardarMacro(e) {
  e.preventDefault();
  const id = qs("#macro-id").value;
  const body = {
    nombre: qs("#macro-nombre").value,
    objetivo_principal: qs("#macro-objetivo").value || null,
    duracion_semanas: qs("#macro-duracion").value || null,
    descripcion: qs("#macro-descripcion").value || null,
    mesociclos: valoresSeleccion(qs("#macro-meso-select")),
  };
  if (!body.mesociclos.length) {
    toast("Selecciona al menos un mesociclo", "warning");
    return;
  }
  try {
    if (id) {
      await apiFetch(`/plantillas/macrociclos/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Macrociclo actualizado");
    } else {
      await apiFetch("/plantillas/macrociclos", { method: "POST", body: JSON.stringify(body) });
      toast("Macrociclo creado");
    }
    modalMacro.hide();
    await cargarDatos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function deleteResource(path, message) {
  if (!confirm(message)) return;
  try {
    await apiFetch(path, { method: "DELETE" });
    await cargarDatos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

function setupEventListeners() {
  qs("#btn-nuevo-entrenamiento")?.addEventListener("click", () => abrirModalEntrenamiento());
  qs("#btn-nuevo-micro")?.addEventListener("click", () => {
    modalState.microDetalles = [];
    abrirModalMicro();
  });
  qs("#btn-nuevo-meso")?.addEventListener("click", () => abrirModalMeso());
  qs("#btn-nuevo-macro")?.addEventListener("click", () => abrirModalMacro());

  qs("#form-plantilla-entrenamiento")?.addEventListener("submit", guardarEntrenamiento);
  qs("#form-plantilla-micro")?.addEventListener("submit", guardarMicro);
  qs("#form-plantilla-meso")?.addEventListener("submit", guardarMeso);
  qs("#form-plantilla-macro")?.addEventListener("submit", guardarMacro);

  qs("#btn-agregar-detalle")?.addEventListener("click", agregarDetalleMicro);

  qs("#tabla-detalles-micro")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='remove-detalle']");
    if (btn) {
      const idx = Number(btn.dataset.index);
      quitarDetalleMicro(idx);
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    switch (action) {
      case "edit-entrenamiento":
        abrirModalEntrenamiento(state.entrenamientos.find((ent) => Number(ent.id) === Number(id)));
        break;
      case "delete-entrenamiento":
        deleteResource(`/plantillas/entrenamientos/${id}`, "¿Eliminar este entrenamiento?");
        break;
      case "edit-micro":
        abrirModalMicro(state.microciclos.find((mi) => Number(mi.id) === Number(id)));
        break;
      case "delete-micro":
        deleteResource(`/plantillas/microciclos/${id}`, "¿Eliminar este microciclo?");
        break;
      case "edit-meso":
        abrirModalMeso(state.mesociclos.find((me) => Number(me.id) === Number(id)));
        break;
      case "delete-meso":
        deleteResource(`/plantillas/mesociclos/${id}`, "¿Eliminar este mesociclo?");
        break;
      case "edit-macro":
        abrirModalMacro(state.macrociclos.find((ma) => Number(ma.id) === Number(id)));
        break;
      case "delete-macro":
        deleteResource(`/plantillas/macrociclos/${id}`, "¿Eliminar este macrociclo?");
        break;
      default:
        break;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  modalEntrenamiento = new bootstrap.Modal("#modalEntrenamiento");
  modalMicro = new bootstrap.Modal("#modalMicrociclo");
  modalMeso = new bootstrap.Modal("#modalMesociclo");
  modalMacro = new bootstrap.Modal("#modalMacrociclo");
  setupEventListeners();
  cargarDatos();
});
