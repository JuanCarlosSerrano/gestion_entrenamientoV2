const API = window.API_BASE || "http://127.0.0.1:5000";
window.API_BASE = API;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail") || ""}:${localStorage.getItem("userPassword") || ""}`);

const state = {
  macros: [],
  entrenamientos: [],
  atletas: [],
  csrf: null,
  microSeleccionadoId: null,
  entrenamientoActivoId: null,
  filtroBiblioteca: "",
};

const DIAS_SEMANA = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
  { id: 7, label: "Domingo" },
];

const SESIONES_DIA = [
  { id: 1, label: "Sesión 1 (mañana)" },
  { id: 2, label: "Sesión 2 (tarde)" },
  { id: 3, label: "Sesión 3" },
];

let modalEntreno;
let modalAtletas;

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

async function ensureCsrf() {
  if (window.CSRF?.ensureToken) {
    state.csrf = await window.CSRF.ensureToken();
    return state.csrf;
  }
  state.csrf = localStorage.getItem("csrfToken");
  return state.csrf;
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
    if (token) {
      opts.headers["X-CSRF-Token"] = token;
    }
    if (!(opts.body instanceof FormData) && !opts.headers["Content-Type"]) {
      opts.headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(`${API}${path}`, opts);
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    console.warn("Respuesta sin JSON en", path);
  }
  if (!response.ok) {
    const msg = data?.error || `Error ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

function toast(msg, type = "success") {
  const container = document.createElement("div");
  container.className = `alert alert-${type} shadow position-fixed top-0 start-50 translate-middle-x mt-3`;
  container.style.zIndex = "4000";
  container.textContent = msg;
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2500);
}

async function cargarCatalogos() {
  try {
    state.entrenamientos = await apiFetch("/entrenamientos");
  } catch (err) {
    console.error("No se pudieron cargar entrenamientos", err);
  }
  try {
    state.atletas = await apiFetch("/atletas");
  } catch (err) {
    console.error("No se pudieron cargar atletas", err);
  }
  pintarSelectEntrenamientos();
  pintarSelectAtletas();
  renderBibliotecaEntrenamientos();
}

function pintarSelectEntrenamientos() {
  const select = qs("#select-entrenamiento-ciclo");
  if (!select) return;
  select.innerHTML = state.entrenamientos
    .map((e) => `<option value="${e.id}">${e.nombre}</option>`)
    .join("");
}

function pintarSelectAtletas() {
  const select = qs("#asignacion-atletas");
  if (!select) return;
  select.innerHTML = state.atletas
    .map((a) => `<option value="${a.id}">${a.nombre} ${a.apellidos}</option>`)
    .join("");
}

async function cargarCiclos() {
  try {
    const macros = await apiFetch("/macrociclos");
    for (const macro of macros) {
      macro.mesos = await apiFetch(`/mesociclos?macrociclo_id=${macro.id}`);
      for (const meso of macro.mesos) {
        meso.micros = await apiFetch(`/microciclos?mesociclo_id=${meso.id}`);
        for (const micro of meso.micros) {
          try {
            micro.entrenamientos = await apiFetch(`/ciclos/micro/${micro.id}/entrenamientos`);
          } catch {
            micro.entrenamientos = [];
          }
          try {
            micro.asignaciones = await apiFetch(`/ciclos/micro/${micro.id}/asignaciones`);
          } catch {
            micro.asignaciones = [];
          }
        }
      }
    }
    state.macros = macros;
    renderCiclos();
    actualizarSelects();
    renderMicroBuilderSelect();
    renderMicroBuilderGrid();
  } catch (err) {
    console.error("Error cargando ciclos:", err);
    toast(err.message || "No se pudieron cargar los ciclos", "danger");
  }
}

function actualizarSelects() {
  const macroSelect = qs("#meso-macro-select");
  const mesoSelect = qs("#micro-meso-select");
  if (macroSelect) {
    macroSelect.innerHTML =
      '<option value="" disabled selected>Selecciona macrociclo</option>' +
      state.macros.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
  }
  if (mesoSelect) {
    const todosMesos = state.macros.flatMap((m) => m.mesos || []);
    mesoSelect.innerHTML =
      '<option value="" disabled selected>Selecciona mesociclo</option>' +
      todosMesos.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
  }
}

function renderCiclos() {
  const contenedor = qs("#ciclos-arbol");
  if (!contenedor) return;
  if (!state.macros.length) {
    contenedor.innerHTML = '<p class="text-muted">Aún no hay macrociclos creados.</p>';
    return;
  }

  contenedor.innerHTML = state.macros
    .map((macro, idx) => {
      const headerId = `macro-heading-${macro.id}`;
      const collapseId = `macro-collapse-${macro.id}`;
      return `
      <div class="accordion-item">
        <h2 class="accordion-header" id="${headerId}">
          <button class="accordion-button ${idx === 0 ? "" : "collapsed"}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
            ${macro.nombre} · ${macro.fecha_inicio} → ${macro.fecha_fin}
          </button>
        </h2>
        <div id="${collapseId}" class="accordion-collapse collapse ${idx === 0 ? "show" : ""}" data-bs-parent="#ciclos-arbol">
          <div class="accordion-body">
            <p class="text-muted">${macro.objetivo_general || "Sin objetivo definido"}</p>
            ${renderMesociclos(macro)}
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderMesociclos(macro) {
  if (!macro.mesos?.length) {
    return '<p class="text-muted">Este macrociclo no tiene mesociclos todavía.</p>';
  }
  return `
    <div class="list-group">
      ${macro.mesos
        .map(
          (meso) => `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <strong>${meso.nombre}</strong><br>
              <small>${meso.fecha_inicio} → ${meso.fecha_fin}</small>
            </div>
            <span class="text-muted">${meso.objetivo || "Sin objetivo"}</span>
          </div>
          <div class="mt-3 ms-3">
            ${renderMicrociclos(meso)}
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function renderMicrociclos(meso) {
  if (!meso.micros?.length) {
    return '<p class="text-muted">No hay microciclos definidos.</p>';
  }
  return meso.micros
    .map(
      (micro) => `
      <div class="border rounded p-3 mb-3 bg-white sombra-suave">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <strong>${micro.nombre}</strong>
            <p class="mb-0 small text-muted">${micro.fecha_inicio} → ${micro.fecha_fin}</p>
            <p class="mb-0 small">${micro.objetivo || ""}</p>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-brand btn-sm btn-open-assign-training" data-id="${micro.id}" data-tipo="micro">Añadir entrenamiento</button>
            <button class="btn btn-outline-brand btn-sm btn-open-assign-athletes" data-id="${micro.id}" data-tipo="micro">Asignar atletas</button>
          </div>
        </div>
        <div class="mt-3">
          <h6>Entrenamientos</h6>
          ${micro.entrenamientos?.length ? renderListaEntrenamientos(micro.entrenamientos) : '<p class="text-muted">Sin entrenamientos asociados.</p>'}
        </div>
        <div class="mt-3">
          <h6>Asignaciones a atletas</h6>
          ${micro.asignaciones?.length ? renderListaAsignaciones(micro.asignaciones) : '<p class="text-muted">Todavía no se ha asignado a ningún atleta.</p>'}
        </div>
      </div>
    `
    )
    .join("");
}

function renderListaEntrenamientos(items) {
  return `
    <ul class="list-group small">
      ${items
        .map(
          (item) => `
        <li class="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>
            ${item.entrenamiento_nombre || "Entrenamiento"}
            ${item.dia_relativo ? `· Día ${item.dia_relativo}` : ""}
            ${item.sesion_indice ? `· Sesión ${item.sesion_indice}` : ""}
          </span>
          <button class="btn btn-sm btn-outline-danger btn-remove-entreno" data-id="${item.id}" data-tipo="${item.tipo_ciclo}" data-ciclo="${item.ciclo_id}">Eliminar</button>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function renderListaAsignaciones(items) {
  return `
    <ul class="list-group small">
      ${items
        .map(
          (item) => `
        <li class="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <strong>${item.atleta}</strong><br>
            <small>${item.fecha_inicio_real}</small>
          </div>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <span class="chip ${item.estado === "finalizado" ? "chip-success" : "chip-warning"}">${item.estado || "planificado"}</span>
            <button class="btn btn-outline-success btn-sm btn-mark-asignacion" data-id="${item.id}" data-tipo="${item.tipo_ciclo}" data-ciclo="${item.ciclo_id}" data-estado="${item.estado}">
              ${item.estado === "finalizado" ? "Reabrir" : "Finalizar"}
            </button>
            <button class="btn btn-outline-danger btn-sm btn-remove-asignacion" data-id="${item.id}" data-tipo="${item.tipo_ciclo}" data-ciclo="${item.ciclo_id}">
              Eliminar
            </button>
          </div>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function entrenamientosFiltrados() {
  const term = (state.filtroBiblioteca || "").trim().toLowerCase();
  let lista = state.entrenamientos || [];
  if (term) {
    lista = lista.filter((ent) => {
      const texto = `${ent.nombre || ""} ${ent.tipo || ""} ${ent.categoria || ""} ${ent.descripcion || ""}`.toLowerCase();
      return texto.includes(term);
    });
  }
  return lista.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

function renderBibliotecaEntrenamientos() {
  const contenedor = qs("#biblioteca-entrenamientos");
  if (!contenedor) return;
  const lista = entrenamientosFiltrados();
  if (!lista.length) {
    contenedor.innerHTML = '<p class="text-muted small mb-0">No se encontraron entrenamientos.</p>';
    return;
  }
  contenedor.innerHTML = lista
    .map(
      (ent) => `
        <div class="micro-library__item ${Number(state.entrenamientoActivoId) === Number(ent.id) ? "active" : ""}" data-entrenamiento-id="${ent.id}">
          <p class="micro-library__title mb-1">${ent.nombre}</p>
          <p class="micro-library__meta mb-0">
            ${ent.tipo || "Sin tipo"} ${ent.categoria ? `· ${ent.categoria}` : ""}
          </p>
        </div>
      `
    )
    .join("");
}

function todosLosMicrociclos() {
  return state.macros.flatMap((macro) =>
    (macro.mesos || []).flatMap((meso) => meso.micros || [])
  );
}

function microSeleccionado() {
  const id = Number(state.microSeleccionadoId);
  if (!id) return null;
  return todosLosMicrociclos().find((micro) => Number(micro.id) === id) || null;
}

function renderMicroBuilderSelect() {
  const select = qs("#micro-plan-select");
  if (!select) return;
  const micros = todosLosMicrociclos();
  if (!micros.length) {
    select.innerHTML =
      '<option value="" selected disabled>No hay microciclos disponibles</option>';
    state.microSeleccionadoId = null;
    return;
  }
  if (!micros.some((m) => Number(m.id) === Number(state.microSeleccionadoId))) {
    state.microSeleccionadoId = micros[0]?.id ?? null;
  }
  const placeholderSelected = state.microSeleccionadoId ? "" : "selected";
  select.innerHTML =
    `<option value="" disabled ${placeholderSelected}>Selecciona un microciclo</option>` +
    micros
      .map(
        (micro) =>
          `<option value="${micro.id}" ${
            Number(micro.id) === Number(state.microSeleccionadoId) ? "selected" : ""
          }>${micro.nombre}</option>`
      )
      .join("");
  if (state.microSeleccionadoId) {
    select.value = state.microSeleccionadoId;
  }
}

function labelSesion(sesion) {
  const found = SESIONES_DIA.find((s) => s.id === Number(sesion));
  return found ? found.label : `Sesión ${sesion}`;
}

function renderMicroBuilderGrid() {
  const grid = qs("#micro-week-grid");
  if (!grid) return;
  const micro = microSeleccionado();
  if (!micro) {
    grid.innerHTML = '<p class="text-muted">Selecciona un microciclo para comenzar.</p>';
    return;
  }

  const mapa = {};
  (micro.entrenamientos || []).forEach((item) => {
    const dia = Number(item.dia_relativo) || 0;
    const sesion = Number(item.sesion_indice) || 1;
    if (!mapa[dia]) {
      mapa[dia] = {};
    }
    mapa[dia][sesion] = item;
  });

  const diaHtml = DIAS_SEMANA.map((dia) => {
    const slots = SESIONES_DIA.map((sesion) => {
      const registro = mapa[dia.id]?.[sesion.id];
      const filled = Boolean(registro);
      const entrenamientoNombre = registro?.entrenamiento_nombre || "Vacío";
      const notas = registro?.notas ? `<p class="small text-muted mb-2">${registro.notas}</p>` : "";
      return `
        <div class="micro-slot ${filled ? "filled" : "empty"}" data-dia="${dia.id}" data-sesion="${sesion.id}">
          <div class="micro-slot__label">${labelSesion(sesion.id)}</div>
          <p class="micro-slot__training">${entrenamientoNombre}</p>
          ${notas}
          <div class="micro-slot__actions">
            <button
              class="btn btn-sm btn-outline-brand btn-slot-assign"
              data-micro="${micro.id}"
              data-dia="${dia.id}"
              data-sesion="${sesion.id}"
              data-registro="${registro?.id || ""}"
              data-entrenamiento="${registro?.entrenamiento_id || ""}"
            >
              ${filled ? "Reemplazar" : "Asignar"}
            </button>
            ${
              filled
                ? `<button class="btn btn-sm btn-outline-danger btn-slot-clear" data-micro="${micro.id}" data-registro="${registro.id}">Eliminar</button>`
                : ""
            }
          </div>
        </div>
      `;
    }).join("");
    return `
      <div class="micro-day-card">
        <p class="micro-day-card__title">${dia.label}</p>
        ${slots}
      </div>
    `;
  }).join("");

  const sinDia = (micro.entrenamientos || []).filter((item) => !item.dia_relativo);
  const sinDiaHtml = sinDia.length
    ? `<div class="micro-day-card full-width">
        <p class="micro-day-card__title">Entrenamientos sin día asignado</p>
        <ul class="list-group small mb-3">
          ${sinDia
            .map(
              (item) => `
            <li class="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <span>${item.entrenamiento_nombre || "Entrenamiento"} · ${labelSesion(
                item.sesion_indice || 1
              )}</span>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-brand btn-slot-assign" data-micro="${micro.id}" data-dia="" data-sesion="${
                item.sesion_indice || 1
              }" data-registro="${item.id}" data-entrenamiento="${item.entrenamiento_id}">
                  Asignar día
                </button>
                <button class="btn btn-sm btn-outline-danger btn-slot-clear" data-micro="${micro.id}" data-registro="${item.id}">
                  Eliminar
                </button>
              </div>
            </li>`
            )
            .join("")}
        </ul>
        <div class="alert alert-warning small mb-0">Asigna estos entrenamientos a un día concreto para generar calendarios consistentes.</div>
      </div>`
    : "";

  grid.innerHTML = diaHtml + sinDiaHtml;
}

function setupTabs() {
  const buttons = qsa("[data-tab-btn]");
  const panels = qsa("[data-tab-panel]");

  const activate = (tab) => {
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tabBtn === tab);
    });
    panels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tabBtn));
  });

  // Ensure a default tab is shown
  const defaultBtn = buttons.find((btn) => btn.classList.contains("active")) || buttons[0];
  if (defaultBtn) activate(defaultBtn.dataset.tabBtn);
}

function setupMicroBuilder() {
  qs("#micro-plan-select")?.addEventListener("change", (e) => {
    state.microSeleccionadoId = Number(e.target.value);
    renderMicroBuilderGrid();
  });

  qs("#micro-week-grid")?.addEventListener("click", (e) => {
    const assignBtn = e.target.closest(".btn-slot-assign");
    if (assignBtn) {
      abrirModalParaSlot(assignBtn.dataset);
      return;
    }
    const clearBtn = e.target.closest(".btn-slot-clear");
    if (clearBtn) {
      eliminarSlot(clearBtn.dataset);
    }
  });
}

function setupBibliotecaHandlers() {
  qs("#input-buscar-entrenamiento")?.addEventListener("input", (e) => {
    state.filtroBiblioteca = e.target.value;
    renderBibliotecaEntrenamientos();
  });

  qs("#btn-limpiar-entrenamiento")?.addEventListener("click", () => {
    state.entrenamientoActivoId = null;
    renderBibliotecaEntrenamientos();
  });

  qs("#biblioteca-entrenamientos")?.addEventListener("click", (e) => {
    const item = e.target.closest(".micro-library__item");
    if (!item) return;
    const id = item.dataset.entrenamientoId;
    state.entrenamientoActivoId =
      Number(state.entrenamientoActivoId) === Number(id) ? null : Number(id);
    renderBibliotecaEntrenamientos();
  });
}

function abrirModalParaSlot(dataset) {
  const dia = dataset.dia || "";
  const sesion = dataset.sesion || "1";
  qs("#ciclo-target-id").value = dataset.micro;
  qs("#ciclo-target-tipo").value = "micro";
  qs("#slot-existing-id").value = dataset.registro || "";
  qs("#input-dia-relativo").value = dia;
  qs("#input-sesion-indice").value = sesion;

  const selectEntreno = qs("#select-entrenamiento-ciclo");
  if (dataset.entrenamiento) {
    selectEntreno.value = dataset.entrenamiento;
  } else if (state.entrenamientoActivoId) {
    selectEntreno.value = state.entrenamientoActivoId;
  } else {
    selectEntreno.selectedIndex = 0;
  }
  qs("#input-orden").value =
    dia && sesion ? `${parseInt(dia, 10)}${parseInt(sesion, 10)}` : "";
  qs("#input-notas-entrenamiento").value = "";
  modalEntreno?.show();
}

async function eliminarSlot(dataset) {
  if (!dataset?.registro) return;
  if (!confirm("¿Eliminar este bloque del día?")) return;
  try {
    await apiFetch(`/ciclos/micro/${dataset.micro}/entrenamientos/${dataset.registro}`, {
      method: "DELETE",
    });
    toast("Bloque eliminado");
    cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

function setupForms() {
  const formMacro = qs("#form-macro");
  formMacro?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(formMacro).entries());
    try {
      await apiFetch("/macrociclos", { method: "POST", body: JSON.stringify(data) });
      formMacro.reset();
      toast("Macrociclo creado");
      cargarCiclos();
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  const formMeso = qs("#form-meso");
  formMeso?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(formMeso).entries());
    try {
      await apiFetch("/mesociclos", { method: "POST", body: JSON.stringify(data) });
      formMeso.reset();
      toast("Mesociclo creado");
      cargarCiclos();
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  const formMicro = qs("#form-micro");
  formMicro?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(formMicro).entries());
    try {
      await apiFetch("/microciclos", { method: "POST", body: JSON.stringify(data) });
      formMicro.reset();
      toast("Microciclo creado");
      cargarCiclos();
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  qs("#btn-recargar-ciclos")?.addEventListener("click", () => cargarCiclos());
}

function setupModalHandlers() {
  const arbol = qs("#ciclos-arbol");
  modalEntreno = new bootstrap.Modal("#modalAsignarEntrenamiento");
  modalAtletas = new bootstrap.Modal("#modalAsignarAtletas");

  arbol?.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-open-assign-training")) {
      const { id, tipo } = e.target.dataset;
      qs("#ciclo-target-id").value = id;
      qs("#ciclo-target-tipo").value = tipo;
      qs("#input-orden").value = "";
      qs("#input-dia-relativo").value = "";
      qs("#input-sesion-indice").value = "1";
      qs("#input-notas-entrenamiento").value = "";
      qs("#slot-existing-id").value = "";
      qs("#select-entrenamiento-ciclo").selectedIndex = 0;
      modalEntreno.show();
    }
    if (e.target.classList.contains("btn-open-assign-athletes")) {
      const { id, tipo } = e.target.dataset;
      qs("#ciclo-atleta-id").value = id;
      qs("#ciclo-atleta-tipo").value = tipo;
      qs("#asignacion-fecha").value = "";
      qs("#asignacion-notas").value = "";
      qsa("#asignacion-atletas option").forEach((opt) => (opt.selected = false));
      modalAtletas.show();
    }
    if (e.target.classList.contains("btn-remove-entreno")) {
      const registroId = e.target.dataset.id;
      const tipo = e.target.dataset.tipo;
      const ciclo = e.target.dataset.ciclo;
      eliminarEntrenamientoDeCiclo(tipo, ciclo, registroId);
    }
    if (e.target.classList.contains("btn-remove-asignacion")) {
      const asignacionId = e.target.dataset.id;
      const tipo = e.target.dataset.tipo;
      const ciclo = e.target.dataset.ciclo;
      eliminarAsignacion(tipo, ciclo, asignacionId);
    }
    if (e.target.classList.contains("btn-mark-asignacion")) {
      const asignacionId = e.target.dataset.id;
      const tipo = e.target.dataset.tipo;
      const ciclo = e.target.dataset.ciclo;
      const estadoActual = e.target.dataset.estado || "planificado";
      const nuevoEstado = estadoActual === "finalizado" ? "planificado" : "finalizado";
      actualizarAsignacion(tipo, ciclo, asignacionId, nuevoEstado);
    }
  });

  qs("#form-asignar-entrenamiento-ciclo")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cicloId = qs("#ciclo-target-id").value;
    const tipo = qs("#ciclo-target-tipo").value;
    const slotExistente = qs("#slot-existing-id").value;
    const body = {
      entrenamiento_id: qs("#select-entrenamiento-ciclo").value,
      orden: qs("#input-orden").value || null,
      dia_relativo: qs("#input-dia-relativo").value || null,
      sesion_indice: qs("#input-sesion-indice").value || 1,
      notas: qs("#input-notas-entrenamiento").value || null,
    };
    try {
      if (slotExistente) {
        await apiFetch(`/ciclos/${tipo}/${cicloId}/entrenamientos/${slotExistente}`, {
          method: "DELETE",
        });
        qs("#slot-existing-id").value = "";
      }
      await apiFetch(`/ciclos/${tipo}/${cicloId}/entrenamientos`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("Entrenamiento añadido al ciclo");
      modalEntreno.hide();
      cargarCiclos();
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  qs("#form-asignar-atletas-ciclo")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cicloId = qs("#ciclo-atleta-id").value;
    const tipo = qs("#ciclo-atleta-tipo").value;
    const fecha = qs("#asignacion-fecha").value;
    const notas = qs("#asignacion-notas").value;
    const seleccion = Array.from(qs("#asignacion-atletas").selectedOptions).map(
      (opt) => opt.value
    );
    if (!seleccion.length) {
      toast("Selecciona al menos un atleta", "warning");
      return;
    }
    try {
      await apiFetch(`/ciclos/${tipo}/${cicloId}/asignaciones`, {
        method: "POST",
        body: JSON.stringify({
          fecha_inicio_real: fecha,
          notas,
          atleta_ids: seleccion,
        }),
      });
      toast("Ciclo asignado a atletas");
      modalAtletas.hide();
      cargarCiclos();
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}

async function eliminarEntrenamientoDeCiclo(tipo, cicloId, registroId) {
  if (!confirm("¿Eliminar este entrenamiento del ciclo?")) return;
  try {
    await apiFetch(`/ciclos/${tipo}/${cicloId}/entrenamientos/${registroId}`, {
      method: "DELETE",
    });
    toast("Entrenamiento eliminado");
    cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarAsignacion(tipo, cicloId, asignacionId) {
  if (!confirm("¿Eliminar la asignación y sus entrenamientos generados?")) return;
  try {
    await apiFetch(`/ciclos/${tipo}/${cicloId}/asignaciones/${asignacionId}`, {
      method: "DELETE",
    });
    toast("Asignación eliminada");
    cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function actualizarAsignacion(tipo, cicloId, asignacionId, estado) {
  try {
    await apiFetch(`/ciclos/${tipo}/${cicloId}/asignaciones/${asignacionId}`, {
      method: "PUT",
      body: JSON.stringify({ estado }),
    });
    toast("Asignación actualizada");
    cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await cargarCatalogos();
  setupForms();
  setupModalHandlers();
  setupMicroBuilder();
  setupBibliotecaHandlers();
  cargarCiclos();
});
