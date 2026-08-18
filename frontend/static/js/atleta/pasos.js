const STEP_TITLES = {
  warmup: "Calentamiento",
  interval: "Intervalos",
  rest: "Recuperación",
  repeat: "Bloque repetido",
  cooldown: "Enfriamiento",
  custom: "Bloque libre"
};

const getStepLabel = (tipo) => STEP_TITLES[tipo] || "Bloque";

const getBlockClass = (tipo) => {
  switch (tipo) {
    case "warmup":
      return "training-block--warmup";
    case "interval":
      return "training-block--interval";
    case "rest":
      return "training-block--rest";
    case "repeat":
      return "training-block--repeat";
    case "cooldown":
      return "training-block--cooldown";
    default:
      return "training-block--custom";
  }
};

const VDOT_PACE_RANGES = {
  E: { min: 0.65, max: 0.78 },
  M: { min: 0.80, max: 0.84 },
  T: { min: 0.88, max: 0.92 },
  I: { min: 0.95, max: 1.00 },
  R: { min: 1.05, max: 1.15 },
  FR: { min: 1.18, max: 1.30 }
};

const vdotSpeedFromVo2 = (vo2) => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - vo2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const v = (-b + Math.sqrt(disc)) / (2 * a);
  return v > 0 ? v : null;
};

const vdotPaceFromFraction = (vdot, fraction) => {
  if (!vdot || !fraction) return null;
  const vo2 = vdot * fraction;
  const speed = vdotSpeedFromVo2(vo2);
  if (!speed) return null;
  const minPerKm = 1000 / speed;
  return minPerKm * 60;
};

const categoriaDesdeZona = (zonaNum) => {
  if (!zonaNum) return "I";
  if (zonaNum <= 2) return "E";
  if (zonaNum == 3) return "M";
  if (zonaNum == 4) return "T";
  if (zonaNum == 5) return "I";
  return "R";
};

const calcularTiempoDesdeVdot = (paso, zonas) => {
  if (!paso || !zonas) return null;
  if (paso.tipo_paso && paso.tipo_paso !== "interval") return null;
  const vdotVal = Number(zonas.vdot_val);
  if (!Number.isFinite(vdotVal) || vdotVal <= 0) return null;
  const metros = distanciaEnMetros(paso.objetivo_valor, paso.unidad || "");
  if (!metros) return null;
  const zonaKey = obtenerClaveZona(paso.zona);
  let zonaNum = null;
  if (zonaKey) {
    const match = zonaKey.match(/z(\d+)/);
    if (match) zonaNum = Number(match[1]);
  }
  const categoria = categoriaDesdeZona(zonaNum);
  const rango = VDOT_PACE_RANGES[categoria];
  if (!rango) return null;
  const fraccion = (rango.min + rango.max) / 2;
  const ritmoSeg = vdotPaceFromFraction(vdotVal, fraccion);
  if (!ritmoSeg) return null;
  return formatearTiempo(ritmoSeg * (metros / 1000));
};


const obtenerClaveZona = (valor) => {
  if (!valor) return null;
  const match = String(valor).toLowerCase().match(/(\d+)/);
  return match ? `z${match[1]}` : null;
};

const parseRitmoSegundos = (valor) => {
  if (valor == null) return null;
  if (typeof valor === "number" && !Number.isNaN(valor)) {
    if (valor > 15) {
      return Math.round(3600 / valor);
    }
    return Math.round(valor * 60);
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const colon = texto.match(/^(\d+):(\d{1,2})$/);
  if (colon) {
    return Number(colon[1]) * 60 + Number(colon[2]);
  }

  const numero = Number(texto.replace(",", "."));
  if (!Number.isNaN(numero)) {
    if (numero > 15) {
      return Math.round(3600 / numero);
    }
    if (numero > 0 && numero < 1) {
      return Math.round(numero * 3600);
    }
    return Math.round(numero * 60);
  }
  return null;
};

const distanciaEnMetros = (valor, unidad = "") => {
  const cantidad = Number(valor);
  if (!cantidad || Number.isNaN(cantidad)) return null;
  const u = unidad.toLowerCase();
  if (u.includes("km")) return cantidad * 1000;
  if (u.includes("metro") || u === "m" || !u) return cantidad;
  return null;
};

const formatearTiempo = (segundos) => {
  if (!Number.isFinite(segundos)) return null;
  const total = Math.max(0, Math.round(segundos));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
};

export const calcularTiempoDesdeZona = (paso, zonas) => {
  if (!zonas) return null;
  const tiempoVdot = calcularTiempoDesdeVdot(paso, zonas);
  if (tiempoVdot) return tiempoVdot;
  const zonaKey = obtenerClaveZona(paso.zona);
  if (!zonaKey || !(zonaKey in zonas)) return null;
  const ritmoSeg = parseRitmoSegundos(zonas[zonaKey]);
  if (!ritmoSeg) return null;
  const metros = distanciaEnMetros(paso.objetivo_valor, paso.unidad || "");
  if (!metros) return null;
  return formatearTiempo(ritmoSeg * (metros / 1000));
};

const buildStepDescription = (step, zonas) => {
  if (!step) return "";
  if (step.tipo_paso === "repeat") {
    const inner = (step.subpasos || [])
      .map((sub) => buildStepDescription(sub, zonas))
      .filter(Boolean)
      .join(" + ");
    const reps = step.repeticiones || 1;
    return `${reps} × (${inner || "Bloque"})`;
  }

  const tiempoZona = calcularTiempoDesdeZona(step, zonas);
  const partes = [
    step.objetivo_valor ? `${step.objetivo_valor}${step.unidad || ""}` : "",
    tiempoZona ? `Obj: ${tiempoZona}` : step.zona ? `Zona ${step.zona}` : "",
    step.recuperacion_valor
      ? `Rec: ${step.recuperacion_valor}${step.recuperacion_unidad || ""}`
      : "",
    step.descripcion || ""
  ]
    .filter(Boolean)
    .join(" · ");

  return partes || "Sin detalles";
};

const renderResultInputs = (paso, options) => {
  if (!options?.editableResults || !paso?.id) return "";
  return `
    <div class="training-block-results" data-result-step="${paso.id}">
      <label>
        <span>Tiempo real</span>
        <input class="form-control form-control-sm" type="text" inputmode="numeric" placeholder="mm:ss" data-result-time="${paso.id}">
      </label>
      <label>
        <span>Km reales</span>
        <input class="form-control form-control-sm" type="number" min="0" step="0.01" placeholder="0,00" data-result-km="${paso.id}">
      </label>
    </div>
  `;
};

const renderBlock = (paso, index, zonas, options = {}) => {
  const meta = [
    `<span class="training-pill training-pill--index">Bloque ${index + 1}</span>`
  ];
  if (paso.tipo_paso === "repeat" && paso.repeticiones) {
    meta.push(
      `<span class="training-pill training-pill--repeat">${paso.repeticiones} repeticiones</span>`
    );
  }

  const sublist =
    paso.tipo_paso === "repeat" && Array.isArray(paso.subpasos) && paso.subpasos.length
      ? `<ul class="training-substeps-list">
            ${paso.subpasos
              .map(
                (sub, idx) => `<li>
                  <span>${idx + 1}. ${buildStepDescription(sub, zonas)}</span>
                  ${renderResultInputs(sub, options)}
                </li>`
              )
              .join("")}
         </ul>`
      : "";

  return `
    <div class="training-block ${getBlockClass(paso.tipo_paso)}">
      <div class="training-block-header">
        <div class="training-block-title">${getStepLabel(paso.tipo_paso)}</div>
        <div class="training-block-meta">${meta.join("")}</div>
      </div>
      <div class="training-block-body">
        <div class="training-block-text">${buildStepDescription(paso, zonas)}</div>
        ${sublist}
        ${renderResultInputs(paso, options)}
      </div>
    </div>
  `;
};

export const renderPasos = (pasos, zonas, options = {}) => {
  if (!Array.isArray(pasos) || !pasos.length) {
    return '<p class="text-muted small mb-0">Sin bloques detallados.</p>';
  }
  return (pasos || []).map((p, index) => renderBlock(p, index, zonas, options)).join("");
};

export const buildTreeFromFlat = (list) => {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  list.forEach((p) => byId.set(p.id, { ...p, subpasos: [] }));

  const roots = [];
  list.forEach((p) => {
    const node = byId.get(p.id);
    if (p.parent_id) {
      const parent = byId.get(p.parent_id);
      if (parent) {
        parent.subpasos.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const ordenar = (nodes) => {
    nodes.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    nodes.forEach((n) => ordenar(n.subpasos || []));
  };
  ordenar(roots);
  return roots;
};
