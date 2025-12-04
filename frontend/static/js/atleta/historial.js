import { API, getAtletaId, fetchJSON, authHeader, getCsrfToken } from "./api.js";
import { buildTreeFromFlat, renderPasos, calcularTiempoDesdeZona } from "./pasos.js";

const lista = document.getElementById("historial-lista");
const template = document.getElementById("historial-item-template");
const btnPendientes = document.getElementById("btn-filtrar-pendientes");
const kmInput = document.getElementById("km-realizados");
const kmHelper = document.getElementById("km-realizados-helper");
const resultadosCache = new Map();
let feedbacksEnviados = new Set();
const entrenamientosPorId = new Map();

const modalEl = document.getElementById("modalRegistrarTiempos");
const listaIntervalos = document.getElementById("lista-intervalos-tiempos");
const comentarioInput = document.getElementById("comentario-feedback");
const btnGuardarTiempos = document.getElementById("btn-guardar-tiempos");
const modalTitulo = modalEl?.querySelector(".modal-title");
const modalRegistrar = modalEl ? new window.bootstrap.Modal(modalEl) : null;
let entrenamientoActivo = null;

const hasAnchor = () => window.location.hash.startsWith("#entreno-");

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

const obtenerResultadosDetalle = async (entrenamientoId) => {
  if (resultadosCache.has(entrenamientoId)) {
    return resultadosCache.get(entrenamientoId);
  }
  try {
    const datos = await fetchJSON(
      `${API}/entrenamientos_asignados/${entrenamientoId}/resultados`
    );
    if (Array.isArray(datos) && datos.length) {
      resultadosCache.set(entrenamientoId, datos);
    } else if (datos && datos.km_realizados_total) {
      resultadosCache.set(entrenamientoId, [datos]);
    } else {
      resultadosCache.set(entrenamientoId, Array.isArray(datos) ? datos : []);
    }
    return resultadosCache.get(entrenamientoId);
  } catch (err) {
    console.warn("No se pudieron obtener resultados", entrenamientoId, err);
    resultadosCache.set(entrenamientoId, []);
    return [];
  }
};

const obtenerResultadosEstado = async (entrenamientoId) => {
  const datos = await obtenerResultadosDetalle(entrenamientoId);
  if (!Array.isArray(datos)) return false;
  if (datos.length > 0) return true;
  return Boolean(datos.find?.((d) => d?.km_realizados_total));
};

const parseFecha = (valor) => {
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

const itemFecha = (item) => (item.fechaObj ? item.fechaObj.getTime() : 0);

let zonasAtleta = null;

const cargarZonasAtleta = async (atletaId) => {
  try {
    zonasAtleta = await fetchJSON(`${API}/zonas_atleta/${atletaId}`);
  } catch (err) {
    zonasAtleta = null;
  }
};

const abrirModalEdicion = async (entrenamientoId) => {
  if (!modalRegistrar || !listaIntervalos) return;
  const entrenamiento = entrenamientosPorId.get(entrenamientoId);
  if (!entrenamiento) return;
  entrenamientoActivo = entrenamiento;
  if (modalTitulo) {
    modalTitulo.textContent = `Registrar tiempos - ${entrenamiento.nombre || "Entrenamiento"}`;
  }

  let resultadosPrevios = [];
  try {
    resultadosPrevios = await obtenerResultadosDetalle(entrenamientoId);
  } catch (err) {
    console.warn("No se pudieron precargar los resultados", err);
  }

  const kmPrevistos = Number(entrenamiento.km_previstos || entrenamiento.km_totales || 0);
  const kmRealizadosPrev = (resultadosPrevios || []).reduce(
    (sum, res) => sum + (Number(res.km_realizados) || 0),
    0
  );
  const series = construirSeriesDesdePasos(entrenamiento.pasos || []);
  renderLineasRegistro(series, resultadosPrevios, kmPrevistos, kmRealizadosPrev);
  if (comentarioInput) comentarioInput.value = "";
  modalRegistrar.show();
};

modalEl?.addEventListener("hidden.bs.modal", () => {
  entrenamientoActivo = null;
  if (listaIntervalos) listaIntervalos.innerHTML = "";
  if (comentarioInput) comentarioInput.value = "";
  if (kmInput) kmInput.value = "";
  if (kmHelper) kmHelper.textContent = "Introduce el volumen real completado.";
});

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
  const recorrer = (paso, stack = []) => {
    if (!paso) return;
    if (paso.tipo_paso === "repeat") {
      const reps = Number(paso.repeticiones) || 1;
      for (let r = 1; r <= reps; r += 1) {
        (paso.subpasos || []).forEach((sub) => recorrer(sub, [...stack, r]));
      }
      return;
    }
    if (paso.tipo_paso === "interval") {
      const repeticion = stack.length ? stack[stack.length - 1] : 1;
      resultado.push({
        pasoId: paso.id,
        repeticion,
        distancia: paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—",
        tiempoObjetivo: calcularTiempoDesdeZona(paso, zonasAtleta),
        descripcion: paso.descripcion || ""
      });
      return;
    }
    (paso.subpasos || []).forEach((sub) => recorrer(sub, stack));
  };

  (pasos || []).forEach((p) => recorrer(p));
  return resultado.map((serie, index) => ({ ...serie, indice: index + 1 }));
};

const renderLineasRegistro = (series, resultadosPrevios = [], kmPrevistos = 0, kmRealizados = 0) => {
  if (!listaIntervalos) return;
  listaIntervalos.innerHTML = "";
  if (!series.length) {
    listaIntervalos.innerHTML =
      '<p class="text-muted mb-0">Este entrenamiento no tiene intervalos detallados.</p>';
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
const renderCard = (ent) => {
  const clone = template.content.cloneNode(true);
  const article = clone.querySelector("article");
  article.id = `entreno-${ent.id}`;
  clone.querySelector(".entrenamiento-nombre").textContent = ent.nombre || "Entrenamiento";
  clone.querySelector(".entrenamiento-objetivo").textContent =
    [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "—";
  clone.querySelector(".entrenamiento-fecha").textContent = ent.fecha
    ? new Date(ent.fecha).toLocaleDateString("es-ES")
    : "--/--/----";
  const completado = Boolean(ent.estadoRegistro?.completado);
  const observacion = completado
    ? "Tiempos y feedback registrados."
    : "Aún no has registrado los tiempos o feedback.";
  clone.querySelector(".historial-observaciones").textContent = observacion;

  const statusChip = document.createElement("span");
  statusChip.className = `chip ${completado ? "chip-success" : "chip-warning"}`;
  statusChip.textContent = completado ? "Completado" : "Pendiente";
  clone.querySelector(".training-card__header-main")?.appendChild(statusChip);
  const card = clone.querySelector(".training-card");
  if (completado) {
    card?.classList.add("training-card--completed");
  } else {
    card?.classList.add("training-card--pending");
  }

  const bloquesEl =
    clone.querySelector(".training-card-blocks") || clone.querySelector(".bloques-preview");
  if (bloquesEl) {
    bloquesEl.innerHTML = renderPasos(ent.pasos || [], zonasAtleta);
  }
  const btnRegistrar = clone.querySelector(".btn-registrar");
  if (btnRegistrar) {
    btnRegistrar.textContent = completado ? "Editar tiempos" : "Registrar tiempos";
    btnRegistrar.addEventListener("click", () => abrirModalEdicion(ent.id));
  }
  clone.querySelector(".btn-ver-feedback").addEventListener("click", () => {
    window.location.href = "feedbacks.html";
  });
  return clone;
};

const cargarHistorial = async (soloPendientes = false) => {
  const atletaId = getAtletaId();
  if (!atletaId) {
    lista.innerHTML =
      '<div class="alert alert-warning">Vuelve a iniciar sesión para ver tus datos.</div>';
    return;
  }
  lista.innerHTML = '<p class="text-muted mb-0">Cargando historial...</p>';
  try {
    await cargarZonasAtleta(atletaId);
    const entrenos = await fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`);
    feedbacksEnviados = await obtenerFeedbacksSet();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const estados = await Promise.all(
      entrenos.map(async (ent) => {
        let pasos = [];
        try {
          const flat = await fetchJSON(
            `${API}/entrenamientos_asignados/${ent.id}/detalle`
          );
          pasos = buildTreeFromFlat(flat);
        } catch {
          pasos = [];
        }

        const tieneResultados = await obtenerResultadosEstado(ent.id);
        const tieneFeedback = feedbacksEnviados.has(Number(ent.id));
        const completado = tieneResultados && tieneFeedback;
        const fechaObj = parseFecha(ent.fecha);
        const esPasado = fechaObj ? fechaObj < hoy : false;

        return {
          ent: {
            ...ent,
            pasos,
            estadoRegistro: {
              tieneResultados,
              tieneFeedback,
              completado
            }
          },
          mostrar: esPasado || completado,
          pendiente: !completado,
          fechaObj
        };
      })
    );

    const visibles = estados
      .filter((item) => item.mostrar)
      .sort((a, b) => itemFecha(b) - itemFecha(a));

    const filtrados = soloPendientes
      ? visibles.filter((item) => item.pendiente)
      : visibles;

    if (!filtrados.length) {
      lista.innerHTML = '<p class="text-muted mb-0">Sin entrenamientos.</p>';
      return;
    }

    lista.innerHTML = "";
    entrenamientosPorId.clear();
    filtrados.forEach(({ ent }) => {
      entrenamientosPorId.set(ent.id, ent);
      lista.appendChild(renderCard(ent));
    });

    if (hasAnchor()) {
      const objetivo = document.querySelector(window.location.hash);
      objetivo?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (err) {
    console.error("Error al cargar historial:", err);
    lista.innerHTML =
      '<div class="alert alert-danger">No se pudo cargar el historial.</div>';
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cargarHistorial();
  btnPendientes?.addEventListener("click", () => {
    const soloPendientes = btnPendientes.dataset.mode !== "pendientes";
    btnPendientes.dataset.mode = soloPendientes ? "pendientes" : "todos";
    btnPendientes.textContent = soloPendientes
      ? "Mostrar todos"
      : "Mostrar solo pendientes";
    cargarHistorial(soloPendientes);
  });
});

btnGuardarTiempos?.addEventListener("click", async () => {
  if (!entrenamientoActivo || !listaIntervalos) return;
  const inputs = Array.from(listaIntervalos.querySelectorAll("input[data-paso-id]"));
  const comentario = comentarioInput?.value.trim();
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

  btnGuardarTiempos.disabled = true;
  btnGuardarTiempos.textContent = "Guardando...";

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
    resultadosCache.set(entrenamientoActivo.id, seriesPayload);

    if (comentario) {
      await enviarFeedback(entrenamientoActivo.id, comentario);
    }

    alert("Tiempos actualizados correctamente");
    modalRegistrar?.hide();
    const soloPendientes = btnPendientes?.dataset.mode === "pendientes";
    cargarHistorial(soloPendientes);
  } catch (err) {
    console.error("Error al guardar tiempos:", err);
    alert(err.message || "No se pudieron guardar los tiempos");
  } finally {
    btnGuardarTiempos.disabled = false;
    btnGuardarTiempos.textContent = "Guardar tiempos";
  }
});
