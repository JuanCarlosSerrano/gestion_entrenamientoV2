// === CONFIG BÁSICA ===
const API_BASE = window.location.origin;

let asignadoId = null;
let entrenamiento = null;

// Pasos tal y como vienen del backend (planos)
let pasosFlat = [];

// Pasos transformados a árbol (repeat con subpasos) solo para la UI
let pasosTree = [];

// === HELPERS ===
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const STEP_TYPES = [
  { value: "warmup", label: "Calentamiento" },
  { value: "interval", label: "Serie" },
  { value: "rest", label: "Recuperación" },
  { value: "repeat", label: "Bloque repetido" },
  { value: "cooldown", label: "Enfriamiento" },
  { value: "custom", label: "Libre" }
];

const UNIDADES = ["", "m", "km", "s", "min"];
const ZONAS = ["", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];

function getStepLabel(tipo) {
  const found = STEP_TYPES.find((t) => t.value === tipo);
  return found ? found.label : "Bloque";
}

function getBlockClass(tipo) {
  return `builder-step-card--${tipo || "custom"}`;
}

// === CARGA INICIAL ===
document.addEventListener("DOMContentLoaded", async () => {
  asignadoId = getParam("asignadoId");
  if (!asignadoId) {
    alert("No se proporcionó un ID de entrenamiento asignado");
    return;
  }

  await cargarEntrenamiento();
  pintarEntrenamiento();

  const btnAdd = document.getElementById("btn-add-bloque");
  if (btnAdd) btnAdd.addEventListener("click", agregarBloqueRaiz);

  const btnGuardar = document.getElementById("btn-guardar");
  if (btnGuardar) btnGuardar.addEventListener("click", guardarCambios);

  const btnVolver = document.getElementById("btn-volver");
  if (btnVolver) btnVolver.addEventListener("click", () => window.history.back());

  const btnDescartar = document.getElementById("btn-descartar");
  if (btnDescartar) {
    btnDescartar.addEventListener("click", async () => {
      // recargamos de BD y repintamos → adiós cambios
      await cargarEntrenamiento();
      pintarEntrenamiento();
    });
  }
});

function descartarCambios() {
  if (!confirm("¿Descartar todos los cambios no guardados?")) return;

  // Recargar desde servidor el estado original
  cargarEntrenamiento().then(() => {
    pintarEntrenamiento();
  });
}

// === API: Cargar entrenamiento + detalles ===
async function cargarEntrenamiento() {
  const res = await fetch(`${API_BASE}/entrenamientos_asignados/uno/${asignadoId}`, {
    credentials: "include"
  });
  entrenamiento = await res.json();

  const resPasos = await fetch(
    `${API_BASE}/entrenamientos_asignados/${asignadoId}/detalle`,
    { credentials: "include" }
  );
  const data = await resPasos.json();

  // El endpoint puede devolver directamente array o { pasos: [...] }
  pasosFlat = Array.isArray(data) ? data : Array.isArray(data.pasos) ? data.pasos : [];

  // Construimos versión en árbol para el editor
  pasosTree = buildHierarchyFromFlat(pasosFlat);
}

// Agrupa repeat + siguiente interval como subpaso
// Agrupa los pasos usando parent_id => repeat con todos sus hijos
function buildHierarchyFromFlat(list) {
  if (!Array.isArray(list)) return [];

  // Clonamos y preparamos nodo -> subpasos
  const byId = {};
  list.forEach((raw) => {
    const node = { ...raw };
    node.subpasos = [];
    byId[node.id] = node;
  });

  const roots = [];

  list.forEach((raw) => {
    const node = byId[raw.id];
    const parentId = raw.parent_id;

    if (parentId && byId[parentId]) {
      byId[parentId].subpasos.push(node);
    } else {
      roots.push(node);
    }
  });

  // Orden por 'orden' tanto en raíces como en hijos
  const sortByOrden = (a, b) => (a.orden || 0) - (b.orden || 0);
  roots.sort(sortByOrden);
  roots.forEach((n) => n.subpasos.sort(sortByOrden));

  return roots;
}



// === PINTAR ENTRENAMIENTO EN PANTALLA ===
function pintarEntrenamiento() {
  document.getElementById("entreno-nombre").textContent = entrenamiento.nombre;
  document.getElementById("entreno-fecha").textContent =
    new Date(entrenamiento.fecha).toLocaleDateString();

  const cont = document.getElementById("builder-steps");
  cont.innerHTML = "";

  pasosTree.forEach((p) => {
    const card = crearStepCardEditable(p);
    cont.appendChild(card);
  });
}

// === CREAR CARD PARA UN STEP (RAÍZ O SUBPASO) ===
function crearStepCardEditable(paso) {
  const tipo = paso.tipo_paso || "custom";

  const card = document.createElement("div");
  card.className = `builder-step-card ${getBlockClass(tipo)}`;
  card.dataset.id =
    paso.id || `new_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  card.dataset.tipo = tipo;

  // HEADER
  const header = document.createElement("div");
  header.className = "builder-step-header";

  const title = document.createElement("strong");
  title.textContent = getStepLabel(tipo);
  header.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "builder-step-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.title = "Eliminar";
  deleteBtn.textContent = "✕";
  deleteBtn.addEventListener("click", () => {
    card.remove();
  });

  actions.appendChild(deleteBtn);
  header.appendChild(actions);
  card.appendChild(header);

  // BODY
  const body = document.createElement("div");
  body.className = "builder-step-body";

  // Fila 1: tipo + repeticiones
  const row1 = document.createElement("div");
  row1.className = "row g-2 builder-row";

  // Tipo de bloque
  const colTipo = document.createElement("div");
  colTipo.className = "mb-3 col-md-6";
  colTipo.innerHTML = `
    <label class="form-label">Tipo de bloque</label>
    <select class="form-select paso-tipo">
      ${STEP_TYPES.map(
        (t) =>
          `<option value="${t.value}" ${
            t.value === tipo ? "selected" : ""
          }>${t.label}</option>`
      ).join("")}
    </select>
  `;
  row1.appendChild(colTipo);

  // Repeticiones
  const colReps = document.createElement("div");
  colReps.className = "mb-3 col-md-6";
  colReps.innerHTML = `
    <label class="form-label">Repeticiones</label>
    <input type="number" class="form-control paso-reps" min="0"
           value="${paso.repeticiones ?? ""}">
  `;
  row1.appendChild(colReps);

  body.appendChild(row1);

  if (tipo !== "repeat") {
    // Fila 2: valor, unidad, zona
    const row2 = document.createElement("div");
    row2.className = "row g-2 builder-row";

    const colValor = document.createElement("div");
    colValor.className = "mb-3 col-md-4";
    colValor.innerHTML = `
      <label class="form-label">Valor</label>
      <input type="number" class="form-control paso-obj" min="0" step="0.01"
             value="${paso.objetivo_valor ?? ""}">
    `;
    row2.appendChild(colValor);

    const colUnidad = document.createElement("div");
    colUnidad.className = "mb-3 col-md-4";
    colUnidad.innerHTML = `
      <label class="form-label">Unidad</label>
      <select class="form-select paso-unit">
        ${UNIDADES.map(
          (u) =>
            `<option value="${u}" ${
              (paso.unidad || "") === u ? "selected" : ""
            }>${u || "Seleccionar..."}</option>`
        ).join("")}
      </select>
    `;
    row2.appendChild(colUnidad);

    const colZona = document.createElement("div");
    colZona.className = "mb-3 col-md-4";
    colZona.innerHTML = `
      <label class="form-label">Zona</label>
      <select class="form-select paso-zona">
        ${ZONAS.map(
          (z) =>
            `<option value="${z}" ${
              (paso.zona || "") === z ? "selected" : ""
            }>${z || "Sin zona"}</option>`
        ).join("")}
      </select>
    `;
    row2.appendChild(colZona);

    body.appendChild(row2);

    // Fila 3: recuperación valor + unidad
    const row3 = document.createElement("div");
    row3.className = "row g-2 builder-row";

    const colRecVal = document.createElement("div");
    colRecVal.className = "mb-3 col-md-4";
    colRecVal.innerHTML = `
      <label class="form-label">Recuperación (valor)</label>
      <input type="number" class="form-control paso-rec" min="0" step="1"
             value="${paso.recuperacion_valor ?? ""}">
    `;
    row3.appendChild(colRecVal);

    const colRecUni = document.createElement("div");
    colRecUni.className = "mb-3 col-md-4";
    colRecUni.innerHTML = `
      <label class="form-label">Recuperación (unidad)</label>
      <select class="form-select paso-recunit">
        ${UNIDADES.map(
          (u) =>
            `<option value="${u}" ${
              (paso.recuperacion_unidad || "") === u ? "selected" : ""
            }>${u || "Seleccionar..."}</option>`
        ).join("")}
      </select>
    `;
    row3.appendChild(colRecUni);

    body.appendChild(row3);
  }

  card.appendChild(body);

  // Si es bloque repetido, añadimos los subpasos dentro de .builder-step-children
  if (tipo === "repeat") {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "builder-step-children";

    const hijos = Array.isArray(paso.subpasos) ? paso.subpasos : [];
    hijos.forEach((sub) => {
      const childCard = crearStepCardEditable(sub);
      childrenContainer.appendChild(childCard);
    });

    card.appendChild(childrenContainer);
  }

  // Cambio de tipo (solo actualiza aspecto)
  const selectTipo = card.querySelector(".paso-tipo");
  if (selectTipo) {
    selectTipo.addEventListener("change", (ev) => {
      const nuevoTipo = ev.target.value;
      card.dataset.tipo = nuevoTipo;
      card.className = `builder-step-card ${getBlockClass(nuevoTipo)}`;
    });
  }

  return card;
}

// === AÑADIR NUEVO BLOQUE RAÍZ ===
function agregarBloqueRaiz() {
  const cont = document.getElementById("builder-steps");
  const nuevoPaso = {
    id: `new_${Date.now()}`,
    tipo_paso: "interval",
    repeticiones: 1,
    objetivo_valor: null,
    unidad: "",
    zona: "",
    recuperacion_valor: null,
    recuperacion_unidad: "",
    subpasos: []
  };
  const card = crearStepCardEditable(nuevoPaso);
  cont.appendChild(card);
}

// === RECOGER DATOS DEL DOM (UN SOLO STEP) ===
function collectStepFromCard(card) {
  const tipo = card.dataset.tipo || card.querySelector(".paso-tipo")?.value || "custom";

  const getNum = (sel) => {
    const el = card.querySelector(sel);
    if (!el || el.value === "") return null;
    const n = Number(el.value);
    return Number.isNaN(n) ? null : n;
  };

  const getVal = (sel) => {
    const el = card.querySelector(sel);
    return el ? el.value : "";
  };

  const step = {
    id: card.dataset.id,
    tipo_paso: tipo,
    repeticiones: getNum(".paso-reps"),
    objetivo_valor: getNum(".paso-obj"),
    unidad: getVal(".paso-unit") || null,
    zona: getVal(".paso-zona") || null,
    recuperacion_valor: getNum(".paso-rec"),
    recuperacion_unidad: getVal(".paso-recunit") || null,
    subpasos: []
  };

  if (tipo === "repeat") {
    const childrenContainer = card.querySelector(".builder-step-children");
    if (childrenContainer) {
      const childCards = childrenContainer.querySelectorAll(".builder-step-card");
      step.subpasos = Array.from(childCards).map((c) => collectStepFromCard(c));
    }
  }

  return step;
}

// Flatten: de árbol (repeat con subpasos) a lista para el backend
// Flatten: de árbol (repeat con subpasos) a lista para el backend
function flattenStepsForApi(treeSteps) {
  const resultado = [];

  function helper(steps, parentId = null) {
    steps.forEach((step) => {
      const plain = {
        // copiamos sólo los campos que realmente usamos
        id: step.id,
        tipo_paso: step.tipo_paso,
        repeticiones: step.repeticiones ?? null,
        objetivo_valor: step.objetivo_valor ?? null,
        unidad: step.unidad || null,
        zona: step.zona || null,
        recuperacion_valor: step.recuperacion_valor ?? null,
        recuperacion_unidad: step.recuperacion_unidad || null
      };

      // Sólo mandamos id cuando es un numérico (fila existente en BD)
      if (!plain.id || String(plain.id).startsWith("new_")) {
        delete plain.id;
      }

      // parent_id para este paso
      if (parentId && Number.isFinite(parentId)) {
        plain.parent_id = parentId;
      } else {
        plain.parent_id = null;
      }

      resultado.push(plain);

      // Si es un bloque repetido, sus subpasos van con parent_id = id del repeat
      if (step.tipo_paso === "repeat" && Array.isArray(step.subpasos) && step.subpasos.length) {
        // Usamos el id numérico del repeat como padre, que ya existe en BD
        const parentForChildren = plain.id && Number.isFinite(plain.id)
          ? plain.id
          : null;

        helper(step.subpasos, parentForChildren);
      }
    });
  }

  helper(treeSteps, null);
  return resultado;
}


// === CSRF HELPERS ===
async function ensureCsrfToken() {
  // Si tienes csrf.js cargado, normalmente expone window.CSRF.ensureToken
  if (window.CSRF && typeof window.CSRF.ensureToken === "function") {
    try {
      // true = fuerza refresco si hace falta
      return await window.CSRF.ensureToken(true);
    } catch (err) {
      console.warn("No se pudo obtener token CSRF mediante CSRF.ensureToken", err);
    }
  }

  // Fallback: si lo guardas en localStorage
  return localStorage.getItem("csrfToken");
}


// === GUARDAR CAMBIOS ===
async function guardarCambios() {
  const rootCards = document.querySelectorAll("#builder-steps > .builder-step-card");

  // Árbol completo (repeat con subpasos)
  const tree = Array.from(rootCards).map((card) => collectStepFromCard(card));

  // 👇 IMPORTANTE: objeto con propiedad "pasos"
  const payload = { pasos: tree };

  const csrf = await ensureCsrfToken();

  const res = await fetch(
    `${API_BASE}/entrenamientos_asignados/${asignadoId}/detalle`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify(payload)
    }
  );

  if (res.ok) {
    alert("Entrenamiento actualizado correctamente");
    window.history.back();
  } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Error al guardar");
  }
}
