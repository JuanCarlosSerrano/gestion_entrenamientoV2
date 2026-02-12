import { buildTreeFromFlat, renderPasos, calcularTiempoDesdeZona } from "../atleta/pasos.js";

const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const qs = new URLSearchParams(window.location.search);
const atletaId = qs.get("id");

const elements = {
  nombre: document.getElementById("athlete-name"),
  filtroNombre: document.getElementById("filtro-nombre"),
  comparativa: document.getElementById("comparativa-contenido"),
  tablaSesiones: document.getElementById("tabla-sesiones"),
  tablaSeries: document.getElementById("tabla-series"),
  resumenRango: document.getElementById("resumen-semana-rango-entrenador"),
  resumenSesiones: document.getElementById("resumen-semana-sesiones-entrenador"),
  resumenCompletadas: document.getElementById("resumen-semana-completadas-entrenador"),
  resumenPendientes: document.getElementById("resumen-semana-pendientes-entrenador"),
  resumenKmPlan: document.getElementById("resumen-semana-km-plan"),
  resumenKmReal: document.getElementById("resumen-semana-km-real"),
  graficoCanvas: document.getElementById("grafico-tiempo-canvas"),
  graficoEstado: document.getElementById("grafico-tiempo-estado"),
  graficoKmsPlanCanvas: document.getElementById("grafico-kms-plan-canvas"),
  graficoKmsPlanEstado: document.getElementById("grafico-kms-plan-estado"),
  graficoKmsRealCanvas: document.getElementById("grafico-kms-real-canvas"),
  graficoKmsRealEstado: document.getElementById("grafico-kms-real-estado"),
  resumenZonasFuente: document.getElementById("resumen-zonas-fuente"),
  resumenZonasMetrica: document.getElementById("resumen-zonas-metrica"),
  resumenZonasTabla: document.getElementById("resumen-zonas-tabla"),
  resumenZonasRecalcular: document.getElementById("resumen-zonas-recalcular"),
  resumenZonasCanvas: document.getElementById("resumen-zonas-canvas"),
  resumenZonasComparativaCanvas: document.getElementById("resumen-zonas-comparativa-canvas"),
  resumenZonasEstado: document.getElementById("resumen-zonas-estado")
};

let entrenamientosCargados = [];
let zonasAtleta = null;
const zonasPorFechaCache = new Map();
const resultadosCache = new Map();
let graficoLineas = null;
let graficoKmsPlan = null;
let graficoKmsReal = null;
let graficoZonas = null;
let graficoZonasComparativa = null;
let ultimoZonasSemana = null;
let entrenamientosFiltrados = [];
let sesionesSeleccionadas = new Set();
let entrenamientoSeleccionado = null;
let serieSeleccionada = null;

const formatearFecha = (valor) => {
  if (!valor) return "--/--/----";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return valor;
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit"
  });
};

const formatearTiempo = (segundos) => {
  if (!Number.isFinite(segundos) || segundos <= 0) return "—";
  const total = Math.round(segundos);
  const minutos = Math.floor(total / 60);
  const seg = total % 60;
  return `${minutos}:${String(seg).padStart(2, "0")}`;
};

const formatearSemanaLabel = (semanaStr) => {
  if (!semanaStr) return "";
  try {
    const base = new Date(semanaStr);
    if (Number.isNaN(base.getTime())) return semanaStr;
    const inicio = base.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const finDate = new Date(base);
    finDate.setDate(base.getDate() + 6);
    const fin = finDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    return `${inicio}–${fin}`;
  } catch (err) {
    return semanaStr;
  }
};

const formatTiempoChart = (segundos) => {
  if (segundos == null || Number.isNaN(Number(segundos))) return "0:00";
  const total = Math.max(0, Math.round(Number(segundos)));
  const minutos = Math.floor(total / 60);
  const seg = total % 60;
  return `${minutos}:${String(seg).padStart(2, "0")}`;
};


const formatoPorcentaje = (valor) => {
  if (valor == null) return "—";
  const num = Number(valor);
  if (Number.isNaN(num)) return "—";
  return `${Math.round(num)}%`;
};

const renderTablaZonasSemana = (contenedor, resumen) => {
  if (!contenedor) return;
  if (!resumen || !Array.isArray(resumen.zonas)) {
    contenedor.innerHTML = '<div class="text-muted small">Sin datos de zonas.</div>';
    return;
  }
  const tieneDatos = resumen.zonas.some((z) => (z.plan_seg || 0) > 0 || (z.real_seg || 0) > 0);
  if (!tieneDatos) {
    contenedor.innerHTML = '<div class="text-muted small">Sin datos de zonas.</div>';
    return;
  }
  const filas = resumen.zonas
    .map(
      (z) => `
        <tr>
          <td>${z.zona}</td>
          <td>${formatearTiempo(z.plan_seg)}</td>
          <td>${formatoPorcentaje(z.plan_pct)}</td>
          <td>${formatearTiempo(z.real_seg)}</td>
          <td>${formatoPorcentaje(z.real_pct)}</td>
        </tr>`
    )
    .join("");
  contenedor.innerHTML = `
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

const renderPieZonas = (canvas, chartRef, resumen, estadoEl, metrica) => {
  if (!canvas) return chartRef;
  const zonas = (resumen && Array.isArray(resumen.zonas)) ? resumen.zonas : [];
  const labels = zonas.map((z) => z.zona);
  const valores = zonas.map((z) => Number(metrica === "plan" ? z.plan_seg : z.real_seg) || 0);
  const total = valores.reduce((a, b) => a + b, 0);

  if (!total) {
    if (estadoEl) estadoEl.textContent = "Sin datos para el gráfico.";
    if (chartRef) {
      chartRef.destroy();
      chartRef = null;
    }
    return chartRef;
  }

  if (estadoEl) estadoEl.textContent = metrica === "plan" ? "Tiempo planificado por zona" : "Tiempo real por zona";
  const data = {
    labels,
    datasets: [
      {
        data: valores,
        backgroundColor: [
          "#4e79a7",
          "#59a14f",
          "#f28e2b",
          "#e15759",
          "#76b7b2",
          "#edc948"
        ]
      }
    ]
  };

  if (chartRef) {
    chartRef.data = data;
    chartRef.update();
    return chartRef;
  }

  return new Chart(canvas, {
    type: "pie",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "Zona";
              const val = ctx.parsed || 0;
              return `${label}: ${formatTiempoChart(val)}`;
            }
          }
        }
      }
    }
  });
};

const renderBarComparativaZonas = (canvas, chartRef, resumen) => {
  if (!canvas) return chartRef;
  const zonas = (resumen && Array.isArray(resumen.zonas)) ? resumen.zonas : [];
  const labels = zonas.map((z) => z.zona);
  const plan = zonas.map((z) => Number(z.plan_seg) || 0);
  const real = zonas.map((z) => Number(z.real_seg) || 0);
  const total = plan.reduce((a, b) => a + b, 0) + real.reduce((a, b) => a + b, 0);

  if (!total) {
    if (chartRef) {
      chartRef.destroy();
      chartRef = null;
    }
    return chartRef;
  }

  const data = {
    labels,
    datasets: [
      { label: "Plan", data: plan, backgroundColor: "#4e79a7" },
      { label: "Real", data: real, backgroundColor: "#f28e2b" }
    ]
  };

  if (chartRef) {
    chartRef.data = data;
    chartRef.update();
    return chartRef;
  }

  return new Chart(canvas, {
    type: "bar",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || "";
              const val = ctx.parsed.y || 0;
              return `${label}: ${formatTiempoChart(val)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatTiempoChart(value)
          }
        }
      }
    }
  });
};





const recalcularZonasSemana = async () => {
  if (!atletaId) return;
  if (elements.resumenZonasEstado) {
    elements.resumenZonasEstado.textContent = "Recalculando zonas...";
  }
  if (elements.resumenZonasRecalcular) {
    elements.resumenZonasRecalcular.disabled = true;
  }
  try {
    const res = await fetch(`${API_BASE}/analisis_atleta/${atletaId}?recalcular_zonas=1`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ultimoZonasSemana = data.zonas_semana || null;
    renderResumenZonasSemana(ultimoZonasSemana);
  } catch (err) {
    console.warn("No se pudo recalcular zonas", err);
    if (elements.resumenZonasEstado) {
      elements.resumenZonasEstado.textContent = "No se pudieron recalcular las zonas.";
    }
  } finally {
    if (elements.resumenZonasRecalcular) {
      elements.resumenZonasRecalcular.disabled = false;
    }
  }
};

const renderResumenZonasSemana = (zonasSemana) => {
  const ritmo = zonasSemana?.ritmo || null;
  const fc = zonasSemana?.fc || null;
  const fuente = elements.resumenZonasFuente?.value || "fc";
  const metrica = elements.resumenZonasMetrica?.value || "real";
  const resumen = fuente === "ritmo" ? ritmo : fc;

  renderTablaZonasSemana(elements.resumenZonasTabla, resumen);
  graficoZonas = renderPieZonas(
    elements.resumenZonasCanvas,
    graficoZonas,
    resumen,
    elements.resumenZonasEstado,
    metrica
  );
  graficoZonasComparativa = renderBarComparativaZonas(
    elements.resumenZonasComparativaCanvas,
    graficoZonasComparativa,
    resumen
  );
};

const cargarZonas = async () => {
  try {
    const res = await fetch(`${API_BASE}/zonas_atleta/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (res.ok) zonasAtleta = await res.json();
  } catch (err) {
    console.warn("No se pudieron cargar zonas del atleta:", err);
    zonasAtleta = null;
  }
};


const resumenSemana = (entrenos, pendientes, hoy) => {
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); // lunes
  inicioSemana.setHours(0, 0, 0, 0);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);

  if (elements.resumenRango) {
    const ini = inicioSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const fin = finSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    elements.resumenRango.textContent = `${ini} – ${fin}`;
  }

  const idsPend = new Set((pendientes || []).map((e) => e.id));
  const entrenosSemana = (entrenos || []).filter((ent) => {
    if (!ent.fecha) return false;
    const f = new Date(ent.fecha);
    return f >= inicioSemana && f <= finSemana;
  });

  const totalSemana = entrenosSemana.length;
  let completadas = 0;
  let pend = 0;
  entrenosSemana.forEach((ent) => {
    if (!ent.fecha) return;
    const f = new Date(ent.fecha);
    f.setHours(0, 0, 0, 0);
    if (f < hoy) {
      if (idsPend.has(ent.id)) pend += 1;
      else completadas += 1;
    } else {
      pend += 1; // futuros de la semana cuentan como pendientes
    }
  });

  if (elements.resumenSesiones) elements.resumenSesiones.textContent = `${totalSemana}`;
  if (elements.resumenCompletadas) elements.resumenCompletadas.textContent = `${completadas}`;
  if (elements.resumenPendientes) elements.resumenPendientes.textContent = `${pend}`;
  if (elements.resumenKmPlan) elements.resumenKmPlan.textContent = "—";
  if (elements.resumenKmReal) elements.resumenKmReal.textContent = "—";
};

const obtenerZonasPorFecha = async (fecha) => {
  if (!fecha) return zonasAtleta;
  let clave = "";
  try {
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime())) {
      clave = d.toISOString().slice(0, 10);
    }
  } catch (e) {
    // noop
  }
  if (!clave) {
    const str = String(fecha);
    const partes = str.split(/[ T]/);
    clave = partes[0] || str;
  }
  if (zonasPorFechaCache.has(clave)) return zonasPorFechaCache.get(clave);
  try {
    const res = await fetch(
      `${API_BASE}/zonas_atleta/${atletaId}?fecha=${encodeURIComponent(clave)}`,
      {
        credentials: "include",
        headers: { Authorization: authHeader() }
      }
    );
    if (!res.ok) throw new Error("No zonas en fecha");
    const data = await res.json();
    zonasPorFechaCache.set(clave, data);
    return data;
  } catch (err) {
    console.warn("No se pudieron obtener zonas para fecha", clave, err);
    zonasPorFechaCache.set(clave, zonasAtleta);
    return zonasAtleta;
  }
};

const obtenerResultados = async (entrenamientoId) => {
  if (resultadosCache.has(entrenamientoId)) return resultadosCache.get(entrenamientoId);
  try {
    const res = await fetch(`${API_BASE}/entrenamientos_asignados/${entrenamientoId}/resultados`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error("No se pudieron obtener resultados");
    const data = await res.json();
    if (Array.isArray(data)) {
      resultadosCache.set(entrenamientoId, data);
    } else if (data && typeof data === "object" && "km_realizados_total" in data) {
      resultadosCache.set(entrenamientoId, [data]);
    } else {
      resultadosCache.set(entrenamientoId, []);
    }
  } catch (err) {
    console.warn("No se pudieron cargar resultados de", entrenamientoId, err);
    resultadosCache.set(entrenamientoId, []);
  }
  return resultadosCache.get(entrenamientoId);
};

const cargarAtleta = async () => {
  if (!atletaId) return;
  try {
    const res = await fetch(`${API_BASE}/atletas/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (res.ok) {
      const data = await res.json();
      if (elements.nombre) {
        elements.nombre.textContent = `${data.nombre || "Atleta"} ${data.apellidos || ""}`.trim();
      }
    } else if (elements.nombre) {
      elements.nombre.textContent = `Atleta ${atletaId}`;
    }
  } catch (err) {
    console.error("No se pudo cargar atleta:", err);
    if (elements.nombre) elements.nombre.textContent = `Atleta ${atletaId}`;
  }
};

const aplicarFiltro = () => {
  const seleccionado = elements.filtroNombre?.value || "";
  if (!seleccionado) {
    sesionesSeleccionadas.clear();
    entrenamientosFiltrados = [];
    entrenamientoSeleccionado = null;
    serieSeleccionada = null;
    renderListaSesiones();
    renderComparativa([]);
    return;
  }
  entrenamientosFiltrados = entrenamientosCargados.filter((e) => (e.nombre || "").trim() === seleccionado);
  // no seleccionar por defecto
  sesionesSeleccionadas.clear();
  entrenamientoSeleccionado = null;
  serieSeleccionada = null;
  renderListaSesiones();
  renderComparativa([]);
};

const poblarSelectNombres = () => {
  if (!elements.filtroNombre) return;
  const nombres = Array.from(
    new Set(
      entrenamientosCargados
        .map((e) => (e.nombre || "").trim())
        .filter(Boolean)
    )
  ).sort();

  const opciones = ['<option value="">Selecciona entrenamiento</option>'].concat(
    nombres.map((n) => `<option value="${n}">${n}</option>`)
  );
  elements.filtroNombre.innerHTML = opciones.join("");
  elements.filtroNombre.onchange = aplicarFiltro;
};

const renderListaSesiones = () => {
  if (!elements.tablaSesiones) return;
  elements.tablaSesiones.innerHTML = "";
  entrenamientoSeleccionado = null;
  serieSeleccionada = null;
  renderListaSeries([]);
  renderGraficoTiempos([]);

  if (!entrenamientosFiltrados.length) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">Selecciona un entrenamiento para ver los tiempos.</p>';
    return;
  }

  const filas = entrenamientosFiltrados
    .slice()
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((ent) => {
      const fechaTxt = formatearFecha(ent.fecha);
      return `
        <tr>
          <td><input type="checkbox" class="form-check-input" data-ent-id="${ent.id}"></td>
          <td>${fechaTxt}</td>
          <td>${ent.nombre || "-"}</td>
        </tr>
      `;
    });
  elements.tablaSesiones.innerHTML = filas.join("");
  elements.tablaSesiones.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.entId);
      if (chk.checked) {
        sesionesSeleccionadas.add(id);
      } else {
        sesionesSeleccionadas.delete(id);
      }
      serieSeleccionada = null;
      // Tomamos la primera sesión seleccionada para listar series
      const firstId = Array.from(sesionesSeleccionadas)[0];
      entrenamientoSeleccionado =
        entrenamientosFiltrados.find((e) => e.id === firstId) || null;
      renderListaSeries(entrenamientoSeleccionado);
      const activos = entrenamientosFiltrados.filter((e) => sesionesSeleccionadas.has(e.id));
      renderComparativa(activos);
    });
  });
};

const renderListaSeries = (entrenamiento) => {
  if (!elements.tablaSeries) return;
  elements.tablaSeries.innerHTML = "";
  if (!entrenamiento || !(entrenamiento.pasos || []).length) return;

  const intervalos = extraerIntervalos(entrenamiento.pasos, entrenamiento.zonas || zonasAtleta);
  const filas = intervalos.map((item, idx) => {
    return `
      <tr>
        <td><input type="radio" name="serie-radio" class="form-check-input" data-serie-id="${item.pasoId}" data-bloque="${item.bloque}" data-rep="${item.repeticion}" data-idx="${idx}" data-dist="${item.distancia || ""}" data-zona="${item.zona || ""}"></td>
        <td>${item.bloque}</td>
        <td>${item.repeticion || 1}</td>
        <td>${item.distancia || "—"}</td>
        <td>${item.zona || "-"}</td>
      </tr>
    `;
  });
  elements.tablaSeries.innerHTML = filas.join("");
  elements.tablaSeries.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const rep = Number(radio.dataset.rep) || 1;
      const pasoId = Number(radio.dataset.serieId);
      const dist = radio.dataset.dist || "";
      const zona = radio.dataset.zona || "";
      const bloque = Number(radio.dataset.bloque) || null;
      serieSeleccionada = { pasoId, rep, dist, zona, bloque };
      const activos = entrenamientosFiltrados.filter((e) => sesionesSeleccionadas.has(e.id));
      renderComparativa(activos);
    });
  });
};

const extraerIntervalos = (pasos, zonas, bloquePrefix = []) => {
  const resultado = [];
  const recorrer = (paso, idxBloque, repStack = []) => {
    if (!paso) return;
    if (paso.tipo_paso === "repeat") {
      const reps = Number(paso.repeticiones) || 1;
      for (let r = 1; r <= reps; r += 1) {
        (paso.subpasos || []).forEach((sub) => recorrer(sub, idxBloque, [...repStack, r]));
      }
      return;
    }
    if (paso.tipo_paso === "interval") {
      const repeticion = repStack.length ? repStack[repStack.length - 1] : 1;
      resultado.push({
        pasoId: paso.id,
        bloque: idxBloque + 1,
        repeticion,
        distancia: paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—",
        objetivo: calcularTiempoDesdeZona(paso, zonas),
        zona: paso.zona || "",
        descripcion: paso.descripcion || ""
      });
    }
    (paso.subpasos || []).forEach((sub) => recorrer(sub, idxBloque, repStack));
  };
  (pasos || []).forEach((p, idx) => recorrer(p, idx));
  return resultado;
};

const renderGraficoTiempos = (puntos, mensajeVacio = null) => {
  if (!elements.graficoCanvas || !elements.graficoEstado) return;

  if (graficoLineas) {
    graficoLineas.destroy();
    graficoLineas = null;
  }
  elements.graficoEstado.hidden = false;

  if (!window.Chart) {
    elements.graficoEstado.textContent = "No se pudo cargar el gráfico.";
    return;
  }

  const datos = Array.isArray(puntos) ? puntos : [];
  const tieneDatos =
    datos.some((p) => Number.isFinite(p.objetivoSeg)) || datos.some((p) => Number.isFinite(p.realSeg));

  if (!datos.length || !tieneDatos) {
    elements.graficoEstado.textContent =
      mensajeVacio ||
      "No hay datos numéricos para graficar. Completa entrenamientos con tiempos reales.";
    return;
  }

  const labels = datos.map((p) => p.etiqueta || "");
  const dataProp = datos.map((p) => (Number.isFinite(p.objetivoSeg) ? p.objetivoSeg : null));
  const dataReal = datos.map((p) => (Number.isFinite(p.realSeg) ? p.realSeg : null));

  elements.graficoEstado.hidden = true;
  graficoLineas = new Chart(elements.graficoCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Propuesto",
          data: dataProp,
          borderColor: "#0d6efd99",
          backgroundColor: "rgba(13,110,253,0.08)",
          borderDash: [6, 4],
          tension: 0.2,
          spanGaps: true,
          pointRadius: 3,
          pointBackgroundColor: "#0d6efd99",
          borderWidth: 1.5
        },
        {
          label: "Real",
          data: dataReal,
          borderColor: "#198754",
          backgroundColor: "rgba(25,135,84,0.12)",
          tension: 0.25,
          spanGaps: true,
          pointRadius: 4,
          pointBackgroundColor: "#198754",
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const valor = ctx.parsed.y;
              const tiempo = Number.isFinite(valor) ? formatearTiempo(valor) : "—";
              return `${ctx.dataset.label}: ${tiempo}`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "Sesiones seleccionadas" } },
        y: {
          title: { display: true, text: "Tiempo (mm:ss)" },
          ticks: { callback: (val) => formatearTiempo(val) },
          beginAtZero: false
        }
      }
    }
  });
};

const renderGraficoKmsPlan = (datos, mensajeVacio = null) => {
  if (!elements.graficoKmsPlanCanvas || !elements.graficoKmsPlanEstado) return;
  if (graficoKmsPlan) {
    graficoKmsPlan.destroy();
    graficoKmsPlan = null;
  }
  elements.graficoKmsPlanEstado.hidden = false;

  if (!window.Chart) {
    elements.graficoKmsPlanEstado.textContent = "No se pudo cargar el gráfico de kms previstos.";
    return;
  }

  const data = Array.isArray(datos) ? datos : [];
  if (!data.length) {
    elements.graficoKmsPlanEstado.textContent =
      mensajeVacio || "No hay datos de kms previstos para este atleta.";
    return;
  }

  const labels = data.map((d) => {
    const semana = d.semana || d.label;
    return formatearSemanaLabel(semana) || "";
  });
  const plan = data.map((d) => Number(d.planificados) || 0);

  elements.graficoKmsPlanEstado.hidden = true;
  graficoKmsPlan = new Chart(elements.graficoKmsPlanCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Kms previstos",
          data: plan,
          backgroundColor: "rgba(13, 110, 253, 0.35)",
          borderColor: "#0d6efd",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y ?? 0;
              return `${ctx.dataset.label}: ${v.toFixed(2)} km`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Semana" }
        },
        y: {
          title: { display: true, text: "Kilómetros" },
          beginAtZero: true
        }
      }
    }
  });
};

const renderGraficoKmsReal = (datos, mensajeVacio = null) => {
  if (!elements.graficoKmsRealCanvas || !elements.graficoKmsRealEstado) return;
  if (graficoKmsReal) {
    graficoKmsReal.destroy();
    graficoKmsReal = null;
  }
  elements.graficoKmsRealEstado.hidden = false;

  if (!window.Chart) {
    elements.graficoKmsRealEstado.textContent = "No se pudo cargar el gráfico de kms reales.";
    return;
  }

  const data = Array.isArray(datos) ? datos : [];
  if (!data.length) {
    elements.graficoKmsRealEstado.textContent =
      mensajeVacio || "No hay datos de kms reales para este atleta.";
    return;
  }

  const labels = data.map((d) => {
    const semana = d.semana || d.label;
    return formatearSemanaLabel(semana) || "";
  });
  const real = data.map((d) => Number(d.realizados) || 0);

  elements.graficoKmsRealEstado.hidden = true;
  graficoKmsReal = new Chart(elements.graficoKmsRealCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Kms realizados",
          data: real,
          backgroundColor: "rgba(25, 135, 84, 0.45)",
          borderColor: "#198754",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y ?? 0;
              return `${ctx.dataset.label}: ${v.toFixed(2)} km`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Semana" }
        },
        y: {
          title: { display: true, text: "Kilómetros" },
          beginAtZero: true
        }
      }
    }
  });
};

const renderComparativa = async (entrenos) => {
  if (!elements.comparativa) return;
  if (!entrenos.length || !serieSeleccionada) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">Selecciona una sesión y una serie para ver el gráfico.</p>';
    renderGraficoTiempos([], "Selecciona una sesión y una serie para ver el gráfico.");
    return;
  }

  const puntosGrafico = [];
  let tieneIntervalos = false;
  for (const ent of entrenos) {
    const resultados = await obtenerResultados(ent.id);
    const intervalos = extraerIntervalos(ent.pasos || [], ent.zonas || zonasAtleta);
    if (intervalos.length) tieneIntervalos = true;
    const fechaObj = ent.fecha ? new Date(ent.fecha) : null;
    const fechaEtiqueta = formatearFecha(ent.fecha);
    const fechaOrden = fechaObj && !Number.isNaN(fechaObj.getTime()) ? fechaObj.getTime() : null;
    intervalos
      .filter((item) => {
        const matchPaso =
          Number(item.pasoId) === Number(serieSeleccionada.pasoId) ||
          (serieSeleccionada.bloque != null &&
            Number(item.bloque) === Number(serieSeleccionada.bloque));
        const matchRep = Number(item.repeticion || 1) === Number(serieSeleccionada.rep);
        const matchDist =
          (serieSeleccionada.dist || "") === "" ||
          (item.distancia || "") === serieSeleccionada.dist;
        return matchPaso && matchRep && matchDist;
      })
      .forEach((item) => {
        const encontrado = (resultados || []).find(
          (r) =>
            Number(r.paso_detalle_id) === Number(item.pasoId) &&
            Number(r.repeticion) === Number(item.repeticion)
        );
        const objetivoSeg = parseSegundos(item.objetivo);
        const realSeg = parseSegundos(encontrado?.tiempo_real_seg);
        if (fechaEtiqueta && fechaOrden !== null) {
          puntosGrafico.push({
            etiqueta: fechaEtiqueta,
            objetivoSeg: Number.isFinite(objetivoSeg) ? objetivoSeg : null,
            realSeg: Number.isFinite(realSeg) ? realSeg : null,
            orden: fechaOrden,
            distancia: item.distancia || `Serie ${item.bloque}`
          });
        }
      });
  }

  if (!tieneIntervalos || puntosGrafico.length === 0) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">No hay datos para esa serie en la sesión seleccionada.</p>';
    renderGraficoTiempos([], "No hay intervalos con tiempos propuestos para graficar.");
    return;
  }

  puntosGrafico.sort((a, b) => a.orden - b.orden);
  elements.comparativa.innerHTML =
    '<p class="text-muted mb-0">El gráfico refleja la serie seleccionada en las sesiones elegidas.</p>';
  renderGraficoTiempos(puntosGrafico);
};

const cargarEntrenamientos = async () => {
  if (!atletaId) {
    if (elements.comparativa)
      elements.comparativa.innerHTML = '<p class="text-danger mb-0">Falta el id de atleta.</p>';
    renderGraficoTiempos([], "Falta el id de atleta.");
    renderGraficoKmsPlan([], "Falta el id de atleta.");
    renderGraficoKmsReal([], "Falta el id de atleta.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/entrenamientos_asignados/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error("No se pudieron obtener los entrenamientos.");
    const entrenos = await res.json();
    if (!Array.isArray(entrenos) || !entrenos.length) {
      if (elements.comparativa) {
        elements.comparativa.innerHTML =
          '<p class="text-muted mb-0">No hay entrenamientos asignados.</p>';
      }
      renderGraficoTiempos([], "No hay entrenamientos asignados para graficar.");
      renderGraficoKmsPlan([], "No hay kms previstos para graficar.");
      renderGraficoKmsReal([], "No hay kms reales para graficar.");
      return;
    }
    entrenamientosCargados = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    for (const ent of entrenos) {
      let pasos = [];
      try {
        const det = await fetch(
          `${API_BASE}/entrenamientos_asignados/${ent.id}/detalle`,
          {
            credentials: "include",
            headers: { Authorization: authHeader() }
          }
        );
        if (det.ok) {
          const flat = await det.json();
          pasos = buildTreeFromFlat(flat);
        }
      } catch (err) {
        console.warn("No se pudo obtener detalle de", ent.id, err);
      }
      const resultados = await obtenerResultados(ent.id);
      const zonasDeFecha = await obtenerZonasPorFecha(ent.fecha);
      entrenamientosCargados.push({
        ...ent,
        pasos,
        zonas: zonasDeFecha,
        _tieneResultados: Array.isArray(resultados) && resultados.length > 0
      });
    }
    const pendientes = entrenamientosCargados.filter((ent) => {
      const fecha = ent.fecha ? new Date(ent.fecha) : null;
      if (!fecha) return false;
      fecha.setHours(0, 0, 0, 0);
      return fecha < hoy && !ent._tieneResultados;
    });
    resumenSemana(entrenamientosCargados, pendientes, hoy);
    poblarSelectNombres();
    aplicarFiltro();
    await cargarKmsSemanales();
  } catch (err) {
    console.error("Error cargando entrenamientos:", err);
    if (elements.comparativa) {
      elements.comparativa.innerHTML =
        '<p class="text-danger mb-0">No se pudieron cargar los entrenamientos.</p>';
    }
    renderGraficoTiempos([], "No se pudieron cargar los datos para el gráfico.");
    renderGraficoKmsPlan([], "No se pudieron cargar los kms previstos.");
    renderGraficoKmsReal([], "No se pudieron cargar los kms reales.");
  }
};

const obtenerClaveSemana = (fecha) => {
  const base = new Date(fecha);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(0, 0, 0, 0);

  // Lunes de esa semana
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  // Clave igual que el backend: 'YYYY-MM-DD' (usando fecha local para evitar desfaces por zona horaria)
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const agruparKmsSemanalesLocal = () => {
  const mapa = new Map();

  entrenamientosCargados.forEach((ent) => {
    if (!ent.fecha) return;
    const clave = obtenerClaveSemana(ent.fecha);
    if (!clave) return;

    const lunes = new Date(clave);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);

    const ini = lunes.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const fin = domingo.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const label = `${ini}–${fin}`;

    const grupo =
      mapa.get(clave) || { semana: clave, label, planificados: 0, realizados: 0 };

    const plan =
      Number(ent.km_previstos ?? ent.kms_previstos ?? ent.km_totales ?? ent.kms_totales) || 0;

    const resultados = resultadosCache.get(ent.id) || [];
    const real =
      resultados.reduce((sum, r) => {
        if (r && typeof r.km_realizados_total === "number") return sum + r.km_realizados_total;
        if (r && typeof r.km_realizados === "number") return sum + r.km_realizados;
        return sum;
      }, 0) || 0;

    ent.resultados = resultados;
    grupo.planificados += plan;
    grupo.realizados += real;
    mapa.set(clave, grupo);
  });

  return Array.from(mapa.values()).sort((a, b) =>
    (a.semana || "").localeCompare(b.semana || "")
  );
};

const actualizarResumenKm = (kmsDatos) => {
  if (!elements.resumenKmPlan || !elements.resumenKmReal) return;

  const lista = Array.isArray(kmsDatos) ? kmsDatos : [];
  if (!lista.length) return;

  // 1️⃣ Cogemos la semana MÁS RECIENTE que no sea futura
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const semanasValidas = lista
    .filter(k => k.semana)
    .map(k => ({
      ...k,
      fechaLunes: new Date(k.semana)
    }))
    .filter(k => k.fechaLunes <= hoy)
    .sort((a, b) => b.fechaLunes - a.fechaLunes);

  if (!semanasValidas.length) {
    elements.resumenKmPlan.textContent = "—";
    elements.resumenKmReal.textContent = "—";
    return;
  }

  // 👉 ESTA es la semana “actual” real
  const registro = semanasValidas[0];

  const plan = Number(registro.planificados) || 0;
  const real = Number(registro.realizados) || 0;

  elements.resumenKmPlan.textContent = `${plan.toFixed(1)} km`;
  elements.resumenKmReal.textContent = `${real.toFixed(1)} km`;
};


async function cargarKmsSemanales() {
  if (!atletaId) {
    renderGraficoKmsPlan([], "Falta el id de atleta.");
    renderGraficoKmsReal([], "Falta el id de atleta.");
    return;
  }

const fetchKmsServidor = async () => {
  const res = await fetch(`${API_BASE}/analisis_atleta/${atletaId}`, {
    credentials: "include",
    headers: { Authorization: authHeader() }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};



  try {
    const data = await fetchKmsServidor();

if (Array.isArray(data.kms_semana) && data.kms_semana.length) {
  renderGraficoKmsPlan(data.kms_semana);
  renderGraficoKmsReal(data.kms_semana);
  actualizarResumenKm(data.kms_semana);
  ultimoZonasSemana = data.zonas_semana || null;
  renderResumenZonasSemana(ultimoZonasSemana);
  return; // ⛔ NO cálculo local
}

    // Si no hay datos útiles del servidor, usamos cálculo local
    const kmsLocal = agruparKmsSemanalesLocal();
    renderGraficoKmsPlan(kmsLocal, "No hay kms previstos para este atleta.");
    renderGraficoKmsReal(kmsLocal, "No hay kms reales para este atleta.");
    actualizarResumenKm(kmsLocal);
    ultimoZonasSemana = null;
    renderResumenZonasSemana(null);
  } catch (err) {
    console.warn("No se pudieron cargar kms del servidor, usando cálculo local.", err);
    const kmsLocal = agruparKmsSemanalesLocal();
    renderGraficoKmsPlan(kmsLocal, "No se pudieron cargar los kms previstos.");
    renderGraficoKmsReal(kmsLocal, "No se pudieron cargar los kms reales.");
    actualizarResumenKm(kmsLocal);
    ultimoZonasSemana = null;
    renderResumenZonasSemana(null);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (elements.resumenZonasFuente) {
    elements.resumenZonasFuente.addEventListener("change", () => {
      renderResumenZonasSemana(ultimoZonasSemana || null);
    });
  }
  if (elements.resumenZonasMetrica) {
    elements.resumenZonasMetrica.addEventListener("change", () => {
      renderResumenZonasSemana(ultimoZonasSemana || null);
    });
  }
  if (elements.resumenZonasRecalcular) {
    elements.resumenZonasRecalcular.addEventListener("click", recalcularZonasSemana);
  }
  await cargarAtleta();
  await cargarZonas();
  await cargarEntrenamientos();
});
