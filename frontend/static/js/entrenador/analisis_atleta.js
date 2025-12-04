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
  graficoKmsRealEstado: document.getElementById("grafico-kms-real-estado")
};

let entrenamientosCargados = [];
let zonasAtleta = null;
const resultadosCache = new Map();
let graficoLineas = null;
let graficoKmsPlan = null;
let graficoKmsReal = null;

const formatearFecha = (valor) => {
  if (!valor) return "--/--/----";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return valor;
  return date.toLocaleDateString("es-ES");
};

const formatearTiempo = (segundos) => {
  if (!Number.isFinite(segundos) || segundos <= 0) return "—";
  const total = Math.round(segundos);
  const minutos = Math.floor(total / 60);
  const seg = total % 60;
  return `${minutos}:${String(seg).padStart(2, "0")}`;
};

const parseSegundos = (valor) => {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const mmss = texto.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const numero = Number(texto.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
};

const resumenSemana = (entrenos, pendientes, hoy) => {
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); // lunes
  inicioSemana.setHours(0, 0, 0, 0);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);

  const rango =
    elements.resumenRango ||
    elements.resumenSesiones ||
    elements.resumenCompletadas ||
    elements.resumenPendientes;
  if (elements.resumenRango) {
    const ini = inicioSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const fin = finSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    elements.resumenRango.textContent = `${ini} – ${fin}`;
  }

  const idsPend = new Set((pendientes || []).map((e) => e.id));
  const entrenosSemana = entrenos.filter((ent) => {
    if (!ent.fecha) return false;
    const f = new Date(ent.fecha);
    return f >= inicioSemana && f <= finSemana;
  });

  let completadas = 0;
  let pend = 0;
  entrenosSemana.forEach((ent) => {
    if (!ent.fecha) return;
    const f = new Date(ent.fecha);
    f.setHours(0, 0, 0, 0);
    if (f < hoy) {
      if (idsPend.has(ent.id)) pend += 1;
      else completadas += 1;
    }
  });

  if (elements.resumenSesiones) elements.resumenSesiones.textContent = `${entrenosSemana.length}`;
  if (elements.resumenCompletadas) elements.resumenCompletadas.textContent = `${completadas}`;
  if (elements.resumenPendientes) elements.resumenPendientes.textContent = `${pend}`;
  if (elements.resumenKmPlan) elements.resumenKmPlan.textContent = `—`;
  if (elements.resumenKmReal) elements.resumenKmReal.textContent = `—`;
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
  const seleccionado = elements.filtroNombre?.value || "todos";
  const filtrados =
    seleccionado === "todos"
      ? entrenamientosCargados
      : entrenamientosCargados.filter((e) => (e.nombre || "").trim() === seleccionado);

  renderComparativa(filtrados);
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

  const opciones = ['<option value="todos">Todos los entrenamientos</option>'].concat(
    nombres.map((n) => `<option value="${n}">${n}</option>`)
  );
  elements.filtroNombre.innerHTML = opciones.join("");
  elements.filtroNombre.onchange = aplicarFiltro;
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
    elements.graficoEstado.hidden = false;
    return;
  }

  const datosValidos = (puntos || []).filter(
    (p) => Number.isFinite(p.objetivoSeg) || Number.isFinite(p.realSeg)
  );

  if (!datosValidos.length) {
    elements.graficoEstado.textContent =
      mensajeVacio ||
      "No hay datos numéricos para graficar. Completa entrenamientos con tiempos reales.";
    elements.graficoEstado.hidden = false;
    return;
  }

  const labels = datosValidos.map((p) => p.etiqueta);
  const distancias = datosValidos.map((p) => p.distancia || "—");
  const propuestos = datosValidos.map((p) => (Number.isFinite(p.objetivoSeg) ? p.objetivoSeg : null));
  const reales = datosValidos.map((p) => (Number.isFinite(p.realSeg) ? p.realSeg : null));

  elements.graficoEstado.hidden = true;

  graficoLineas = new Chart(elements.graficoCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Tiempo propuesto",
          data: propuestos,
          distancias,
          tension: 0.3,
          borderColor: "#0d6efd",
          backgroundColor: "rgba(13, 110, 253, 0.08)",
          fill: false,
          spanGaps: true
        },
        {
          label: "Tiempo real",
          data: reales,
          distancias,
          tension: 0.3,
          borderColor: "#198754",
          backgroundColor: "rgba(25, 135, 84, 0.12)",
          fill: false,
          spanGaps: true
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
              const dist = ctx.dataset.distancias?.[ctx.dataIndex];
              return dist ? `${ctx.dataset.label}: ${tiempo} · ${dist}` : `${ctx.dataset.label}: ${tiempo}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Fecha" }
        },
        y: {
          title: { display: true, text: "Tiempo (mm:ss)" },
          ticks: {
            callback: (val) => formatearTiempo(val)
          },
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

  const labels = data.map((d) => d.label || d.semana || "");
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

  const labels = data.map((d) => d.label || d.semana || "");
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
  if (!entrenos.length) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">Selecciona un entrenamiento para ver los tiempos.</p>';
    renderGraficoTiempos([], "Selecciona un entrenamiento para ver el gráfico.");
    return;
  }

  const puntosGrafico = [];
  let tieneIntervalos = false;
  for (const ent of entrenos) {
    const resultados = await obtenerResultados(ent.id);
    const intervalos = extraerIntervalos(ent.pasos || [], zonasAtleta);
    if (intervalos.length) tieneIntervalos = true;
    const fechaObj = ent.fecha ? new Date(ent.fecha) : null;
    const fechaEtiqueta = formatearFecha(ent.fecha);
    const fechaOrden = fechaObj && !Number.isNaN(fechaObj.getTime()) ? fechaObj.getTime() : null;
    intervalos.forEach((item) => {
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
          distancia: item.distancia
        });
      }
    });
  }

  if (!tieneIntervalos) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">No hay intervalos con zona definida en estos entrenamientos.</p>';
    renderGraficoTiempos([], "No hay intervalos con tiempos propuestos para graficar.");
    return;
  }

  puntosGrafico.sort((a, b) => a.orden - b.orden);
  elements.comparativa.innerHTML =
    '<p class="text-muted mb-0">El gráfico refleja los intervalos de este entrenamiento.</p>';
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
      entrenamientosCargados.push({
        ...ent,
        pasos,
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
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const semanaClave = obtenerClaveSemana(hoy);
  const registro = (kmsDatos || []).find((k) => k.semana === semanaClave);
  if (registro) {
    elements.resumenKmPlan.textContent = `${(Number(registro.planificados) || 0).toFixed(1)} km`;
    elements.resumenKmReal.textContent = `${(Number(registro.realizados) || 0).toFixed(1)} km`;
  } else {
    elements.resumenKmPlan.textContent = "0 km";
    elements.resumenKmReal.textContent = "0 km";
  }
};

async function cargarKmsSemanales() {
  if (!atletaId) {
    renderGraficoKmsPlan([], "Falta el id de atleta.");
    renderGraficoKmsReal([], "Falta el id de atleta.");
    return;
  }

  const fetchKmsServidor = async () => {
    const url = `${API_BASE}/analisis_atleta/${atletaId}`;
    const res = await fetch(url, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const kms = Array.isArray(data?.kms_semana) ? data.kms_semana : [];
    return kms;
  };

  try {
    const kms = await fetchKmsServidor();
    if (kms && kms.length) {
      renderGraficoKmsPlan(kms, "No hay kms previstos para este atleta.");
      renderGraficoKmsReal(kms, "No hay kms reales para este atleta.");
      actualizarResumenKm(kms);
      return;
    }
    throw new Error("Sin datos de kms en servidor");
  } catch (err) {
    console.warn("No se pudieron cargar kms del servidor, usando cálculo local.", err);
    renderGraficoKmsPlan([], "No se pudieron cargar los kms previstos.");
    renderGraficoKmsReal([], "No se pudieron cargar los kms reales.");
    actualizarResumenKm([]);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  cargarAtleta();
  cargarZonas();
  cargarEntrenamientos();
});
