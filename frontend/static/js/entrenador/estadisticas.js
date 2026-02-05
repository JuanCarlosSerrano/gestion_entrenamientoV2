const API_BASE =
  window.API_BASE_URL ||
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");
window.API_BASE = API_BASE;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const elements = {
  tablaBody: document.getElementById("tabla-atletas-body"),
  tablaVacia: document.getElementById("tabla-atletas-vacia"),
  btnRefrescar: document.getElementById("btn-refrescar-atletas"),
  resultadosBody: document.getElementById("tabla-resultados-body"),
  resultadosVacio: document.getElementById("resultados-vacio"),
  btnRefrescarResultados: document.getElementById("btn-refrescar-resultados")
};
const alertasListado = document.getElementById("alertas-listado");
const alertasResumen = document.getElementById("alertas-resumen");

let atletas = [];
let resultados = [];
const params = new URLSearchParams(window.location.search);
const preselectId = params.get("id") || params.get("entrenamiento_id");
const backParam = params.get("back");
let preselectHandled = false;
let filtroResultados = "todos"; // todos | alertas | incompletos | sin_feedback

const renderBackLink = () => {
  if (!backParam) return;
  const bar = document.querySelector(".page-context-bar");
  if (!bar) return;
  bar.classList.add("d-flex", "align-items-center", "gap-2");
  const link = document.createElement("a");
  link.className = "btn btn-outline-primary btn-sm ms-auto";
  link.textContent = "Volver a feedback";

  let resolvedBack = null;
  try {
    resolvedBack = decodeURIComponent(backParam);
  } catch (err) {
    resolvedBack = null;
  }
  if (resolvedBack) {
    link.href = resolvedBack;
  }

  link.addEventListener("click", (e) => {
    if (window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    } else if (resolvedBack) {
      e.preventDefault();
      window.location.href = resolvedBack;
    }
  });

  bar.appendChild(link);
};

const STEP_META = {
  warmup: { label: "Calentamiento", badge: "badge-warmup", card: "paso-warmup" },
  interval: { label: "Serie", badge: "badge-interval", card: "paso-interval" },
  rest: { label: "Recuperación", badge: "badge-rest", card: "paso-rest" },
  repeat: { label: "Bloque repetido", badge: "badge-repeat", card: "paso-repeat" },
  cooldown: { label: "Enfriamiento", badge: "badge-cooldown", card: "paso-cooldown" },
  custom: { label: "Bloque", badge: "badge-custom", card: "paso-custom" }
};

const textoRpe = (valor) => {
  const num = Number(valor);
  if (Number.isNaN(num)) return "";
  if (num <= 3) return "Muy suave";
  if (num <= 6) return "Controlado";
  if (num <= 8) return "Exigente";
  return "Máximo";
};

const iconoSensacion = (valor) => {
  const mapa = { "muy bien": "😄", bien: "🙂", normal: "😐", mal: "😖" };
  const val = (valor || "").toLowerCase();
  return mapa[val] ? `${mapa[val]} ${valor}` : valor;
};

const renderChipsFeedback = (fb = {}) => {
  const chips = [];
  const rpeVal = Number(fb.rpe);
  if (Number.isFinite(rpeVal)) {
    const clase = rpeVal >= 9 ? "chip-danger" : rpeVal >= 7 ? "chip-warning" : "chip-success";
    chips.push(`<span class="chip ${clase}">RPE ${rpeVal} · ${textoRpe(rpeVal)}</span>`);
  }
  if (fb.sensacion) chips.push(`<span class="chip chip-soft">${iconoSensacion(fb.sensacion)}</span>`);
  if (fb.fatiga) {
    const nivel = (fb.fatiga || "").toLowerCase();
    const clase = nivel === "alta" ? "chip-danger" : nivel === "media" ? "chip-warning" : "chip-success";
    chips.push(`<span class="chip ${clase}">Fatiga ${fb.fatiga}</span>`);
  }
  if (fb.dolor) {
    chips.push(
      `<span class="chip chip-danger">⚠️ Dolor${fb.zona_dolor ? `: ${fb.zona_dolor}` : ""}</span>`
    );
  }
  const incompleto = fb.completado === 0 || fb.completado === false;
  if (incompleto) {
    chips.push('<span class="chip chip-muted">No completado</span>');
  }
  return chips.join(" ");
};

const renderPasoLabel = (paso) => {
  const meta = STEP_META[paso.tipo_paso] || STEP_META.custom;
  const objetivo = paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "";
  const zona = paso.zona ? ` · ${paso.zona}` : "";
  return `
    <span class="badge ${meta.badge} me-2">${meta.label}</span>
    <span class="fw-semibold">${objetivo || "—"}</span>
    ${zona ? `<span class="text-muted">${zona}</span>` : ""}
  `;
};

const buildPasoTree = (pasos) => {
  const map = {};
  pasos.forEach((p) => {
    p.children = [];
    map[p.id] = p;
  });
  const roots = [];
  pasos.forEach((p) => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].children.push(p);
    } else {
      roots.push(p);
    }
  });
  return roots;
};

const renderPasoCard = (paso, idx) => {
  const meta = STEP_META[paso.tipo_paso] || STEP_META.custom;
  const objetivo = paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—";
  const zona = paso.zona ? ` · ${paso.zona}` : "";
  const rec = paso.recuperacion_valor
    ? `Rec: ${formatoTiempoSegundos(paso.recuperacion_valor)}`
    : "";
  const hijos = paso.children && paso.children.length
    ? `<ol class="paso-children mt-2">
        ${paso.children.map(renderPasoChild).join("")}
      </ol>`
    : "";
  const repBadge = paso.repeticiones ? `<span class="badge badge-repeat-count">x${paso.repeticiones}</span>` : "";

  return `
    <div class="paso-card ${meta.card}">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="badge ${meta.badge}">${meta.label}</span>
            ${repBadge}
          </div>
          <div class="fw-semibold mt-1">${objetivo}</div>
          ${zona ? `<div class="text-muted small">${zona}</div>` : ""}
          ${rec ? `<div class="text-muted small">${rec}</div>` : ""}
          ${paso.descripcion ? `<div class="small mt-1">${paso.descripcion}</div>` : ""}
        </div>
      </div>
      ${hijos}
    </div>
  `;
};

const renderPasoCards = (roots) => roots.map((p) => renderPasoCard(p)).join("");

const renderPasoChild = (paso) => {
  const meta = STEP_META[paso.tipo_paso] || STEP_META.custom;
  const objetivo = paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—";
  const zona = paso.zona ? ` · ${paso.zona}` : "";
  const rec = paso.recuperacion_valor ? ` · Rec: ${formatoTiempoSegundos(paso.recuperacion_valor)}` : "";
  return `<li>
    <span class="badge ${meta.badge} me-2">${meta.label}</span>
    <span class="fw-semibold">${objetivo}</span>
    <span class="text-muted">${zona}${rec}</span>
  </li>`;
};

const formatFechaCorta = (valor) => {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor || "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const formatKm = (valor) => {
  const num = Number(valor);
  if (Number.isNaN(num)) return "—";
  const rounded = Math.round(num * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} km`;
};

const calcularDeltaKm = (plan, real) => {
  const planNum = Number(plan);
  const realNum = Number(real);
  if (!Number.isFinite(planNum) || !Number.isFinite(realNum)) return null;
  return Math.round((realNum - planNum) * 10) / 10;
};

const generarAlertasItem = (item) => {
  if (Array.isArray(item.alertas)) {
    return item.alertas;
  }
  const alertas = [];
  const fb = item.feedback || {};
  const asignadoId = item.entrenamiento_asignado_id;
  const deltaKm = calcularDeltaKm(item.km_planificados, item.km_realizados);
  const fechaTS = new Date(item.fecha || "").getTime() || Date.now();

  if (fb.dolor) {
    alertas.push({
      tipo: "danger",
      texto: `${item.atleta}: dolor${fb.zona_dolor ? ` en ${fb.zona_dolor}` : ""} tras ${item.entrenamiento}`,
      id: asignadoId,
      ts: fechaTS,
    });
  }
  if (Number(fb.rpe) >= 8) {
    const rpeVal = Number(fb.rpe);
    const tipo = rpeVal >= 9 ? "danger" : "warning";
    alertas.push({
      tipo,
      texto: `${item.atleta}: RPE ${rpeVal >= 9 ? "muy alto" : "alto"} (${rpeVal}) en ${item.entrenamiento}`,
      id: asignadoId,
      ts: fechaTS,
    });
  }
  const sens = (fb.sensacion || "").toLowerCase();
  if (sens === "mal") {
    alertas.push({
      tipo: "warning",
      texto: `${item.atleta}: malas sensaciones en ${item.entrenamiento}`,
      id: asignadoId,
      ts: fechaTS,
    });
  }
  const fatiga = (fb.fatiga || "").toLowerCase();
  if (fatiga === "alta") {
    alertas.push({
      tipo: "warning",
      texto: `${item.atleta}: fatiga alta reportada`,
      id: asignadoId,
      ts: fechaTS,
    });
  }
  if (deltaKm !== null && Math.abs(deltaKm) >= 3) {
    alertas.push({
      tipo: "info",
      texto: `${item.atleta}: diferencia de ${deltaKm >= 0 ? "+" : ""}${deltaKm} km vs plan en ${item.entrenamiento}`,
      id: asignadoId,
      ts: fechaTS,
    });
  }
  return alertas;
};

const agruparAlertas = (lista = []) => {
  const mapa = new Map();
  lista.forEach((item) => {
    const key = item.entrenamiento_asignado_id;
    if (!key) return;
    const existentes = mapa.get(key) || {
      id: key,
      atleta: item.atleta,
      entrenamiento: item.entrenamiento,
      fecha: item.fecha,
      rpe: null,
      sensacion: null,
      fatiga: null,
      dolor: null,
      delta: calcularDeltaKm(item.km_planificados, item.km_realizados),
    };
    const fb = item.feedback || {};
    existentes.rpe = fb.rpe ?? existentes.rpe;
    existentes.sensacion = fb.sensacion ?? existentes.sensacion;
    existentes.fatiga = fb.fatiga ?? existentes.fatiga;
    existentes.dolor = fb.dolor ?? existentes.dolor;
    existentes.zona_dolor = fb.zona_dolor ?? existentes.zona_dolor;
    mapa.set(key, existentes);
  });
  return Array.from(mapa.values());
};

const construirAlertas = (lista = []) => {
  const alertas = [];
  lista.forEach((item) => {
    alertas.push(...generarAlertasItem(item));
  });
  const prioridad = { danger: 3, warning: 2, info: 1 };
  alertas.sort((a, b) => {
    const prio = (prioridad[b.tipo] || 0) - (prioridad[a.tipo] || 0);
    if (prio !== 0) return prio;
    return (b.ts || 0) - (a.ts || 0);
  });
  return alertas;
};

const renderAlertas = (lista = []) => {
  if (!alertasResumen || !alertasListado) return;
  alertasListado.innerHTML = "";
  const agrupadas = agruparAlertas(lista);
  const alertas = construirAlertas(lista);
  if (!alertas.length || !agrupadas.length) {
    alertasResumen.classList.add("d-none");
    return;
  }
  alertasResumen.classList.remove("d-none");

  const alertaPorId = alertas.reduce((acc, a) => {
    if (!acc[a.id]) acc[a.id] = [];
    acc[a.id].push(a);
    return acc;
  }, {});

  const prioridad = { danger: 3, warning: 2, info: 1 };
  agrupadas.sort((a, b) => {
    const aMax = Math.max(...(alertaPorId[a.id] || []).map((al) => prioridad[al.tipo] || 0), 0);
    const bMax = Math.max(...(alertaPorId[b.id] || []).map((al) => prioridad[al.tipo] || 0), 0);
    if (aMax !== bMax) return bMax - aMax;
    return new Date(b.fecha || 0) - new Date(a.fecha || 0);
  });

  agrupadas.slice(0, 20).forEach((item) => {
    const alertasItem = (alertaPorId[item.id] || []).map((a) => a.tipo);
    const rpeChip = Number.isFinite(Number(item.rpe))
      ? `<span class="chip ${item.rpe >= 9 ? "chip-danger" : item.rpe >= 7 ? "chip-warning" : "chip-success"}">RPE ${item.rpe}</span>`
      : "";
    const sensChip = item.sensacion
      ? `<span class="chip ${item.sensacion === "mal" ? "chip-danger" : item.sensacion === "normal" ? "chip-warning" : "chip-success"}">${iconoSensacion(item.sensacion)}</span>`
      : "";
    const fatigaChip = item.fatiga
      ? `<span class="chip ${item.fatiga === "alta" ? "chip-danger" : item.fatiga === "media" ? "chip-warning" : "chip-success"}">${item.fatiga}</span>`
      : "";
    const dolorChip = item.dolor
      ? `<span class="chip chip-danger">⚠️ ${item.zona_dolor || "Dolor"}</span>`
      : "";
    const delta = item.delta == null ? "—" : `${item.delta >= 0 ? "+" : ""}${item.delta} km`;

    const tr = document.createElement("tr");
    tr.dataset.detalleId = item.id;
    tr.innerHTML = `
      <td>${item.atleta || "Atleta"}</td>
      <td>${item.entrenamiento || "Entrenamiento"}</td>
      <td>${formatFechaCorta(item.fecha)}</td>
      <td>${rpeChip || "—"}</td>
      <td>${sensChip || "—"}</td>
      <td>${fatigaChip || "—"}</td>
      <td>${dolorChip || "—"}</td>
      <td>${delta}</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      resaltarFila(item.id);
      cargarDetalleResultado(item.id);
    });
    alertasListado.appendChild(tr);
  });
};

const setFiltroResultados = (modo) => {
  filtroResultados = modo;
  document.querySelectorAll("#filtro-todos, #filtro-alertas, #filtro-incompletos, #filtro-sin-feedback").forEach((btn) => {
    btn.classList.toggle("active", btn.id === `filtro-${modo}`);
  });
  renderResultados();
};

const resaltarFila = (asignadoId) => {
  const row = elements.resultadosBody?.querySelector(
    `tr[data-detalle-id="${asignadoId}"]`
  );
  if (row) {
    row.classList.add("table-info");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => row.classList.remove("table-info"), 2000);
  }
};

const renderTabla = () => {
  if (!elements.tablaBody) return;
  if (!atletas.length) {
    elements.tablaBody.innerHTML = "";
    elements.tablaVacia?.classList.remove("d-none");
    return;
  }
  elements.tablaVacia?.classList.add("d-none");
  elements.tablaBody.innerHTML = atletas
    .map(
      (atleta) => `
      <tr>
        <td>${atleta.nombre} ${atleta.apellidos || ""}</td>
        <td>${atleta.email || "—"}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-analizar-id="${atleta.id}">
            Analizar
          </button>
        </td>
      </tr>`
    )
    .join("");

  elements.tablaBody.querySelectorAll("[data-analizar-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `analisis_atleta.html?id=${btn.dataset.analizarId}`;
    });
  });
};

const cargarAtletas = async () => {
  try {
    const res = await fetch(`${API_BASE}/atletas`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) {
      throw new Error("No se pudieron obtener los atletas.");
    }
    atletas = await res.json();
    renderTabla();
  } catch (err) {
    console.error("Error al cargar atletas:", err);
    if (elements.tablaVacia) {
      elements.tablaVacia.textContent = err.message || "No se pudieron cargar los atletas.";
      elements.tablaVacia.classList.remove("d-none");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  renderBackLink();
  cargarAtletas();
  elements.btnRefrescar?.addEventListener("click", cargarAtletas);
  elements.btnRefrescarResultados?.addEventListener("click", cargarResultados);
  document.getElementById("filtro-todos")?.addEventListener("click", () => setFiltroResultados("todos"));
  document.getElementById("filtro-alertas")?.addEventListener("click", () => setFiltroResultados("alertas"));
  document.getElementById("filtro-incompletos")?.addEventListener("click", () => setFiltroResultados("incompletos"));
  document.getElementById("filtro-sin-feedback")?.addEventListener("click", () => setFiltroResultados("sin_feedback"));
  cargarResultados();
});

const renderResultados = () => {
  if (!elements.resultadosBody) return;

  elements.resultadosBody.innerHTML = "";

  let lista = resultados;
  if (filtroResultados === "alertas") {
    lista = lista.filter((r) => generarAlertasItem(r).length > 0);
  } else if (filtroResultados === "incompletos") {
    lista = lista.filter((r) => {
      const fb = r.feedback || {};
      return fb && fb.completado === 0;
    });
  } else if (filtroResultados === "sin_feedback") {
    lista = lista.filter((r) => {
      const fb = r.feedback || {};
      const tiene =
        fb.rpe != null ||
        fb.sensacion ||
        fb.fatiga ||
        fb.dolor != null ||
        fb.zona_dolor ||
        fb.completado != null;
      return !tiene;
    });
  }

  if (!lista.length) {
    elements.resultadosVacio?.classList.remove("d-none");
    renderAlertas([]);
    return;
  }
  elements.resultadosVacio?.classList.add("d-none");

  const preIdNum = Number(preselectId);
  const resultsHtml = lista
    .map((r) => {
      const kmPlan = formatKm(r.km_planificados);
      const kmReal = formatKm(r.km_realizados);
      const deltaKm = calcularDeltaKm(r.km_planificados, r.km_realizados);
      const kmDelta = deltaKm === null ? "—" : `${deltaKm >= 0 ? "+" : ""}${deltaKm} km`;
      const fb = r.feedback || {};
      const rpeVal = Number(fb.rpe);
      const rpeText = Number.isFinite(rpeVal)
        ? `<span class="chip ${rpeVal >= 9 ? "chip-danger" : rpeVal >= 7 ? "chip-warning" : "chip-success"}">RPE ${rpeVal}</span>`
        : "—";
      const sensacionVal = (fb.sensacion || "").toLowerCase();
      const sensacionText = sensacionVal
        ? `<span class="chip ${sensacionVal === "mal" ? "chip-danger" : sensacionVal === "normal" ? "chip-warning" : "chip-success"}">${iconoSensacion(fb.sensacion)}</span>`
        : "—";
      const fatigaVal = (fb.fatiga || "").toLowerCase();
      const fatigaText = fatigaVal
        ? `<span class="chip ${fatigaVal === "alta" ? "chip-danger" : fatigaVal === "media" ? "chip-warning" : "chip-success"}">${fb.fatiga}</span>`
        : "—";
      const dolorText = fb.dolor
        ? `<span class="chip chip-danger">⚠️ ${fb.zona_dolor || "Molestias"}</span>`
        : "—";
      const tieneFeedback =
        fb &&
        (fb.rpe !== null && fb.rpe !== undefined ||
          fb.sensacion ||
          fb.fatiga ||
          fb.dolor !== null && fb.dolor !== undefined ||
          fb.zona_dolor ||
          fb.completado !== null && fb.completado !== undefined);
      const completadoFlag = fb && fb.completado === 0 ? false : true;
      const estadoChip = completadoFlag
        ? tieneFeedback
          ? '<span class="chip chip-success">🟢 Completado con feedback</span>'
          : '<span class="chip chip-warning">🟡 Completado sin feedback</span>'
        : '<span class="chip chip-danger">🔴 No completado</span>';
      const destacado =
        Number.isFinite(preIdNum) && Number(r.entrenamiento_asignado_id) === preIdNum;
      const tieneAlertas = generarAlertasItem(r).length > 0;
      return `
        <tr data-detalle-id="${r.entrenamiento_asignado_id}" class="${destacado ? "table-info" : ""} ${tieneAlertas ? "table-warning" : ""}">
          <td>${r.atleta || "Atleta"}</td>
          <td>${r.entrenamiento || "Entrenamiento"}</td>
          <td>${formatFechaCorta(r.fecha)}</td>
          <td>${estadoChip}</td>
          <td>${kmPlan}</td>
          <td>${kmReal}</td>
          <td>${kmDelta}</td>
          <td>${rpeText}</td>
          <td>${sensacionText}</td>
          <td>${fatigaText}</td>
          <td>${dolorText}</td>
        </tr>
      `;
    })
    .join("");

  elements.resultadosBody.innerHTML = resultsHtml;
  elements.resultadosBody.querySelectorAll("tr[data-detalle-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-detalle-id");
      if (id) {
        cargarDetalleResultado(id);
      }
    });
  });

  renderAlertas(resultados);
};

const cargarResultados = async () => {
  if (!elements.resultadosBody) return;
  try {
    const res = await fetch(`${API_BASE}/resultados/entrenador`, {
      credentials: "include"
    });
    if (!res.ok) {
      throw new Error("No se pudieron obtener los resultados.");
    }
    resultados = await res.json();
    renderResultados();
    if (preselectId && !preselectHandled) {
      preselectHandled = true;
      cargarDetalleResultado(preselectId);
    }
  } catch (err) {
    console.error("Error al cargar resultados:", err);
    if (elements.resultadosVacio) {
      elements.resultadosVacio.textContent = err.message || "No se pudieron cargar los resultados.";
      elements.resultadosVacio.classList.remove("d-none");
    }
  }
};

const formatoTiempoSegundos = (seg) => {
  if (seg == null) return "—";
  const total = Number(seg);
  if (Number.isNaN(total) || total <= 0) return "—";
  const minutos = Math.floor(total / 60);
  const segundos = Math.round(total % 60);
  return `${minutos}:${String(segundos).padStart(2, "0")} min`;
};
const formatoRitmoSegKm = (seg) => {
  if (seg == null) return "—";
  const total = Number(seg);
  if (Number.isNaN(total) || total <= 0) return "—";
  const minutos = Math.floor(total / 60);
  const segundos = Math.round(total % 60);
  return `${minutos}:${String(segundos).padStart(2, "0")} /km`;
};

const formatoTiempoZona = (seg) => {
  if (seg == null) return "—";
  const total = Number(seg);
  if (Number.isNaN(total)) return "—";
  if (total <= 0) return "0:00";
  const minutos = Math.floor(total / 60);
  const segundos = Math.round(total % 60);
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
};

const formatoPorcentaje = (valor) => {
  if (valor == null) return "—";
  const num = Number(valor);
  if (Number.isNaN(num)) return "—";
  return `${Math.round(num)}%`;
};

const renderTablaZonas = (resumen, label) => {
  if (!resumen || !Array.isArray(resumen.zonas)) {
    return `<div class="text-muted small">Sin datos de zonas (${label}).</div>`;
  }
  const tieneDatos = resumen.zonas.some((z) => (z.plan_seg || 0) > 0 || (z.real_seg || 0) > 0);
  if (!tieneDatos) {
    return `<div class="text-muted small">Sin datos de zonas (${label}).</div>`;
  }
  const filas = resumen.zonas
    .map(
      (z) => `
        <tr>
          <td>${z.zona}</td>
          <td>${formatoTiempoZona(z.plan_seg)}</td>
          <td>${formatoPorcentaje(z.plan_pct)}</td>
          <td>${formatoTiempoZona(z.real_seg)}</td>
          <td>${formatoPorcentaje(z.real_pct)}</td>
        </tr>`
    )
    .join("");
  return `
    <div class="fw-semibold mb-1">${label}</div>
    <div class="table-responsive">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Zona</th>
            <th>Plan</th>
            <th>%</th>
            <th>Real</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
};

const cargarResumenZonas = async (entrenamientoId, fuente, containerId, label) => {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  contenedor.innerHTML = '<div class="text-muted small">Cargando...</div>';
  try {
    const res = await fetch(`${API_BASE}/entrenamientos_asignados/${entrenamientoId}/resumen_zonas?fuente=${fuente}`, {
      credentials: "include"
    });
    if (!res.ok) throw new Error('No se pudo cargar');
    const resumen = await res.json();
    contenedor.innerHTML = renderTablaZonas(resumen, label);
  } catch (err) {
    contenedor.innerHTML = `<div class="text-muted small">Sin datos de zonas (${label}).</div>`;
  }
};




const cargarDetalleResultado = async (asignadoId) => {
  try {
    const res = await fetch(`${API_BASE}/resultados/entrenador/${asignadoId}`, {
      credentials: "include"
    });
    if (!res.ok) {
      throw new Error("No se pudo cargar el detalle.");
    }
    const data = await res.json();
    renderDetalleModal(data);
  } catch (err) {
    console.error("Error al cargar detalle:", err);
    alert("No se pudo cargar el detalle del entrenamiento.");
  }
};

const renderDetalleModal = (data) => {
  const modalBody = document.getElementById("detalle-resultado-body");
  if (!modalBody) return;

  const pasosMap = {};
  (data.pasos || []).forEach((p) => {
    pasosMap[p.id] = p;
  });

  const comparativa = data.comparativa || {};
  const plan = comparativa.plan || {};
  const real = comparativa.real || {};
  const planKm = plan.km != null ? `${Number(plan.km).toFixed(2)} km` : '—';
  const realKm = real.km != null ? `${Number(real.km).toFixed(2)} km` : '—';
  const planDur = formatoTiempoSegundos(plan.duracion_seg);
  const realDur = formatoTiempoSegundos(real.duracion_seg);
  const planRitmo = formatoRitmoSegKm(plan.ritmo_seg_km);
  const realRitmo = formatoRitmoSegKm(real.ritmo_seg_km);
  const realFc = real.fc_media || real.fc_max ? `${real.fc_media ?? '—'} / ${real.fc_max ?? '—'} bpm` : '—';
  const realCad = real.cadencia_media != null ? `${Number(real.cadencia_media).toFixed(0)} spm` : '—';
  const planZonas = plan.zonas && plan.zonas.length
    ? `<div class="mt-1">${plan.zonas.map((z) => `<span class=\"chip chip-info me-1\">Z${z.zona}: ${z.repeticiones}</span>`).join('')}</div>`
    : '<div class="text-muted small mt-1">Sin zonas planificadas.</div>';

  const feedbackHtml = (data.feedbacks || [])
    .map(
      (f) => {
        const chips = renderChipsFeedback(f);
        const comentario = f.comentario || "Sin comentario";
        return `
      <li class="list-group-item">
        ${chips ? `<div class="d-flex flex-wrap gap-1 mb-1">${chips}</div>` : ""}
        <div>${comentario}</div>
        ${f.url_datos ? `<div class="mt-1"><a href="${f.url_datos}" target="_blank" rel="noopener">Datos</a></div>` : ""}
        <small class="text-muted">${formatFechaCorta(f.fecha)}</small>
      </li>`;
      }
    )
    .join("");

  const resultadosHtml = (data.resultados || [])
    .sort((a, b) => {
      const repA = a.repeticion || 0;
      const repB = b.repeticion || 0;
      if (repA !== repB) return repA - repB;
      const pasoA = a.paso_detalle_id || 0;
      const pasoB = b.paso_detalle_id || 0;
      return pasoA - pasoB;
    })
    .map((r) => {
      const paso = pasosMap[r.paso_detalle_id];
      return `
      <tr>
        <td>${paso ? renderPasoLabel(paso) : "Paso"}</td>
        <td>${r.repeticion || 1}</td>
        <td>${formatoTiempoSegundos(r.tiempo_real_seg)}</td>
      </tr>`;
    })
    .join("");

  modalBody.innerHTML = `
    <div class="mb-3">
      <h5 class="mb-1">${data.entrenamiento?.nombre || "Entrenamiento"}</h5>
      <div class="text-muted">
        ${formatFechaCorta(data.entrenamiento?.fecha)} · ${data.entrenamiento?.atleta || ""}
      </div>
      <div class="small mt-1">
        Km plan: ${data.entrenamiento?.km_planificados ?? data.entrenamiento?.km_previstos ?? "—"} ·
        Km real: ${data.entrenamiento?.km_realizados ?? "—"}
      </div>
      ${
        data.entrenamiento?.objetivo
          ? `<div class="mt-1"><strong>Objetivo:</strong> ${data.entrenamiento.objetivo}</div>`
          : ""
      }
      ${
        data.entrenamiento?.notas
          ? `<div class="mt-1"><strong>Notas:</strong> ${data.entrenamiento.notas}</div>`
          : ""
      }
    </div>

    <div class="mb-3">
      <h6>Feedback</h6>
      ${
        feedbackHtml
          ? `<ul class="list-group list-group-flush">${feedbackHtml}</ul>`
          : '<p class="text-muted mb-0">Sin feedback.</p>'
      }
    </div>


    <div class="mb-3">
      <h6>Comparativa planificado vs realizado</h6>
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <div class="border rounded p-2 h-100">
            <div class="fw-semibold mb-1">Planificado</div>
            <div class="small text-muted">Distancia: ${planKm}</div>
            <div class="small text-muted">Duración: ${planDur}</div>
            <div class="small text-muted">Ritmo: ${planRitmo}</div>
            ${planZonas}
          </div>
        </div>
        <div class="col-12 col-md-6">
          <div class="border rounded p-2 h-100">
            <div class="fw-semibold mb-1">Realizado</div>
            <div class="small text-muted">Distancia: ${realKm}</div>
            <div class="small text-muted">Duración: ${realDur}</div>
            <div class="small text-muted">Ritmo: ${realRitmo}</div>
            <div class="small text-muted">FC media/máx: ${realFc}</div>
            <div class="small text-muted">Cadencia media: ${realCad}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-3">
      <h6>Tiempo en zonas (plan vs real)</h6>
      <div id="detalle-zonas-ritmo" class="mb-3"></div>
      <div id="detalle-zonas-fc"></div>
    </div>

    <div class="mb-3">
      <h6>Pasos del entrenamiento</h6>
      ${
        data.pasos && data.pasos.length
          ? renderPasoCards(buildPasoTree(data.pasos || []))
          : '<p class="text-muted mb-0">Sin pasos registrados.</p>'
      }
    </div>

    <div>
      <h6>Resultados por paso</h6>
      ${
        resultadosHtml
          ? `<div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr><th>Paso</th><th>Repetición</th><th>Tiempo real</th></tr>
                </thead>
                <tbody>${resultadosHtml}</tbody>
              </table>
            </div>`
          : '<p class="text-muted mb-0">Sin resultados registrados.</p>'
      }
    </div>
  `;


  const resumenId = data.entrenamiento?.id || data.entrenamiento_id || data.id;
  if (resumenId) {
    cargarResumenZonas(resumenId, "ritmo", "detalle-zonas-ritmo", "Ritmo");
    cargarResumenZonas(resumenId, "fc", "detalle-zonas-fc", "FC");
  }

  const modalElement = document.getElementById("modalDetalleResultado");
  if (modalElement && window.bootstrap && window.bootstrap.Modal) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
  }
};
