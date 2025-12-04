import { API, getAtletaId, fetchJSON, authHeader, getCsrfToken } from "./api.js";
import { buildTreeFromFlat, renderPasos, calcularTiempoDesdeZona } from "./pasos.js";

const contenedor = document.getElementById("entrenamientos-asignados");
const template = document.getElementById("entrenamiento-card-template");
const modalEl = document.getElementById("modalRegistrarTiempos");
const listaIntervalos = document.getElementById("lista-intervalos-tiempos");
const kmInput = document.getElementById("km-realizados");
const kmHelper = document.getElementById("km-realizados-helper");
const comentarioInput = document.getElementById("comentario-feedback");
const btnGuardarTiempos = document.getElementById("btn-guardar-tiempos");
const modalTitulo = modalEl?.querySelector(".modal-title");
const modalRegistrar = modalEl ? new window.bootstrap.Modal(modalEl) : null;

const resultadosCache = new Map();
let feedbacksEnviados = new Set();
const entrenamientosPorId = new Map();
let zonasAtleta = null;
let entrenamientoActivo = null;

const parseFechaAsignada = (valor) => {
  if (!valor) return null;
  const isoMatch = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const esMatch = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (esMatch) {
    const [_, d, m, y] = esMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(valor);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatearFechaAsignada = (valor) => {
  const fecha = parseFechaAsignada(valor);
  if (!fecha) return "--/--/----";
  return fecha.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

const obtenerFeedbacksSet = async () => {
  try {
    const datos = await fetchJSON(`${API}/mis_feedbacks`);
    return new Set(
      (datos || [])
        .map((fb) => Number(fb.entrenamiento_id))
        .filter((id) => !Number.isNaN(id))
    );
  } catch (err) {
    console.warn("No se pudieron cargar feedbacks enviados:", err);
    return new Set();
  }
};

const obtenerResultadosEstado = async (entrenamientoId) => {
  if (resultadosCache.has(entrenamientoId)) {
    return resultadosCache.get(entrenamientoId);
  }
  try {
    const datos = await fetchJSON(
      `${API}/entrenamientos_asignados/${entrenamientoId}/resultados`
    );
    const hay =
      (Array.isArray(datos) && datos.length > 0) ||
      Boolean(datos?.km_realizados_total);
    resultadosCache.set(entrenamientoId, hay);
    return hay;
  } catch (err) {
    console.warn("No se pudieron obtener resultados del entrenamiento", entrenamientoId, err);
    resultadosCache.set(entrenamientoId, false);
    return false;
  }
};

const cargarZonasAtleta = async (atletaId) => {
  try {
    zonasAtleta = await fetchJSON(`${API}/zonas_atleta/${atletaId}`);
  } catch {
    zonasAtleta = null;
  }
};

const formatearTiempoDesdeSeg = (seg) => {
  if (!Number.isFinite(seg)) return "";
  const total = Math.max(0, Math.round(seg));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

const autoFormatearValor = (valor) => {
  const digits = valor.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `0:${digits.padStart(2, "0")}`;
  const minutos = digits.slice(0, -2);
  const segundos = digits.slice(-2);
  return `${Number(minutos)}:${segundos.padStart(2, "0")}`;
};

const tiempoAsegundos = (valor) => {
  if (!valor) return null;
  const match = valor.match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const construirSeriesDesdePasos = (pasos) => {
  const resultado = [];
  const recorrer = (paso, repeatStack = []) => {
    if (!paso) return;
    if (paso.tipo_paso === "repeat") {
      const reps = Number(paso.repeticiones) || 1;
      for (let r = 1; r <= reps; r += 1) {
        (paso.subpasos || []).forEach((sub) => recorrer(sub, [...repeatStack, r]));
      }
      return;
    }
    if (paso.tipo_paso === "interval") {
      const repeticion = repeatStack.length ? repeatStack[repeatStack.length - 1] : 1;
      resultado.push({
        pasoId: paso.id,
        repeticion,
        distancia: paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—",
        tiempoObjetivo: calcularTiempoDesdeZona(paso, zonasAtleta),
        descripcion: paso.descripcion || ""
      });
      return;
    }
    (paso.subpasos || []).forEach((sub) => recorrer(sub, repeatStack));
  };

  (pasos || []).forEach((p) => recorrer(p));
  return resultado.map((serie, index) => ({ ...serie, indice: index + 1 }));
};

const renderLineasRegistro = (series, resultadosPrevios = [], kmPrevistos = 0, kmRealizados = 0) => {
  if (!listaIntervalos) return;
  listaIntervalos.innerHTML = "";

  if (!series.length) {
    listaIntervalos.innerHTML =
      '<p class="text-muted mb-0">Este entrenamiento no tiene intervalos para registrar.</p>';
    return;
  }

  const prevMap = new Map();
  resultadosPrevios.forEach((res) => {
    const key = `${res.paso_detalle_id}-${res.repeticion}`;
    prevMap.set(key, res);
  });

  series.forEach((serie) => {
    const key = `${serie.pasoId}-${serie.repeticion}`;
    const previo = prevMap.get(key);
    const valorPrevio = previo ? formatearTiempoDesdeSeg(previo.tiempo_real_seg) : "";

    const linea = document.createElement("div");
    linea.className =
      "registro-serie-line d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 border rounded-3 p-3";
    linea.innerHTML = `
      <div class="flex-grow-1">
        <div class="fw-semibold">
          Intervalo ${serie.indice}
          <span class="text-muted ms-2">Repetición ${serie.repeticion}</span>
        </div>
        <div class="text-muted small">
          ${serie.distancia}
          ${
            serie.tiempoObjetivo
              ? `· Objetivo ${serie.tiempoObjetivo}`
              : serie.descripcion
              ? `· ${serie.descripcion}`
              : ""
          }
        </div>
      </div>
      <div class="registro-serie-line__input">
        <label class="form-label small mb-1">Tiempo real</label>
        <input
          type="text"
          inputmode="numeric"
          class="form-control"
          placeholder="mm:ss"
          value="${valorPrevio}"
          data-paso-id="${serie.pasoId}"
          data-rep="${serie.repeticion}"
        />
      </div>
    `;

    const input = linea.querySelector("input");
    input.addEventListener("input", (event) => {
      event.target.value = autoFormatearValor(event.target.value);
    });
    listaIntervalos.appendChild(linea);
  });
  if (kmInput) {
    kmInput.value = kmRealizados
      ? Number(kmRealizados).toFixed(2).replace(/\.?0+$/, "")
      : "";
  }
  if (kmHelper) {
    kmHelper.textContent = kmPrevistos
      ? `Previstos: ${kmPrevistos} km. Introduce el volumen real completado.`
      : "Introduce el volumen real completado.";
  }
};

const abrirModalRegistro = async (entrenamientoId) => {
  if (!modalRegistrar || !listaIntervalos) return;
  const entrenamiento = entrenamientosPorId.get(entrenamientoId);
  if (!entrenamiento) return;

  entrenamientoActivo = entrenamiento;
  if (modalTitulo) {
    modalTitulo.textContent = `Registrar tiempos - ${entrenamiento.nombre || "Entrenamiento"}`;
  }

  let resultadosPrevios = [];
  try {
    resultadosPrevios = await fetchJSON(
      `${API}/entrenamientos_asignados/${entrenamientoId}/resultados`
    );
  } catch (err) {
    console.warn("No se pudieron cargar tiempos previos:", err);
  }
  const kmPrevistos = Number(entrenamiento.km_previstos || entrenamiento.km_totales || 0);
  const kmRealizadosPrev = (resultadosPrevios || []).reduce(
    (sum, res) => sum + (Number(res.km_realizados) || 0),
    0
  );
  const series = construirSeriesDesdePasos(entrenamiento.pasos || []);
  renderLineasRegistro(series, resultadosPrevios, kmPrevistos, kmRealizadosPrev);
  modalRegistrar.show();
};

modalEl?.addEventListener("hidden.bs.modal", () => {
  entrenamientoActivo = null;
  if (listaIntervalos) listaIntervalos.innerHTML = "";
  if (comentarioInput) comentarioInput.value = "";
  if (kmInput) kmInput.value = "";
  if (kmHelper) {
    kmHelper.textContent = "Introduce el volumen real completado.";
  }
});

const renderEntreno = (ent) => {
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector("article");
  if (!card) return;
  card.querySelector(".entrenamiento-nombre").textContent = ent.nombre || "Entrenamiento";
  card.querySelector(".entrenamiento-objetivo").textContent =
    [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "—";
  card.querySelector(".entrenamiento-fecha").textContent = formatearFechaAsignada(ent.fecha);
  const bloquesEl =
    card.querySelector(".training-card-blocks") || card.querySelector(".bloques-preview");
  if (bloquesEl) {
    bloquesEl.innerHTML = renderPasos(ent.pasos || [], zonasAtleta);
  }

  const statusChip = document.createElement("span");
  const completado = Boolean(ent.estadoRegistro?.completado);
  statusChip.className = `chip ${completado ? "chip-success" : "chip-warning"}`;
  statusChip.textContent = completado ? "Completado" : "Pendiente";
  card.querySelector(".training-card__header-main")?.appendChild(statusChip);

  const actionBtn = card.querySelector(".btn-abrir");
  if (completado) {
    card.classList.add("training-card--completed");
    actionBtn.textContent = "Ver historial";
    actionBtn.classList.remove("btn-outline-primary");
    actionBtn.classList.add("btn-outline-success");
    actionBtn.addEventListener("click", () => {
      window.location.href = `historial.html#entreno-${ent.id}`;
    });
  } else {
    actionBtn.textContent = "Registrar tiempos";
    actionBtn.addEventListener("click", () => abrirModalRegistro(ent.id));
    card.classList.add("training-card--pending");
  }

  contenedor.appendChild(clone);
};

const cargarEntrenamientos = async () => {
  const atletaId = getAtletaId();
  if (!atletaId) {
    contenedor.innerHTML =
      '<div class="alert alert-warning">No se pudo identificar al atleta.</div>';
    return;
  }
  try {
    entrenamientosPorId.clear();
    await cargarZonasAtleta(atletaId);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyTS = hoy.getTime();
    const entrenos = await fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`);
    feedbacksEnviados = await obtenerFeedbacksSet();
    const normalizados = entrenos.map((ent) => {
      const fecha = parseFechaAsignada(ent.fecha);
      return {
        ...ent,
        _fecha: fecha ? fecha.getTime() : null
      };
    });

    const futuros = normalizados
      .filter((ent) => ent._fecha === null || ent._fecha >= hoyTS)
      .sort((a, b) => {
        if (a._fecha === null && b._fecha === null) return 0;
        if (a._fecha === null) return 1;
        if (b._fecha === null) return -1;
        return a._fecha - b._fecha;
      });

    if (!futuros.length) {
      contenedor.innerHTML =
        '<div class="alert alert-info">Todavía no hay entrenamientos publicados.</div>';
      return;
    }

    contenedor.innerHTML = "";
    for (const ent of futuros) {
      try {
        const flat = await fetchJSON(`${API}/entrenamientos_asignados/${ent.id}/detalle`);
        ent.pasos = buildTreeFromFlat(flat);
      } catch (err) {
        console.warn("No se pudo cargar detalle", ent.id, err);
        ent.pasos = [];
      }
      const tieneResultados = await obtenerResultadosEstado(ent.id);
      const tieneFeedback = feedbacksEnviados.has(Number(ent.id));
      ent.estadoRegistro = {
        tieneResultados,
        tieneFeedback,
        completado: tieneResultados && tieneFeedback
      };
      entrenamientosPorId.set(ent.id, ent);
      renderEntreno(ent);
    }
  } catch (err) {
    console.error("Error al cargar entrenamientos:", err);
    contenedor.innerHTML =
      '<div class="alert alert-danger">No se pudieron cargar los entrenamientos.</div>';
  }
};

document.addEventListener("DOMContentLoaded", cargarEntrenamientos);

const enviarFeedback = async (entrenamientoId, comentario) => {
  if (!comentario) return;
  const csrf = await getCsrfToken();
  const response = await fetch(`${API}/feedback`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...(csrf ? { "X-CSRF-Token": csrf } : {})
    },
    body: JSON.stringify({
      entrenamiento_id: entrenamientoId,
      comentario
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "No se pudo enviar el feedback");
  }
  return data;
};

btnGuardarTiempos?.addEventListener("click", async () => {
  if (!entrenamientoActivo || !listaIntervalos) return;
  const comentario = comentarioInput?.value.trim();
  const inputs = Array.from(listaIntervalos.querySelectorAll("input[data-paso-id]"));
  let kmRealizadosValor = kmInput ? parseFloat(kmInput.value) : null;
  if (!Number.isFinite(kmRealizadosValor) || kmRealizadosValor < 0) {
    kmRealizadosValor = null;
  }

  const seriesPayload = [];
  inputs.forEach((input) => {
    const valor = input.value.trim();
    if (!valor) return;
    const segundos = tiempoAsegundos(valor);
    if (segundos === null) {
      input.classList.add("is-invalid");
    } else {
      input.classList.remove("is-invalid");
      seriesPayload.push({
        paso_detalle_id: Number(input.dataset.pasoId),
        repeticion: Number(input.dataset.rep) || 1,
        tiempo_real_seg: segundos
      });
    }
  });

  if (!seriesPayload.length && !kmRealizadosValor && !comentario) {
    alert("Introduce al menos un tiempo válido o los kilómetros realizados.");
    return;
  }

  if (btnGuardarTiempos) {
    btnGuardarTiempos.disabled = true;
    btnGuardarTiempos.textContent = "Guardando...";
  }

  try {
    const csrf = await getCsrfToken();
    const response = await fetch(
      `${API}/entrenamientos_asignados/${entrenamientoActivo.id}/resultados`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
          ...(csrf ? { "X-CSRF-Token": csrf } : {})
        },
        body: JSON.stringify({ series: seriesPayload, km_realizados: kmRealizadosValor })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "No se pudieron guardar los tiempos");
    }

    await enviarFeedback(entrenamientoActivo.id, comentario);
    resultadosCache.set(entrenamientoActivo.id, true);
    feedbacksEnviados.add(Number(entrenamientoActivo.id));

    alert(data?.message || "Tiempos y feedback enviados correctamente");
    modalRegistrar?.hide();
    await cargarEntrenamientos();
  } catch (err) {
    console.error("Error al guardar tiempos:", err);
    alert(err.message || "No se pudieron guardar los tiempos");
  } finally {
    if (btnGuardarTiempos) {
      btnGuardarTiempos.disabled = false;
      btnGuardarTiempos.textContent = "Guardar tiempos";
    }
  }
});
