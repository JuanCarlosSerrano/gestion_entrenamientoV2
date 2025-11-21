const API =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API;

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  bloques: [],
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
  microDetalleEditIndex: null,
  entrenamientoBloques: [],
  bloqueDetalles: [],
};

let modalEntrenamiento;
let modalMicro;
let modalMeso;
let modalMacro;
let modalBloque;

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
    const [bloques, entrenamientos, microciclos, mesociclos, macrociclos] = await Promise.all([
      apiFetch("/plantillas/bloques"),
      apiFetch("/plantillas/entrenamientos"),
      apiFetch("/plantillas/microciclos"),
      apiFetch("/plantillas/mesociclos"),
      apiFetch("/plantillas/macrociclos"),
    ]);
    state.bloques = bloques;
    state.entrenamientos = entrenamientos;
    state.microciclos = microciclos;
    state.mesociclos = mesociclos;
    state.macrociclos = macrociclos;
    renderBloques();
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

function renderTabla(tbody, rowsHtml, columnas = 5) {
  if (!tbody) return;
  tbody.innerHTML =
    rowsHtml || `<tr><td colspan="${columnas}" class="text-muted text-center">Sin registros</td></tr>`;
}

function renderBloques() {
  const tbody = qs("#tabla-bloques tbody");
  const html = state.bloques
    .map(
      (bloque) => `
      <tr>
        <td>${bloque.nombre}</td>
        <td>${bloque.tipo || "-"}</td>
        <td>${bloque.duracion_valor ? `${bloque.duracion_valor} ${bloque.duracion_tipo || ""}` : "-"}</td>
        <td>${bloque.detalles?.length || 0}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-bloque" data-id="${bloque.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-bloque" data-id="${bloque.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html, 5);
}

function renderEntrenamientos() {
  const tbody = qs("#tabla-entrenamientos tbody");
  const html = state.entrenamientos
    .map(
      (ent) => `
      <tr>
        <td>${ent.nombre}</td>
        <td>${ent.categoria || "-"}</td>
        <td>${ent.intensidad || "-"}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-2" data-action="edit-entrenamiento" data-id="${ent.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete-entrenamiento" data-id="${ent.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");
  renderTabla(tbody, html, 4);
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
  renderTabla(tbody, html, 4);
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
  renderTabla(tbody, html, 4);
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
  renderTabla(tbody, html, 4);
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
  const bloqueDetalleSelect = qs("#bloque-detalle-select");
  if (bloqueDetalleSelect) {
    bloqueDetalleSelect.innerHTML =
      '<option value="">Selecciona bloque</option>' +
      state.bloques.map((b) => `<option value="${b.id}">${b.nombre}</option>`).join("");
  }
  const entrenamientoBloqueSelect = qs("#entrenamiento-bloque-select");
  if (entrenamientoBloqueSelect) {
    entrenamientoBloqueSelect.innerHTML =
      '<option value="">Selecciona bloque</option>' +
      state.bloques.map((b) => `<option value="${b.id}">${b.nombre}</option>`).join("");
  }
}

async function abrirModalEntrenamiento(entrenamiento) {
  let datos = entrenamiento;
  if (entrenamiento?.id) {
    try {
      datos = await apiFetch(`/plantillas/entrenamientos/${entrenamiento.id}`);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo cargar el entrenamiento", "danger");
      return;
    }
  }
  qs("#entrenamiento-id").value = datos?.id || "";
  qs("#entrenamiento-nombre").value = datos?.nombre || "";
  qs("#entrenamiento-categoria").value = datos?.categoria || "";
  qs("#entrenamiento-intensidad").value = datos?.intensidad || "";
  qs("#entrenamiento-descripcion").value = datos?.descripcion || "";
  modalState.entrenamientoBloques = (datos?.bloques || []).map((bloque) => ({
    bloque_id: bloque.bloque_id || bloque.id,
    bloque_nombre: bloque.bloque_nombre || nombreBloque(bloque.bloque_id || bloque.id),
    repeticiones: Number(bloque.repeticiones) || 1,
  }));
  renderBloquesEntrenamiento();
  qs("#entrenamiento-bloque-reps").value = 1;
  qs("#entrenamiento-bloque-select").value = "";
  qs("#titulo-modal-entrenamiento").textContent = datos?.id ? "Editar entrenamiento" : "Nuevo entrenamiento";
  modalEntrenamiento.show();
}

function abrirModalMicro(micro) {
  qs("#micro-id").value = micro?.id || "";
  qs("#micro-nombre").value = micro?.nombre || "";
  qs("#micro-tipo").value = micro?.tipo_semana || "";
  qs("#micro-descripcion").value = micro?.descripcion || "";
  modalState.microDetalleEditIndex = null;
  modalState.microDetalles = (micro?.detalles || []).map((det) => ({
    dia_semana: det.dia_semana,
    sesion: det.sesion,
    entrenamiento_id: det.entrenamiento_id,
    entrenamiento_nombre: det.entrenamiento_nombre,
  }));
  finalizarEdicionDetalleMicro();
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
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-edit" data-action="edit-detalle" data-index="${idx}">Editar</button>
            <button type="button" class="btn btn-outline-delete" data-action="remove-detalle" data-index="${idx}">Quitar</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

function nombreEntrenamiento(id) {
  return state.entrenamientos.find((e) => Number(e.id) === Number(id))?.nombre || `Entrenamiento ${id}`;
}

function nombreBloque(id) {
  return state.bloques.find((b) => Number(b.id) === Number(id))?.nombre || `Bloque ${id}`;
}

async function abrirModalBloque(bloque) {
  let datos = bloque;
  if (bloque?.id) {
    try {
      datos = await apiFetch(`/plantillas/bloques/${bloque.id}`);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo cargar el bloque", "danger");
      return;
    }
  }
  qs("#bloque-id").value = datos?.id || "";
  qs("#bloque-nombre").value = datos?.nombre || "";
  qs("#bloque-tipo").value = datos?.tipo || "";
  qs("#bloque-duracion").value = datos?.duracion_valor || "";
  qs("#bloque-duracion-tipo").value = datos?.duracion_tipo || "";
  qs("#bloque-intensidad").value = datos?.intensidad || "";
  qs("#bloque-descripcion").value = datos?.descripcion || "";
  modalState.bloqueDetalles = (datos?.detalles || []).map((det) => ({
    bloque_hijo_id: det.bloque_hijo_id || det.id,
    bloque_nombre: det.bloque_nombre || nombreBloque(det.bloque_hijo_id || det.id),
    repeticiones: Number(det.repeticiones) || 1,
  }));
  renderDetallesBloque();
  qs("#bloque-detalle-select").value = "";
  qs("#bloque-detalle-reps").value = 1;
  qs("#titulo-modal-bloque").textContent = datos?.id ? "Editar bloque" : "Nuevo bloque";
  modalBloque.show();
}

function renderDetallesBloque() {
  const tbody = qs("#tabla-detalles-bloque tbody");
  if (!tbody) return;
  if (!modalState.bloqueDetalles.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted small">No hay sub-bloques definidos.</td></tr>';
    return;
  }
  tbody.innerHTML = modalState.bloqueDetalles
    .map(
      (det, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${det.bloque_nombre || nombreBloque(det.bloque_hijo_id)}</td>
        <td>${det.repeticiones}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-detalle-bloque" data-index="${idx}">Quitar</button>
        </td>
      </tr>`
    )
    .join("");
}

function agregarDetalleBloque() {
  const select = qs("#bloque-detalle-select");
  if (!select || !select.value) {
    toast("Selecciona un bloque para añadir", "warning");
    return;
  }
  const bloquePadreId = Number(qs("#bloque-id").value || 0);
  const hijoId = Number(select.value);
  if (bloquePadreId && bloquePadreId === hijoId) {
    toast("Un bloque no puede contenerse a sí mismo", "warning");
    return;
  }
  const reps = Number(qs("#bloque-detalle-reps").value) || 1;
  modalState.bloqueDetalles.push({
    bloque_hijo_id: hijoId,
    bloque_nombre: nombreBloque(hijoId),
    repeticiones: reps,
  });
  renderDetallesBloque();
  select.value = "";
  qs("#bloque-detalle-reps").value = 1;
}

function quitarDetalleBloque(index) {
  modalState.bloqueDetalles.splice(index, 1);
  renderDetallesBloque();
}

async function guardarBloque(e) {
  e.preventDefault();
  const id = qs("#bloque-id").value;
  const payload = {
    nombre: qs("#bloque-nombre").value,
    tipo: qs("#bloque-tipo").value || null,
    descripcion: qs("#bloque-descripcion").value || null,
    duracion_valor: qs("#bloque-duracion").value || null,
    duracion_tipo: qs("#bloque-duracion-tipo").value || null,
    intensidad: qs("#bloque-intensidad").value || null,
    detalles: modalState.bloqueDetalles.map((det, idx) => ({
      bloque_hijo_id: det.bloque_hijo_id,
      repeticiones: det.repeticiones,
      orden: idx + 1,
    })),
  };
  if (!payload.nombre) {
    toast("El nombre es obligatorio", "warning");
    return;
  }
  try {
    if (id) {
      await apiFetch(`/plantillas/bloques/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Bloque actualizado");
    } else {
      await apiFetch("/plantillas/bloques", { method: "POST", body: JSON.stringify(payload) });
      toast("Bloque creado");
    }
    modalBloque.hide();
    await cargarDatos();
  } catch (err) {
    console.error(err);
    toast(err.message || "No se pudo guardar el bloque", "danger");
  }
}

function agregarDetalleMicro() {
  const entrenamientoId = qs("#micro-detalle-entrenamiento").value;
  if (!entrenamientoId) {
    toast("Selecciona un entrenamiento", "warning");
    return;
  }
  const dia = Number(qs("#micro-detalle-dia").value);
  const sesion = Number(qs("#micro-detalle-sesion").value);
  const detalle = {
    dia_semana: dia,
    sesion,
    entrenamiento_id: Number(entrenamientoId),
    entrenamiento_nombre: nombreEntrenamiento(entrenamientoId),
  };
  if (modalState.microDetalleEditIndex !== null) {
    modalState.microDetalles[modalState.microDetalleEditIndex] = detalle;
    finalizarEdicionDetalleMicro();
  } else {
    modalState.microDetalles.push(detalle);
  }
  renderDetallesMicro();
}

function quitarDetalleMicro(index) {
  modalState.microDetalles.splice(index, 1);
  renderDetallesMicro();
  if (modalState.microDetalleEditIndex === index) {
    finalizarEdicionDetalleMicro();
  } else if (
    modalState.microDetalleEditIndex !== null &&
    modalState.microDetalleEditIndex > index
  ) {
    modalState.microDetalleEditIndex -= 1;
  }
}

function iniciarEdicionDetalleMicro(index) {
  const detalle = modalState.microDetalles[index];
  if (!detalle) return;
  modalState.microDetalleEditIndex = index;
  const diaSelect = qs("#micro-detalle-dia");
  const sesionSelect = qs("#micro-detalle-sesion");
  const selectEntreno = qs("#micro-detalle-entrenamiento");
  if (diaSelect) diaSelect.value = String(detalle.dia_semana);
  if (sesionSelect) sesionSelect.value = String(detalle.sesion);
  if (selectEntreno) selectEntreno.value = String(detalle.entrenamiento_id);
  qs("#btn-agregar-detalle").textContent = "Actualizar";
  qs("#btn-cancelar-detalle")?.classList.remove("d-none");
}

function finalizarEdicionDetalleMicro() {
  modalState.microDetalleEditIndex = null;
  const diaSelect = qs("#micro-detalle-dia");
  const sesionSelect = qs("#micro-detalle-sesion");
  const selectEntreno = qs("#micro-detalle-entrenamiento");
  if (diaSelect) diaSelect.value = "1";
  if (sesionSelect) sesionSelect.value = "1";
  if (selectEntreno && selectEntreno.options.length) {
    selectEntreno.selectedIndex = 0;
  }
  qs("#btn-agregar-detalle").textContent = "Añadir";
  qs("#btn-cancelar-detalle")?.classList.add("d-none");
}

function renderBloquesEntrenamiento() {
  const tbody = qs("#tabla-entrenamiento-bloques tbody");
  if (!tbody) return;
  if (!modalState.entrenamientoBloques.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center text-muted small">Añade bloques para definir el trabajo.</td></tr>';
    return;
  }
  tbody.innerHTML = modalState.entrenamientoBloques
    .map(
      (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.bloque_nombre || nombreBloque(item.bloque_id)}</td>
        <td>${item.repeticiones}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-entrenamiento-bloque" data-index="${idx}">Quitar</button>
        </td>
      </tr>`
    )
    .join("");
}

function agregarBloqueEntrenamiento() {
  const select = qs("#entrenamiento-bloque-select");
  if (!select || !select.value) {
    toast("Selecciona un bloque", "warning");
    return;
  }
  const reps = Number(qs("#entrenamiento-bloque-reps").value) || 1;
  if (reps < 1) {
    toast("Las repeticiones deben ser mayores a cero", "warning");
    return;
  }
  const bloqueId = Number(select.value);
  modalState.entrenamientoBloques.push({
    bloque_id: bloqueId,
    bloque_nombre: nombreBloque(bloqueId),
    repeticiones: reps,
  });
  renderBloquesEntrenamiento();
  select.value = "";
  qs("#entrenamiento-bloque-reps").value = 1;
}

function quitarBloqueEntrenamiento(index) {
  modalState.entrenamientoBloques.splice(index, 1);
  renderBloquesEntrenamiento();
}

async function guardarEntrenamiento(e) {
  e.preventDefault();
  const body = {
    nombre: qs("#entrenamiento-nombre").value,
    categoria: qs("#entrenamiento-categoria").value || null,
    intensidad: qs("#entrenamiento-intensidad").value || null,
    descripcion: qs("#entrenamiento-descripcion").value || null,
  };
  const bloquesPayload = modalState.entrenamientoBloques.map((bloque, idx) => ({
    orden: idx + 1,
    bloque_id: bloque.bloque_id,
    repeticiones: bloque.repeticiones,
  }));
  if (!bloquesPayload.length) {
    toast("Añade al menos un bloque al entrenamiento", "warning");
    return;
  }
  const id = qs("#entrenamiento-id").value;
  try {
    let entrenamientoId = id;
    if (id) {
      await apiFetch(`/plantillas/entrenamientos/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Entrenamiento actualizado");
    } else {
      const res = await apiFetch("/plantillas/entrenamientos", { method: "POST", body: JSON.stringify(body) });
      entrenamientoId = res.id;
      toast("Entrenamiento creado");
    }
    await apiFetch(`/plantillas/entrenamientos/${entrenamientoId || id}/bloques`, {
      method: "PUT",
      body: JSON.stringify({ bloques: bloquesPayload }),
    });
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
  qs("#btn-nuevo-bloque")?.addEventListener("click", () => abrirModalBloque());
  qs("#btn-nuevo-entrenamiento")?.addEventListener("click", () => abrirModalEntrenamiento());
  qs("#btn-nuevo-micro")?.addEventListener("click", () => {
    modalState.microDetalles = [];
    abrirModalMicro();
  });
  qs("#btn-nuevo-meso")?.addEventListener("click", () => abrirModalMeso());
  qs("#btn-nuevo-macro")?.addEventListener("click", () => abrirModalMacro());

  qs("#form-plantilla-bloque")?.addEventListener("submit", guardarBloque);
  qs("#form-plantilla-entrenamiento")?.addEventListener("submit", guardarEntrenamiento);
  qs("#form-plantilla-micro")?.addEventListener("submit", guardarMicro);
  qs("#form-plantilla-meso")?.addEventListener("submit", guardarMeso);
  qs("#form-plantilla-macro")?.addEventListener("submit", guardarMacro);

  qs("#btn-agregar-detalle")?.addEventListener("click", agregarDetalleMicro);
  qs("#btn-cancelar-detalle")?.addEventListener("click", finalizarEdicionDetalleMicro);
  qs("#btn-agregar-detalle-bloque")?.addEventListener("click", agregarDetalleBloque);
  qs("#btn-agregar-bloque-entrenamiento")?.addEventListener("click", agregarBloqueEntrenamiento);

  qs("#tabla-entrenamiento-bloques")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "remove-entrenamiento-bloque") {
      const index = Number(btn.dataset.index);
      if (!Number.isNaN(index)) quitarBloqueEntrenamiento(index);
    }
  });

  qs("#tabla-detalles-bloque")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "remove-detalle-bloque") {
      const index = Number(btn.dataset.index);
      if (!Number.isNaN(index)) quitarDetalleBloque(index);
    }
  });

  qs("#tabla-detalles-micro")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (Number.isNaN(idx)) return;
    if (btn.dataset.action === "remove-detalle") {
      quitarDetalleMicro(idx);
    } else if (btn.dataset.action === "edit-detalle") {
      iniciarEdicionDetalleMicro(idx);
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    switch (action) {
      case "edit-bloque":
        abrirModalBloque(state.bloques.find((b) => Number(b.id) === Number(id)));
        break;
      case "delete-bloque":
        deleteResource(`/plantillas/bloques/${id}`, "¿Eliminar este bloque?");
        break;
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
  modalBloque = new bootstrap.Modal("#modalBloque");
  modalEntrenamiento = new bootstrap.Modal("#modalEntrenamiento");
  modalMicro = new bootstrap.Modal("#modalMicrociclo");
  modalMeso = new bootstrap.Modal("#modalMesociclo");
  modalMacro = new bootstrap.Modal("#modalMacrociclo");
  setupEventListeners();
  cargarDatos();
});
