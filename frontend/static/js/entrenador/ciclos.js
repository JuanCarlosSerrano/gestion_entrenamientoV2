const API =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail") || ""}:${localStorage.getItem("userPassword") || ""}`);

const state = {
  macros: [],
  mesociclos: [],
  microCatalogo: [],
  entrenamientos: [],
  atletas: [],
  csrf: null,
  microSeleccionadoId: null,
  microEditandoId: null,
  mesoEditandoId: null,
  macroEditandoId: null,
  entrenamientoActivoId: null,
  filtroBiblioteca: "",
  filtroMicros: "",
  filtroMesos: "",
  dragPayload: null,
  sesionesActivas: {},
  mesoSemanasActivas: 0,
  macroBloquesActivos: 0,
};

const DRAG_TYPES = {
  TRAINING: "training",
  REST: "rest",
  MICRO: "micro",
  MESO: "meso",
};

const MAX_SESIONES_DIA = 3;
const DEFAULT_SEMANAS_MESO = 4;
const MAX_SEMANAS_MESO = 6;
const DEFAULT_BLOQUES_MACRO = 3;
const MAX_BLOQUES_MACRO = 6;

function getMicroById(id) {
  if (!id) return null;
  return (
    state.microCatalogo.find((m) => Number(m.id) === Number(id)) ||
    state.macros
      .flatMap((macro) => macro.mesos || [])
      .flatMap((meso) => meso.micros || [])
      .find((m) => Number(m.id) === Number(id)) ||
    null
  );
}

function getMesoById(id) {
  if (!id) return null;
  return state.mesociclos.find((m) => Number(m.id) === Number(id)) || null;
}

function getMacroById(id) {
  if (!id) return null;
  return state.macros.find((m) => Number(m.id) === Number(id)) || null;
}

function isMicroBuilderVisible() {
  return microBuilderView && !microBuilderView.classList.contains("d-none");
}

function prepareSesionesActivas(micro) {
  const mapa = {};
  (micro?.entrenamientos || []).forEach((item) => {
    const dia = Number(item.dia_relativo) || 0;
    const sesion = Number(item.sesion_indice) || 1;
    mapa[dia] = Math.max(mapa[dia] || 0, sesion);
  });
  state.sesionesActivas = {};
  DIAS_SEMANA.forEach((dia) => {
    state.sesionesActivas[dia.id] = Math.max(mapa[dia.id] || 1, 1);
  });
}

function addSessionForDay(dia) {
  const dayId = Number(dia);
  if (!dayId) return;
  const actual = state.sesionesActivas[dayId] || 1;
  if (actual >= MAX_SESIONES_DIA) return;
  state.sesionesActivas[dayId] = actual + 1;
  renderMicroBuilderGrid();
}

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

function qs(sel) {
  return document.querySelector(sel);
}

function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

let modalEntreno;
let modalAtletas;
const microListView = qs("#micro-list-view");
const microBuilderView = qs("#micro-builder-view");
const microListContainer = qs("#micro-list");
const microCreateBtn = qs("#micro-create-btn");
const microBackBtn = qs("#micro-builder-back");
const microBuilderTitle = qs("#micro-builder-title");
const microIdField = document.getElementById("micro-id-field");
const mesoListView = qs("#meso-list-view");
const mesoBuilderView = qs("#meso-builder-view");
const mesoListContainer = qs("#meso-list");
const mesoCreateBtn = qs("#meso-create-btn");
const mesoBackBtn = qs("#meso-builder-back");
const mesoBuilderTitle = qs("#meso-builder-title");
const mesoIdField = document.getElementById("meso-id-field");
const mesoAddWeekBtn = qs("#meso-add-week-btn");
const macroListView = qs("#macro-list-view");
const macroBuilderView = qs("#macro-builder-view");
const macroListContainer = qs("#macro-list");
const macroCreateBtn = qs("#macro-create-btn");
const macroBackBtn = qs("#macro-builder-back");
const macroBuilderTitle = qs("#macro-builder-title");
const macroIdField = document.getElementById("macro-id-field");
const macroAddBlockBtn = qs("#macro-add-block-btn");

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
    const planCache = new Map();
    const fetchPlan = async (mesoId) => {
      if (!planCache.has(mesoId)) {
        planCache.set(
          mesoId,
          apiFetch(`/ciclos/meso/${mesoId}/microciclos`).catch(() => [])
        );
      }
      return planCache.get(mesoId);
    };
    let mesoCatalogo = [];
    try {
      mesoCatalogo = await apiFetch("/mesociclos");
    } catch {
      mesoCatalogo = [];
    }
    state.mesociclos = await Promise.all(
      (mesoCatalogo || []).map(async (meso) => {
        meso.plan_micros = await fetchPlan(meso.id);
        return meso;
      })
    );
    const mesoMap = new Map(
      (state.mesociclos || []).map((meso) => [Number(meso.id), meso])
    );
    for (const macro of macros) {
      try {
        macro.plan_mesos = await apiFetch(`/ciclos/macro/${macro.id}/mesociclos`);
      } catch {
        macro.plan_mesos = [];
      }
      macro.mesos = (macro.plan_mesos || []).map((entrada) => {
        const completo = mesoMap.get(Number(entrada.mesociclo_id));
        if (completo) {
          return { ...completo, relacion_macro_meso_id: entrada.id, orden_relativa: entrada.orden };
        }
        return {
          id: entrada.mesociclo_id,
          nombre: entrada.meso_nombre || "Mesociclo",
          objetivo: entrada.meso_objetivo || "",
          relacion_macro_meso_id: entrada.id,
          orden_relativa: entrada.orden,
        };
      });
    }
    state.macros = macros;
    try {
      const catalogo = await apiFetch("/microciclos");
      const enriquecidos = [];
      for (const micro of catalogo) {
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
        enriquecidos.push(micro);
      }
      state.microCatalogo = enriquecidos;
    } catch (err) {
      console.warn("No se pudieron cargar los microciclos globales", err);
      state.microCatalogo = [];
    }
    renderCiclos();
    actualizarSelects();
    renderMicroList();
    renderMesoList();
    renderMacroList();
    renderBibliotecaMicros();
    renderBibliotecaMesos();
    if (state.microEditandoId) {
      const micro = getMicroById(state.microEditandoId);
      if (micro) {
        prepareSesionesActivas(micro);
        renderMicroBuilderGrid();
      } else {
        showMicroList();
      }
    } else if (isMicroBuilderVisible()) {
      renderMicroBuilderGrid();
    }
    if (state.mesoEditandoId) {
      const meso = getMesoById(state.mesoEditandoId);
      if (meso) {
        if (!state.mesoSemanasActivas) {
          state.mesoSemanasActivas = Math.max(meso.plan_micros?.length || 0, DEFAULT_SEMANAS_MESO);
        }
        renderMesoBuilderGrid();
      } else {
        showMesoList();
      }
    } else if (mesoBuilderView && !mesoBuilderView.classList.contains("d-none")) {
      renderMesoBuilderGrid();
    }
    if (state.macroEditandoId) {
      const macro = getMacroById(state.macroEditandoId);
      if (macro) {
        if (!state.macroBloquesActivos) {
          state.macroBloquesActivos = Math.max(macro.plan_mesos?.length || 0, DEFAULT_BLOQUES_MACRO);
        }
        renderMacroBuilderGrid();
      } else {
        showMacroList();
      }
    } else if (macroBuilderView && !macroBuilderView.classList.contains("d-none")) {
      renderMacroBuilderGrid();
    }
  } catch (err) {
    console.error("Error cargando ciclos:", err);
    toast(err.message || "No se pudieron cargar los ciclos", "danger");
  }
}

function actualizarSelects() {
  const macroSelect = qs("#meso-macro-select");
  if (macroSelect) {
    macroSelect.innerHTML =
      '<option value="" disabled selected>Selecciona macrociclo</option>' +
      state.macros.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
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
  const plan = (meso.plan_micros || []).sort(
    (a, b) => Number(a.orden || 0) - Number(b.orden || 0)
  );
  if (!plan.length) {
    return '<p class="text-muted">No hay microciclos definidos para este meso.</p>';
  }
  return plan
    .map(
      (item) => `
        <div class="border rounded p-3 mb-3 bg-white sombra-suave">
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div>
              <strong>Semana ${item.orden || "-"}</strong><br>
              <span>${item.micro_nombre || "Microciclo"}</span>
              <p class="mb-0 small text-muted">${item.micro_objetivo || "Sin objetivo"}</p>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-outline-brand btn-sm btn-open-assign-training" data-id="${item.microciclo_id}" data-tipo="micro">Añadir entrenamiento</button>
              <button class="btn btn-outline-brand btn-sm btn-open-assign-athletes" data-id="${item.microciclo_id}" data-tipo="micro">Asignar atletas</button>
            </div>
          </div>
        </div>`
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
  const contenedores = ["#biblioteca-entrenamientos", "#biblioteca-entrenamientos-panel"]
    .map((sel) => qs(sel))
    .filter(Boolean);
  if (!contenedores.length) return;
  const lista = entrenamientosFiltrados();
  let html = lista.length
    ? lista
        .map(
          (ent) => `
        <div class="micro-library__item ${
          Number(state.entrenamientoActivoId) === Number(ent.id) ? "active" : ""
        }" data-entrenamiento-id="${ent.id}" data-drag-type="${DRAG_TYPES.TRAINING}" draggable="true">
          <p class="micro-library__title mb-1">${ent.nombre}</p>
          <p class="micro-library__meta mb-0">
            ${ent.tipo || "Sin tipo"} ${ent.categoria ? `· ${ent.categoria}` : ""}
          </p>
        </div>
      `
        )
        .join("")
    : '<p class="text-muted small mb-3">No se encontraron entrenamientos.</p>';

  const descansoCard = `
    <div class="micro-library__item micro-library__item--rest" data-drag-type="${DRAG_TYPES.REST}" draggable="true">
      <p class="micro-library__title mb-1">Descanso</p>
      <p class="micro-library__meta mb-0">Arrastra para marcar un día libre.</p>
    </div>`;

  contenedores.forEach((contenedor) => {
    contenedor.innerHTML = html + descansoCard;
    setupLibraryDrag(contenedor);
  });
}

function microsFiltrados() {
  const term = (state.filtroMicros || "").trim().toLowerCase();
  let lista = state.microCatalogo || [];
  if (term) {
    lista = lista.filter((micro) => {
      const texto = `${micro.nombre || ""} ${micro.objetivo || ""}`.toLowerCase();
      return texto.includes(term);
    });
  }
  return lista.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

function renderBibliotecaMicros() {
  const contenedor = qs("#meso-micro-library");
  if (!contenedor) return;
  const lista = microsFiltrados();
  if (!lista.length) {
    contenedor.innerHTML =
      '<p class="text-muted small mb-0">No se encontraron microciclos. Crea algunos en la pestaña Microciclos.</p>';
    return;
  }
  contenedor.innerHTML = lista
    .map(
      (micro) => `
      <div class="micro-library__item" data-drag-type="${DRAG_TYPES.MICRO}" data-micro-id="${micro.id}" draggable="true">
        <p class="micro-library__title mb-1">${micro.nombre}</p>
        <p class="micro-library__meta mb-0">${micro.objetivo || "Sin objetivo"}</p>
      </div>
    `
    )
    .join("");
  setupLibraryDrag(contenedor);
}

function mesociclosFiltrados() {
  const term = (state.filtroMesos || "").trim().toLowerCase();
  let lista = state.mesociclos || [];
  if (term) {
    lista = lista.filter((meso) => {
      const texto = `${meso.nombre || ""} ${meso.objetivo || ""}`.toLowerCase();
      return texto.includes(term);
    });
  }
  return lista.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

function renderBibliotecaMesos() {
  const contenedor = qs("#macro-meso-library");
  if (!contenedor) return;
  const lista = mesociclosFiltrados();
  if (!lista.length) {
    contenedor.innerHTML =
      '<p class="text-muted small mb-0">No hay mesociclos disponibles. Crea algunos primero.</p>';
    return;
  }
  contenedor.innerHTML = lista
    .map(
      (meso) => `
      <div class="micro-library__item" data-drag-type="${DRAG_TYPES.MESO}" data-meso-id="${meso.id}" draggable="true">
        <p class="micro-library__title mb-1">${meso.nombre}</p>
        <p class="micro-library__meta mb-0">${meso.objetivo || "Sin objetivo"}</p>
      </div>
    `
    )
    .join("");
  setupLibraryDrag(contenedor);
}

function setupLibraryDrag(container) {
  container.querySelectorAll(".micro-library__item").forEach((item) => {
    item.addEventListener("dragstart", handleLibraryDragStart);
    item.addEventListener("dragend", handleLibraryDragEnd);
  });
}

function handleLibraryDragStart(e) {
  const item = e.currentTarget;
  const tipo = item.dataset.dragType || DRAG_TYPES.TRAINING;
  state.dragPayload = {
    tipo,
  };
  if (tipo === DRAG_TYPES.TRAINING && item.dataset.entrenamientoId) {
    state.dragPayload.entrenamientoId = item.dataset.entrenamientoId || null;
    state.entrenamientoActivoId = Number(item.dataset.entrenamientoId);
  }
  if (tipo === DRAG_TYPES.MICRO && item.dataset.microId) {
    state.dragPayload.microId = item.dataset.microId;
  }
  if (tipo === DRAG_TYPES.MESO && item.dataset.mesoId) {
    state.dragPayload.mesoId = item.dataset.mesoId;
  }
  item.classList.add("dragging");
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tipo);
  }
}

function handleLibraryDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  state.dragPayload = null;
}

function todosLosMicrociclos() {
  if (state.microCatalogo?.length) {
    return state.microCatalogo;
  }
  return state.macros.flatMap((macro) =>
    (macro.mesos || []).flatMap((meso) => meso.micros || [])
  );
}

function microResumenSemana(micro) {
  if (!micro?.entrenamientos?.length) {
    return '<p class="text-muted small mb-0">Todavía no has planificado esta semana.</p>';
  }
  const mapa = {};
  micro.entrenamientos.forEach((item) => {
    const dia = Number(item.dia_relativo) || 0;
    if (!mapa[dia]) mapa[dia] = [];
    mapa[dia].push(item);
  });
  const dias = DIAS_SEMANA.map((dia) => {
    const slots = (mapa[dia.id] || []).sort(
      (a, b) => Number(a.sesion_indice || 0) - Number(b.sesion_indice || 0)
    );
    if (!slots.length) {
      return `
        <div class="micro-card__day">
          <span>${dia.label}</span>
          <span class="text-muted small">Sin asignar</span>
        </div>`;
    }
    const chips = slots
      .map((slot) => {
        if (!slot.entrenamiento_id) {
          return '<span class="micro-card__chip micro-card__chip--rest">Descanso</span>';
        }
        const nombre = slot.entrenamiento_nombre || "Entrenamiento";
        return `<span class="micro-card__chip">${nombre}</span>`;
      })
      .join("");
    return `
      <div class="micro-card__day">
        <span>${dia.label}</span>
        <div class="micro-card__chips">${chips}</div>
      </div>`;
  }).join("");
  return `<div class="micro-card__week">${dias}</div>`;
}

function renderMicroList() {
  if (!microListContainer) return;
  const lista = todosLosMicrociclos();
  if (!lista.length) {
    microListContainer.innerHTML =
      '<div class="app-card text-center py-4"><p class="mb-1 fw-semibold">Todavía no tienes microciclos guardados</p><p class="text-muted small mb-3">Utiliza el botón "Nuevo microciclo" para crear tu primera semana tipo.</p><button class="btn btn-primary btn-sm" id="micro-empty-create">Crear microciclo</button></div>';
    qs("#micro-empty-create")?.addEventListener("click", () => showMicroBuilder());
    return;
  }
  microListContainer.innerHTML = lista
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .map(
      (micro) => `
      <article class="micro-card" data-id="${micro.id}">
        <div class="d-flex justify-content-between align-items-start gap-2 micro-card__header">
          <div>
            <h4 class="mb-1">${micro.nombre}</h4>
            <p class="text-muted small mb-0">${micro.objetivo || "Sin objetivo específico"}</p>
          </div>
          <div class="micro-card__actions">
            <button class="btn btn-outline-primary btn-sm" data-action="edit-micro" data-id="${micro.id}">Editar</button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete-micro" data-id="${micro.id}">Eliminar</button>
          </div>
        </div>
        <hr class="my-3">
        ${microResumenSemana(micro)}
      </article>`
    )
    .join("");
}

function mesoResumenSemanas(meso) {
  const plan = (meso?.plan_micros || []).sort(
    (a, b) => Number(a.orden || 0) - Number(b.orden || 0)
  );
  if (!plan.length) {
    return '<p class="text-muted small mb-0">Todavía no has asignado microciclos a este meso.</p>';
  }
  return `
    <div class="meso-card__weeks">
      ${plan
        .map(
          (item) => `
          <div class="meso-card__week-chip">
            <span class="meso-card__week-label">Semana ${item.orden || "-"}</span>
            <p class="mb-0">${item.micro_nombre || "Microciclo"}</p>
            <small class="text-muted">${item.micro_objetivo || "Sin objetivo"}</small>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function renderMesoList() {
  if (!mesoListContainer) return;
  const lista = state.mesociclos || [];
  if (!lista.length) {
    mesoListContainer.innerHTML =
      '<div class="app-card text-center py-4"><p class="mb-1 fw-semibold">No tienes mesociclos creados aún</p><p class="text-muted small mb-3">Crea un nuevo mesociclo y compónlo con tus microciclos tipo.</p><button class="btn btn-primary btn-sm" id="meso-empty-create">Crear mesociclo</button></div>';
    qs("#meso-empty-create")?.addEventListener("click", () => showMesoBuilder());
    return;
  }
  mesoListContainer.innerHTML = lista
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .map(
      (meso) => `
      <article class="meso-card" data-id="${meso.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h4 class="mb-1">${meso.nombre}</h4>
            <p class="text-muted small mb-0">${meso.objetivo || "Sin objetivo"}</p>
          </div>
          <div class="meso-card__actions">
            <button class="btn btn-outline-primary btn-sm" data-action="edit-meso" data-id="${meso.id}">Editar</button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete-meso" data-id="${meso.id}">Eliminar</button>
          </div>
        </div>
        <hr class="my-3">
        ${mesoResumenSemanas(meso)}
      </article>`
    )
    .join("");
}

function macroResumenBloques(macro) {
  const plan = (macro?.plan_mesos || []).sort(
    (a, b) => Number(a.orden || 0) - Number(b.orden || 0)
  );
  if (!plan.length) {
    return '<p class="text-muted small mb-0">Aún no has asignado mesociclos a este bloque.</p>';
  }
  return `
    <div class="macro-card__blocks">
      ${plan
        .map(
          (item) => `
          <div class="macro-card__block-chip">
            <span class="macro-card__block-label">Bloque ${item.orden || "-"}</span>
            <p class="mb-0">${item.meso_nombre || "Mesociclo"}</p>
            <small class="text-muted">${item.meso_objetivo || "Sin objetivo"}</small>
          </div>`
        )
        .join("")}
    </div>
  `;
}

function renderMacroList() {
  if (!macroListContainer) return;
  const lista = state.macros || [];
  if (!lista.length) {
    macroListContainer.innerHTML =
      '<div class="app-card text-center py-4"><p class="mb-1 fw-semibold">Todavía no tienes macrociclos</p><p class="text-muted small mb-3">Utiliza el botón "Nuevo macrociclo" para crear un bloque largo.</p><button class="btn btn-primary btn-sm" id="macro-empty-create">Crear macrociclo</button></div>';
    qs("#macro-empty-create")?.addEventListener("click", () => showMacroBuilder());
    return;
  }
  macroListContainer.innerHTML = lista
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .map(
      (macro) => `
      <article class="macro-card" data-id="${macro.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h4 class="mb-1">${macro.nombre}</h4>
            <p class="text-muted small mb-0">${macro.objetivo_general || "Sin objetivo"}</p>
          </div>
          <div class="macro-card__actions">
            <button class="btn btn-outline-primary btn-sm" data-action="edit-macro" data-id="${macro.id}">Editar</button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete-macro" data-id="${macro.id}">Eliminar</button>
          </div>
        </div>
        <hr class="my-3">
        ${macroResumenBloques(macro)}
      </article>`
    )
    .join("");
}

function populateMacroForm(macro = null) {
  const form = qs("#form-macro");
  if (!form) return;
  form.reset();
  if (macroIdField) {
    macroIdField.value = macro?.id ? String(macro.id) : "";
  }
  const nombreInput = form.querySelector('[name="nombre"]');
  const objetivoInput = form.querySelector('[name="objetivo_general"]');
  if (nombreInput) nombreInput.value = macro?.nombre || "";
  if (objetivoInput) objetivoInput.value = macro?.objetivo_general || "";
}

function showMacroList() {
  if (macroListView) macroListView.classList.remove("d-none");
  if (macroBuilderView) macroBuilderView.classList.add("d-none");
  state.macroEditandoId = null;
  state.macroBloquesActivos = 0;
  populateMacroForm(null);
  const grid = qs("#macro-block-grid");
  if (grid) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Selecciona un macrociclo para editar su secuencia de mesociclos.</p>';
  }
}

function showMacroBuilder(macroId = null) {
  if (macroListView) macroListView.classList.add("d-none");
  if (macroBuilderView) macroBuilderView.classList.remove("d-none");
  const macro = macroId ? getMacroById(macroId) : null;
  if (macroId && !macro) {
    toast("No se pudo cargar el macrociclo seleccionado", "danger");
    showMacroList();
    return;
  }
  state.macroEditandoId = macro ? Number(macro.id) : null;
  if (macro) {
    if (macroBuilderTitle) macroBuilderTitle.textContent = `Editando ${macro.nombre}`;
    populateMacroForm(macro);
    state.macroBloquesActivos = Math.max(
      macro.plan_mesos?.length || 0,
      DEFAULT_BLOQUES_MACRO
    );
  } else {
    if (macroBuilderTitle) macroBuilderTitle.textContent = "Nuevo macrociclo";
    populateMacroForm(null);
    state.macroBloquesActivos = DEFAULT_BLOQUES_MACRO;
  }
  renderMacroBuilderGrid();
}

function renderMacroBuilderGrid() {
  const grid = qs("#macro-block-grid");
  if (!grid) return;
  const macroId = state.macroEditandoId;
  if (!macroId) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Guarda o selecciona un macrociclo para comenzar a planificar su secuencia.</p>';
    return;
  }
  const macro = getMacroById(macroId);
  if (!macro) {
    grid.innerHTML = '<p class="text-muted mb-0">Este macrociclo ya no existe.</p>';
    return;
  }
  const plan = (macro.plan_mesos || []).reduce((acc, item) => {
    acc[Number(item.orden) || 0] = item;
    return acc;
  }, {});
  const bloques = Math.max(state.macroBloquesActivos || DEFAULT_BLOQUES_MACRO, DEFAULT_BLOQUES_MACRO);
  const slots = Array.from({ length: Math.min(bloques, MAX_BLOQUES_MACRO) }, (_, idx) => {
    const bloque = idx + 1;
    const registro = plan[bloque];
    const filled = Boolean(registro);
    return `
      <div class="macro-slot ${filled ? "macro-slot--filled" : ""}" data-macro="${macro.id}" data-orden="${bloque}" data-relacion="${registro?.id || ""}">
        <div class="macro-slot__header">
          <p class="mb-0 fw-semibold">Bloque ${bloque}</p>
          ${
            filled
              ? `<button type="button" class="btn btn-sm btn-outline-danger btn-macro-slot-remove" data-macro="${macro.id}" data-detalle="${registro.id}">Quitar</button>`
              : ""
          }
        </div>
        ${
          filled
            ? `<div class="macro-slot__body">
                <strong>${registro.meso_nombre || "Mesociclo"}</strong>
                <p class="text-muted small mb-0">${registro.meso_objetivo || "Sin objetivo"}</p>
              </div>`
            : '<p class="macro-slot__placeholder mb-0">Arrastra un mesociclo para ocupar este bloque.</p>'
        }
      </div>
    `;
  }).join("");
  grid.innerHTML = slots;
  grid.querySelectorAll(".macro-slot").forEach(setupMacroSlotDnD);
}

function addMacroBlock() {
  const nuevo = (state.macroBloquesActivos || DEFAULT_BLOQUES_MACRO) + 1;
  if (nuevo > MAX_BLOQUES_MACRO) return;
  state.macroBloquesActivos = nuevo;
  renderMacroBuilderGrid();
}

function populateMesoForm(meso = null) {
  const form = qs("#form-meso");
  if (!form) return;
  form.reset();
  if (mesoIdField) {
    mesoIdField.value = meso?.id ? String(meso.id) : "";
  }
  const nombreInput = form.querySelector('[name="nombre"]');
  const objetivoInput = form.querySelector('[name="objetivo"]');
  if (nombreInput) nombreInput.value = meso?.nombre || "";
  if (objetivoInput) objetivoInput.value = meso?.objetivo || "";
}

function showMesoList() {
  if (mesoListView) mesoListView.classList.remove("d-none");
  if (mesoBuilderView) mesoBuilderView.classList.add("d-none");
  state.mesoEditandoId = null;
  state.mesoSemanasActivas = 0;
  populateMesoForm(null);
  const grid = qs("#meso-weeks-grid");
  if (grid) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Selecciona un mesociclo para ver y editar su secuencia de semanas.</p>';
  }
}

function showMesoBuilder(mesoId = null) {
  if (mesoListView) mesoListView.classList.add("d-none");
  if (mesoBuilderView) mesoBuilderView.classList.remove("d-none");
  const meso = mesoId ? getMesoById(mesoId) : null;
  if (mesoId && !meso) {
    toast("No se pudo cargar el mesociclo seleccionado", "danger");
    showMesoList();
    return;
  }
  state.mesoEditandoId = meso ? Number(meso.id) : null;
  if (meso) {
    if (mesoBuilderTitle) mesoBuilderTitle.textContent = `Editando ${meso.nombre}`;
    populateMesoForm(meso);
    state.mesoSemanasActivas = Math.max(meso.plan_micros?.length || 0, DEFAULT_SEMANAS_MESO);
  } else {
    if (mesoBuilderTitle) mesoBuilderTitle.textContent = "Nuevo mesociclo";
    populateMesoForm(null);
    state.mesoSemanasActivas = DEFAULT_SEMANAS_MESO;
  }
  renderMesoBuilderGrid();
}

function renderMesoBuilderGrid() {
  const grid = qs("#meso-weeks-grid");
  if (!grid) return;
  const mesoId = state.mesoEditandoId;
  if (!mesoId) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Guarda o selecciona un mesociclo para comenzar a planificar sus semanas.</p>';
    return;
  }
  const meso = getMesoById(mesoId);
  if (!meso) {
    grid.innerHTML = '<p class="text-muted mb-0">Este mesociclo ya no existe.</p>';
    return;
  }
  const plan = (meso.plan_micros || []).reduce((acc, item) => {
    acc[Number(item.orden) || 0] = item;
    return acc;
  }, {});
  const semanas = Math.max(state.mesoSemanasActivas || DEFAULT_SEMANAS_MESO, DEFAULT_SEMANAS_MESO);
  const slots = Array.from({ length: Math.min(semanas, MAX_SEMANAS_MESO) }, (_, idx) => {
    const semana = idx + 1;
    const registro = plan[semana];
    const filled = Boolean(registro);
    return `
      <div class="meso-slot ${filled ? "meso-slot--filled" : ""}" data-meso="${meso.id}" data-orden="${semana}" data-relacion="${registro?.id || ""}">
        <div class="meso-slot__header">
          <p class="mb-0 fw-semibold">Semana ${semana}</p>
          ${
            filled
              ? `<button type="button" class="btn btn-sm btn-outline-danger btn-meso-slot-remove" data-meso="${meso.id}" data-detalle="${registro.id}">Quitar</button>`
              : ""
          }
        </div>
        ${
          filled
            ? `<div class="meso-slot__body">
                <strong>${registro.micro_nombre || "Microciclo"}</strong>
                <p class="text-muted small mb-0">${registro.micro_objetivo || "Sin objetivo definido"}</p>
              </div>`
            : '<p class="meso-slot__placeholder mb-0">Arrastra un microciclo para asignarlo a esta semana.</p>'
        }
      </div>
    `;
  }).join("");
  grid.innerHTML = slots;
  grid.querySelectorAll(".meso-slot").forEach(setupMesoSlotDnD);
}

function addMesoWeek() {
  const nueva = (state.mesoSemanasActivas || DEFAULT_SEMANAS_MESO) + 1;
  if (nueva > MAX_SEMANAS_MESO) return;
  state.mesoSemanasActivas = nueva;
  renderMesoBuilderGrid();
}

function populateMicroForm(micro = null) {
  const form = qs("#form-micro");
  if (!form) return;
  form.reset();
  const nombreInput = form.querySelector('[name="nombre"]');
  const objetivoInput = form.querySelector('[name="objetivo"]');
  if (nombreInput) nombreInput.value = micro?.nombre || "";
  if (objetivoInput) objetivoInput.value = micro?.objetivo || "";
  if (microIdField) {
    microIdField.value = micro?.id ? String(micro.id) : "";
  }
}

function showMicroList() {
  if (microListView) microListView.classList.remove("d-none");
  if (microBuilderView) microBuilderView.classList.add("d-none");
  state.microEditandoId = null;
  state.sesionesActivas = {};
  populateMicroForm(null);
  const grid = qs("#micro-week-grid");
  if (grid) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Selecciona un microciclo para revisar su semana estándar.</p>';
  }
}

function showMicroBuilder(microId = null) {
  if (microListView) microListView.classList.add("d-none");
  if (microBuilderView) microBuilderView.classList.remove("d-none");

  const micro = microId ? getMicroById(microId) : null;
  if (microId && !micro) {
    toast("No se pudo cargar el microciclo seleccionado", "danger");
    showMicroList();
    return;
  }

  state.microEditandoId = micro ? Number(micro.id) : null;
  if (micro) {
    if (microBuilderTitle) microBuilderTitle.textContent = `Editando ${micro.nombre}`;
    populateMicroForm(micro);
    prepareSesionesActivas(micro);
  } else {
    if (microBuilderTitle) microBuilderTitle.textContent = "Nuevo microciclo";
    populateMicroForm(null);
    state.sesionesActivas = {};
  }
  renderMicroBuilderGrid();
}

function labelSesion(sesion) {
  const found = SESIONES_DIA.find((s) => s.id === Number(sesion));
  return found ? found.label : `Sesión ${sesion}`;
}

function renderMicroBuilderGrid() {
  const grid = qs("#micro-week-grid");
  if (!grid) return;
  const microId = state.microEditandoId;
  if (!microId) {
    grid.innerHTML =
      '<p class="text-muted mb-0">Guarda o selecciona un microciclo para comenzar a planificar su semana estándar.</p>';
    return;
  }
  const micro = getMicroById(microId);
  if (!micro) {
    grid.innerHTML = '<p class="text-muted mb-0">Este microciclo ya no existe.</p>';
    return;
  }

  if (!Object.keys(state.sesionesActivas || {}).length) {
    prepareSesionesActivas(micro);
  }

  const mapa = {};
  (micro.entrenamientos || []).forEach((item) => {
    const dia = Number(item.dia_relativo) || 0;
    const sesion = Number(item.sesion_indice) || 1;
    if (!mapa[dia]) mapa[dia] = {};
    mapa[dia][sesion] = item;
    state.sesionesActivas[dia] = Math.max(state.sesionesActivas[dia] || 1, sesion);
  });

  const diaHtml = DIAS_SEMANA.map((dia) => {
    const sesionesCount = Math.max(state.sesionesActivas[dia.id] || 1, 1);
    const slots = Array.from({ length: sesionesCount }, (_, idx) => {
      const sesion = idx + 1;
      const registro = mapa[dia.id]?.[sesion];
      const filled = Boolean(registro);
      const isRest =
        filled &&
        (!registro.entrenamiento_id ||
          (registro.notas || "").toLowerCase().includes("descanso"));
      const entrenamientoNombre = isRest
        ? "Descanso"
        : registro?.entrenamiento_nombre || "Entrenamiento";
      const notas =
        registro?.notas && !isRest
          ? `<p class="small text-muted mb-2">${registro.notas}</p>`
          : "";
      return `
        <div class="micro-slot ${filled ? "filled" : "empty"} ${
        isRest ? "micro-slot--rest" : ""
      }"
          data-dia="${dia.id}"
          data-sesion="${sesion}"
          data-micro="${micro.id}"
          data-registro="${registro?.id || ""}"
          data-entrenamiento="${registro?.entrenamiento_id || ""}">
          <div class="micro-slot__label">${labelSesion(sesion)}</div>
          ${
            filled
              ? `<p class="micro-slot__training">${entrenamientoNombre}</p>${notas}`
              : `<p class="micro-slot__placeholder mb-2">Arrastra un entrenamiento o marca descanso</p>`
          }
          <div class="micro-slot__actions">
            <button class="btn btn-sm btn-outline-secondary btn-slot-rest"
              data-micro="${micro.id}"
              data-dia="${dia.id}"
              data-sesion="${sesion}"
              data-registro="${registro?.id || ""}">
              Descanso
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
    const addButton =
      sesionesCount < MAX_SESIONES_DIA
        ? `<button class="btn btn-link btn-add-session" data-dia="${dia.id}">+ Añadir sesión</button>`
        : "";
    return `
      <div class="micro-day-card">
        <p class="micro-day-card__title">${dia.label}</p>
        ${slots}
        ${addButton}
      </div>
    `;
  }).join("");

  grid.innerHTML = diaHtml;
  grid.querySelectorAll(".micro-slot").forEach(setupSlotDnD);
}

function setupSlotDnD(slot) {
  slot.addEventListener("dragover", (e) => {
    if (
      !state.dragPayload ||
      (state.dragPayload.tipo !== DRAG_TYPES.TRAINING &&
        state.dragPayload.tipo !== DRAG_TYPES.REST)
    ) {
      return;
    }
    e.preventDefault();
    slot.classList.add("micro-slot--dropping");
  });
  slot.addEventListener("dragleave", () => {
    slot.classList.remove("micro-slot--dropping");
  });
  slot.addEventListener("drop", (e) => {
    if (
      !state.dragPayload ||
      (state.dragPayload.tipo !== DRAG_TYPES.TRAINING &&
        state.dragPayload.tipo !== DRAG_TYPES.REST)
    ) {
      return;
    }
    e.preventDefault();
    slot.classList.remove("micro-slot--dropping");
    const payload = state.dragPayload;
    state.dragPayload = null;
    if (payload.tipo === DRAG_TYPES.REST) {
      asignarDescansoEnSlot(slot.dataset);
    } else if (payload.entrenamientoId) {
      asignarEntrenamientoEnSlot(slot.dataset, payload.entrenamientoId);
    }
  });
}

function setupMacroSlotDnD(slot) {
  slot.addEventListener("dragover", (e) => {
    if (!state.dragPayload || state.dragPayload.tipo !== DRAG_TYPES.MESO) return;
    e.preventDefault();
    slot.classList.add("macro-slot--dropping");
  });
  slot.addEventListener("dragleave", () => {
    slot.classList.remove("macro-slot--dropping");
  });
  slot.addEventListener("drop", (e) => {
    if (!state.dragPayload || state.dragPayload.tipo !== DRAG_TYPES.MESO) return;
    e.preventDefault();
    slot.classList.remove("macro-slot--dropping");
    const payload = state.dragPayload;
    state.dragPayload = null;
    if (payload.mesoId) {
      asignarMesoEnBloque(slot.dataset, payload.mesoId);
    }
  });
}

function setupMesoSlotDnD(slot) {
  slot.addEventListener("dragover", (e) => {
    if (!state.dragPayload || state.dragPayload.tipo !== DRAG_TYPES.MICRO) {
      return;
    }
    e.preventDefault();
    slot.classList.add("meso-slot--dropping");
  });
  slot.addEventListener("dragleave", () => {
    slot.classList.remove("meso-slot--dropping");
  });
  slot.addEventListener("drop", (e) => {
    if (!state.dragPayload || state.dragPayload.tipo !== DRAG_TYPES.MICRO) {
      return;
    }
    e.preventDefault();
    slot.classList.remove("meso-slot--dropping");
    const payload = state.dragPayload;
    state.dragPayload = null;
    if (payload.microId) {
      asignarMicroEnSemana(slot.dataset, payload.microId);
    }
  });
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
  const grid = qs("#micro-week-grid");
  grid?.addEventListener("click", (e) => {
    const restBtn = e.target.closest(".btn-slot-rest");
    if (restBtn) {
      asignarDescansoEnSlot(restBtn.dataset);
      return;
    }
    const clearBtn = e.target.closest(".btn-slot-clear");
    if (clearBtn) {
      eliminarSlot(clearBtn.dataset);
      return;
    }
    const addBtn = e.target.closest(".btn-add-session");
    if (addBtn) {
      addSessionForDay(addBtn.dataset.dia);
    }
  });
}

function setupMesoBuilder() {
  const grid = qs("#meso-weeks-grid");
  grid?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-meso-slot-remove");
    if (removeBtn) {
      eliminarMicroSemana(removeBtn.dataset);
    }
  });
  mesoAddWeekBtn?.addEventListener("click", () => addMesoWeek());
}

function setupMacroBuilder() {
  const grid = qs("#macro-block-grid");
  grid?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-macro-slot-remove");
    if (removeBtn) {
      eliminarMesoDelMacro(removeBtn.dataset);
    }
  });
  macroAddBlockBtn?.addEventListener("click", () => addMacroBlock());
}

function setupBibliotecaHandlers() {
  const input = qs("#input-buscar-entrenamiento");
  input?.addEventListener("input", (e) => {
    state.filtroBiblioteca = e.target.value;
    renderBibliotecaEntrenamientos();
  });

  qs("#btn-limpiar-entrenamiento")?.addEventListener("click", () => {
    state.filtroBiblioteca = "";
    state.entrenamientoActivoId = null;
    if (input) input.value = "";
    renderBibliotecaEntrenamientos();
  });

  qs("#biblioteca-entrenamientos")?.addEventListener("click", (e) => {
    const item = e.target.closest(".micro-library__item[data-entrenamiento-id]");
    if (!item) return;
    const id = Number(item.dataset.entrenamientoId);
    state.entrenamientoActivoId =
      Number(state.entrenamientoActivoId) === id ? null : id;
    renderBibliotecaEntrenamientos();
  });

  const mesoSearch = qs("#meso-micro-search");
  mesoSearch?.addEventListener("input", (e) => {
    state.filtroMicros = e.target.value;
    renderBibliotecaMicros();
  });

  qs("#meso-micro-clear")?.addEventListener("click", () => {
    state.filtroMicros = "";
    if (mesoSearch) mesoSearch.value = "";
    renderBibliotecaMicros();
  });

  const macroSearch = qs("#macro-meso-search");
  macroSearch?.addEventListener("input", (e) => {
    state.filtroMesos = e.target.value;
    renderBibliotecaMesos();
  });

  qs("#macro-meso-clear")?.addEventListener("click", () => {
    state.filtroMesos = "";
    if (macroSearch) macroSearch.value = "";
    renderBibliotecaMesos();
  });
}

function setupMicroListInteractions() {
  microCreateBtn?.addEventListener("click", () => showMicroBuilder());
  microBackBtn?.addEventListener("click", () => showMicroList());

  microListContainer?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-action='edit-micro']");
    if (editBtn) {
      showMicroBuilder(Number(editBtn.dataset.id));
      return;
    }
    const deleteBtn = e.target.closest("[data-action='delete-micro']");
    if (deleteBtn) {
      eliminarMicro(deleteBtn.dataset.id);
      return;
    }
    const card = e.target.closest(".micro-card[data-id]");
    if (card && !e.target.closest(".micro-card__actions")) {
      showMicroBuilder(Number(card.dataset.id));
    }
  });
}

function setupMacroListInteractions() {
  macroCreateBtn?.addEventListener("click", () => showMacroBuilder());
  macroBackBtn?.addEventListener("click", () => showMacroList());

  macroListContainer?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-action='edit-macro']");
    if (editBtn) {
      showMacroBuilder(Number(editBtn.dataset.id));
      return;
    }
    const deleteBtn = e.target.closest("[data-action='delete-macro']");
    if (deleteBtn) {
      eliminarMacro(deleteBtn.dataset.id);
      return;
    }
    const card = e.target.closest(".macro-card[data-id]");
    if (card && !e.target.closest(".macro-card__actions")) {
      showMacroBuilder(Number(card.dataset.id));
    }
  });
}

function setupMesoListInteractions() {
  mesoCreateBtn?.addEventListener("click", () => showMesoBuilder());
  mesoBackBtn?.addEventListener("click", () => showMesoList());

  mesoListContainer?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-action='edit-meso']");
    if (editBtn) {
      showMesoBuilder(Number(editBtn.dataset.id));
      return;
    }
    const deleteBtn = e.target.closest("[data-action='delete-meso']");
    if (deleteBtn) {
      eliminarMeso(deleteBtn.dataset.id);
      return;
    }
    const card = e.target.closest(".meso-card[data-id]");
    if (card && !e.target.closest(".meso-card__actions")) {
      showMesoBuilder(Number(card.dataset.id));
    }
  });
}

async function asignarEntrenamientoEnSlot(dataset, entrenamientoId) {
  const microId = Number(dataset?.micro);
  if (!microId || !entrenamientoId) return;
  const dia = dataset.dia ? Number(dataset.dia) : null;
  const sesion = dataset.sesion ? Number(dataset.sesion) : 1;
  try {
    if (dataset.registro) {
      await apiFetch(`/ciclos/micro/${microId}/entrenamientos/${dataset.registro}`, {
        method: "DELETE",
      });
    }
    await apiFetch(`/ciclos/micro/${microId}/entrenamientos`, {
      method: "POST",
      body: JSON.stringify({
        entrenamiento_id: entrenamientoId,
        dia_relativo: dia,
        sesion_indice: sesion,
        notas: null,
        orden: dia && sesion ? `${dia}${sesion}` : null,
      }),
    });
    toast("Entrenamiento asignado");
    await cargarCiclos();
    showMicroBuilder(microId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function asignarDescansoEnSlot(dataset) {
  const microId = Number(dataset?.micro);
  if (!microId) return;
  const dia = dataset.dia ? Number(dataset.dia) : null;
  const sesion = dataset.sesion ? Number(dataset.sesion) : 1;
  try {
    if (dataset.registro) {
      await apiFetch(`/ciclos/micro/${microId}/entrenamientos/${dataset.registro}`, {
        method: "DELETE",
      });
    }
    await apiFetch(`/ciclos/micro/${microId}/entrenamientos`, {
      method: "POST",
      body: JSON.stringify({
        entrenamiento_id: null,
        dia_relativo: dia,
        sesion_indice: sesion,
        notas: "DESCANSO",
        orden: dia && sesion ? `${dia}${sesion}` : null,
      }),
    });
    toast("Descanso asignado");
    await cargarCiclos();
    showMicroBuilder(microId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarSlot(dataset) {
  if (!dataset?.registro) return;
  if (!confirm("¿Eliminar este bloque del día?")) return;
  try {
    await apiFetch(`/ciclos/micro/${dataset.micro}/entrenamientos/${dataset.registro}`, {
      method: "DELETE",
    });
    toast("Bloque eliminado");
    await cargarCiclos();
    if (state.microEditandoId) {
      showMicroBuilder(state.microEditandoId);
    }
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function asignarMesoEnBloque(dataset, mesoId) {
  const macroId = Number(dataset?.macro);
  if (!macroId || !mesoId) return;
  const orden = dataset?.orden ? Number(dataset.orden) : null;
  try {
    if (dataset.relacion) {
      await apiFetch(`/ciclos/macro/${macroId}/mesociclos/${dataset.relacion}`, {
        method: "DELETE",
      });
    }
    await apiFetch(`/ciclos/macro/${macroId}/mesociclos`, {
      method: "POST",
      body: JSON.stringify({
        mesociclo_id: mesoId,
        orden,
      }),
    });
    toast("Mesociclo asignado");
    await cargarCiclos();
    showMacroBuilder(macroId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarMesoDelMacro(dataset) {
  const macroId = Number(dataset?.macro);
  const detalleId = dataset?.detalle;
  if (!macroId || !detalleId) return;
  if (!confirm("¿Quitar este mesociclo del macrociclo?")) return;
  try {
    await apiFetch(`/ciclos/macro/${macroId}/mesociclos/${detalleId}`, {
      method: "DELETE",
    });
    toast("Bloque liberado");
    await cargarCiclos();
    showMacroBuilder(macroId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function asignarMicroEnSemana(dataset, microId) {
  const mesoId = Number(dataset?.meso);
  if (!mesoId || !microId) return;
  const orden = dataset?.orden ? Number(dataset.orden) : null;
  try {
    if (dataset.relacion) {
      await apiFetch(`/ciclos/meso/${mesoId}/microciclos/${dataset.relacion}`, {
        method: "DELETE",
      });
    }
    await apiFetch(`/ciclos/meso/${mesoId}/microciclos`, {
      method: "POST",
      body: JSON.stringify({
        microciclo_id: microId,
        orden,
      }),
    });
    toast("Microciclo añadido a la semana");
    await cargarCiclos();
    showMesoBuilder(mesoId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarMicroSemana(dataset) {
  const mesoId = Number(dataset?.meso);
  const detalleId = dataset?.detalle;
  if (!mesoId || !detalleId) return;
  if (!confirm("¿Quitar este microciclo del meso?")) return;
  try {
    await apiFetch(`/ciclos/meso/${mesoId}/microciclos/${detalleId}`, {
      method: "DELETE",
    });
    toast("Semana liberada");
    await cargarCiclos();
    showMesoBuilder(mesoId);
  } catch (err) {
    toast(err.message, "danger");
  }
}

function setupForms() {
  const formMacro = qs("#form-macro");
  formMacro?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(formMacro).entries());
    const payload = {
      nombre: (data.nombre || "").trim(),
      objetivo_general: (data.objetivo_general || "").trim() || null,
    };
    if (!payload.nombre) {
      toast("El nombre del macrociclo es obligatorio", "warning");
      return;
    }
    const macroId = data.macro_id || state.macroEditandoId;
    try {
      if (macroId) {
        await apiFetch(`/macrociclos/${macroId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("Macrociclo actualizado");
        await cargarCiclos();
        showMacroBuilder(macroId);
      } else {
        const resp = await apiFetch("/macrociclos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const nuevoId = resp?.id;
        toast("Macrociclo creado");
        await cargarCiclos();
        if (nuevoId) {
          showMacroBuilder(nuevoId);
        }
      }
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  const formMeso = qs("#form-meso");
  formMeso?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(formMeso).entries());
    const payload = {
      nombre: (data.nombre || "").trim(),
      objetivo: (data.objetivo || "").trim() || null,
    };
    if (!payload.nombre) {
      toast("El nombre del mesociclo es obligatorio", "warning");
      return;
    }
    const mesoId = data.meso_id || state.mesoEditandoId;
    try {
      if (mesoId) {
        await apiFetch(`/mesociclos/${mesoId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("Mesociclo actualizado");
        await cargarCiclos();
        showMesoBuilder(mesoId);
      } else {
        const resp = await apiFetch("/mesociclos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("Mesociclo creado");
        await cargarCiclos();
        const nuevoId = resp?.id;
        if (nuevoId) {
          showMesoBuilder(nuevoId);
        }
      }
    } catch (err) {
      toast(err.message, "danger");
    }
  });

  const formMicro = qs("#form-micro");
  formMicro?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(formMicro).entries());
    const payload = {
      nombre: (formData.nombre || "").trim(),
      objetivo: (formData.objetivo || "").trim() || null,
    };
    if (!payload.nombre) {
      toast("El nombre del microciclo es obligatorio", "warning");
      return;
    }
    const microId = formData.micro_id || state.microEditandoId;
    try {
      if (microId) {
        await apiFetch(`/microciclos/${microId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("Microciclo actualizado");
        await cargarCiclos();
        showMicroBuilder(microId);
      } else {
        const resp = await apiFetch("/microciclos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const nuevoId = resp?.id;
        toast("Microciclo creado");
        await cargarCiclos();
        showMicroBuilder(nuevoId);
      }
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

async function eliminarMacro(id) {
  if (!id) return;
  if (!confirm("¿Eliminar este macrociclo y su planificación?")) return;
  try {
    await apiFetch(`/macrociclos/${id}`, { method: "DELETE" });
    toast("Macrociclo eliminado");
    if (Number(state.macroEditandoId) === Number(id)) {
      showMacroList();
    }
    await cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarMeso(id) {
  if (!id) return;
  if (!confirm("¿Eliminar este mesociclo y su planificación?")) return;
  try {
    await apiFetch(`/mesociclos/${id}`, { method: "DELETE" });
    toast("Mesociclo eliminado");
    if (Number(state.mesoEditandoId) === Number(id)) {
      showMesoList();
    }
    await cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function eliminarMicro(id) {
  if (!id) return;
  if (!confirm("¿Eliminar este microciclo y su planificación semanal?")) return;
  try {
    await apiFetch(`/microciclos/${id}`, { method: "DELETE" });
    toast("Microciclo eliminado");
    if (Number(state.microEditandoId) === Number(id)) {
      showMicroList();
    }
    await cargarCiclos();
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function init() {
  setupTabs();
  await cargarCatalogos();
  setupForms();
  setupModalHandlers();
  setupMicroBuilder();
  setupMesoBuilder();
  setupMacroBuilder();
  setupMicroListInteractions();
  setupMesoListInteractions();
  setupMacroListInteractions();
  setupBibliotecaHandlers();
  cargarCiclos();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init };
