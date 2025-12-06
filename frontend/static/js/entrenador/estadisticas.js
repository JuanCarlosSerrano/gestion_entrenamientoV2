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

let atletas = [];
let resultados = [];

const STEP_META = {
  warmup: { label: "Calentamiento", badge: "badge-warmup", card: "paso-warmup" },
  interval: { label: "Serie", badge: "badge-interval", card: "paso-interval" },
  rest: { label: "Recuperación", badge: "badge-rest", card: "paso-rest" },
  repeat: { label: "Bloque repetido", badge: "badge-repeat", card: "paso-repeat" },
  cooldown: { label: "Enfriamiento", badge: "badge-cooldown", card: "paso-cooldown" },
  custom: { label: "Bloque", badge: "badge-custom", card: "paso-custom" }
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
  cargarAtletas();
  elements.btnRefrescar?.addEventListener("click", cargarAtletas);
  elements.btnRefrescarResultados?.addEventListener("click", cargarResultados);
  cargarResultados();
});

const renderResultados = () => {
  if (!elements.resultadosBody) return;

  elements.resultadosBody.innerHTML = "";

  if (!resultados.length) {
    elements.resultadosVacio?.classList.remove("d-none");
    return;
  }
  elements.resultadosVacio?.classList.add("d-none");

  const resultsHtml = resultados
    .map((r) => {
      const tiempoReal = r.tiempo_real_seg ? `${(r.tiempo_real_seg / 60).toFixed(1)} min` : "—";
      const kmInfo =
        r.km_realizados != null
          ? `${r.km_realizados} km`
          : r.km_planificados != null
          ? `${r.km_planificados} km plan`
          : "—";
      return `
        <tr data-detalle-id="${r.entrenamiento_asignado_id}">
          <td>${r.atleta || "Atleta"}</td>
          <td>${r.entrenamiento || "Entrenamiento"}</td>
          <td>${formatFechaCorta(r.fecha)}</td>
          <td>—</td>
          <td>${tiempoReal}</td>
          <td>${kmInfo}</td>
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

  const feedbackHtml = (data.feedbacks || [])
    .map(
      (f) => `
      <li class="list-group-item">
        ${f.comentario || "Sin comentario"}
        ${f.url_datos ? `<br><a href="${f.url_datos}" target="_blank" rel="noopener">Datos</a>` : ""}
      </li>`
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

  const modalElement = document.getElementById("modalDetalleResultado");
  if (modalElement && window.bootstrap && window.bootstrap.Modal) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
  }
};
