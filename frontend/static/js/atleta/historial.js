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
const urlDatosInput = document.getElementById("url-datos");
const fitFileInput = document.getElementById("fit-file");
const fitOrigenSelect = document.getElementById("fit-origen");
const fitStatus = document.getElementById("fit-status");
const rpeInput = document.getElementById("rpe");
const rpeValor = document.getElementById("rpe-valor");
const rpeAyuda = document.getElementById("rpe-ayuda");
const sensacionSelect = document.getElementById("sensacion");
const fatigaSelect = document.getElementById("fatiga");
const dolorCheck = document.getElementById("dolor-check");
const zonaDolorSelect = document.getElementById("zona-dolor");
const zonaDolorWrapper = document.getElementById("zona-dolor-wrapper");
const completadoCheck = document.getElementById("completado");
const btnGuardarTiempos = document.getElementById("btn-guardar-tiempos");
const btnGuardarLabel = btnGuardarTiempos ? btnGuardarTiempos.textContent : "Guardar tiempos";
const modalTitulo = modalEl?.querySelector(".modal-title");
const modalRegistrar = modalEl ? new window.bootstrap.Modal(modalEl) : null;
const registroStatus = document.getElementById("registro-status");
const modalAnalisisEl = document.getElementById("modalAnalisisEntreno");
const modalAnalisis = modalAnalisisEl ? new window.bootstrap.Modal(modalAnalisisEl) : null;
const analisisBody = document.getElementById("analisis-entreno-body");
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

const textoRpe = (valor) => {
  const num = Number(valor);
  if (Number.isNaN(num)) return "—";
  if (num <= 3) return "Muy suave";
  if (num <= 6) return "Controlado";
  if (num <= 8) return "Exigente";
  return "Máximo";
};


const setRegistroStatus = (msg, type = "info") => {
  if (!registroStatus) return;
  registroStatus.textContent = msg;
  registroStatus.classList.remove("d-none", "registro-status--error", "registro-status--success");
  if (type === "error") registroStatus.classList.add("registro-status--error");
  if (type === "success") registroStatus.classList.add("registro-status--success");
};

const clearRegistroStatus = () => {
  if (!registroStatus) return;
  registroStatus.classList.add("d-none");
  registroStatus.textContent = "";
  registroStatus.classList.remove("registro-status--error", "registro-status--success");
};


const setGuardarLoading = (loading) => {
  if (!btnGuardarTiempos) return;
  if (loading) {
    btnGuardarTiempos.disabled = true;
    btnGuardarTiempos.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Guardando';
  } else {
    btnGuardarTiempos.disabled = false;
    btnGuardarTiempos.textContent = btnGuardarLabel || 'Guardar tiempos';
  }
};


const getRegistroGuardado = (entrenamientoId) => {
  try {
    const raw = localStorage.getItem(`registro_guardado_${entrenamientoId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const actualizarRpeUI = () => {
  if (!rpeInput || !rpeValor) return;
  const val = Number(rpeInput.value);
  rpeValor.textContent = Number.isNaN(val) ? "—" : `${val} · ${textoRpe(val)}`;
  if (rpeAyuda) {
    rpeAyuda.textContent =
      val >= 9
        ? "Sesión muy dura, vigila la recuperación."
        : val >= 7
          ? "Trabajo exigente, controla la carga semanal."
          : "Sesión controlada.";
  }
};

const toggleZonaDolor = () => {
  if (!zonaDolorWrapper || !dolorCheck) return;
  zonaDolorWrapper.classList.toggle("d-none", !dolorCheck.checked);
};

rpeInput?.addEventListener("input", actualizarRpeUI);
dolorCheck?.addEventListener("change", toggleZonaDolor);

const setFitStatus = (msg, tipo = 'info') => {
  if (!fitStatus) return;
  fitStatus.textContent = msg;
  fitStatus.classList.remove('text-muted', 'text-success', 'text-danger', 'text-warning');
  const mapa = { success: 'text-success', danger: 'text-danger', warning: 'text-warning', info: 'text-muted' };
  fitStatus.classList.add(mapa[tipo] || 'text-muted');
};

const registrarPlaceholderFit = async () => {
  if (!entrenamientoActivo) {
    setFitStatus('Selecciona un entrenamiento primero.', 'warning');
    return;
  }
  if (!fitFileInput || !fitFileInput.files || !fitFileInput.files[0]) {
    setFitStatus('Selecciona un archivo .fit', 'warning');
    return;
  }
  const file = fitFileInput.files[0];
  const formData = new FormData();
  formData.append('archivo', file);
  formData.append('origen', (fitOrigenSelect && fitOrigenSelect.value) || 'manual');
  try {
    setFitStatus('Registrando archivo...', 'info');
    const csrfToken = await getCsrfToken();
    await fetchJSON(`${API}/sesiones/${entrenamientoActivo.id}/archivo`, {
      method: 'POST',
      headers: {
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      body: formData
    });
    setFitStatus('Archivo registrado.', 'success');
  } catch (err) {
    console.error('Error registrando FIT:', err);
    setFitStatus('No se pudo registrar el archivo.', 'danger');
  }
};

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
  if (rpeInput) {
    rpeInput.value = rpeInput.value || 5;
    actualizarRpeUI();
  }
  toggleZonaDolor();
  if (completadoCheck) completadoCheck.checked = true;
  modalRegistrar.show();
};

modalEl?.addEventListener("hidden.bs.modal", () => {
  entrenamientoActivo = null;
  if (listaIntervalos) listaIntervalos.innerHTML = "";
  if (comentarioInput) comentarioInput.value = "";
  if (kmInput) kmInput.value = "";
  if (kmHelper) kmHelper.textContent = "Introduce el volumen real completado.";
  if (urlDatosInput) urlDatosInput.value = "";
  if (fitStatus) setFitStatus('Solo se guarda el placeholder, no el archivo.', 'info');
  if (fitFileInput) fitFileInput.value = "";
  if (fitOrigenSelect) fitOrigenSelect.value = 'garmin';
  if (rpeInput) {
    rpeInput.value = "";
    actualizarRpeUI();
  }
  if (sensacionSelect) sensacionSelect.value = "";
  if (fatigaSelect) fatigaSelect.value = "";
  if (dolorCheck) {
    dolorCheck.checked = false;
    toggleZonaDolor();
  }
  if (zonaDolorSelect) zonaDolorSelect.value = "";
  if (completadoCheck) completadoCheck.checked = true;
});

const construirPayloadFeedback = () => {
  const rawRpe = rpeInput?.value;
  const rpeVal = rawRpe === "" ? null : Number(rawRpe);
  return {
    comentario: comentarioInput?.value.trim() || "",
    url_datos: urlDatosInput?.value?.trim() || null,
    rpe: Number.isFinite(rpeVal) ? rpeVal : null,
    sensacion: sensacionSelect?.value || null,
    fatiga: fatigaSelect?.value || null,
    dolor: !!dolorCheck?.checked,
    zona_dolor: dolorCheck?.checked ? zonaDolorSelect?.value || null : null,
    completado: completadoCheck ? !!completadoCheck.checked : true
  };
};

const tieneDatosFeedback = (fb) => {
  if (!fb) return false;
  return Boolean(
    fb.comentario ||
      fb.url_datos ||
      Number.isFinite(fb.rpe) ||
      fb.sensacion ||
      fb.fatiga ||
      fb.dolor ||
      fb.zona_dolor ||
      fb.completado === false
  );
};

const enviarFeedback = async (entrenamientoId, payload) => {
  if (!payload || !tieneDatosFeedback(payload)) return;
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
      ...payload
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "No se pudo enviar el feedback");
  }
};

const formatoRitmoSegKm = (seg) => {
  if (seg == null) return "—";
  const total = Number(seg);
  if (Number.isNaN(total) || total <= 0) return "—";
  const minutos = Math.floor(total / 60);
  const segundos = Math.round(total % 60);
  return `${minutos}:${String(segundos).padStart(2, "0")} /km`;
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

const formatoTiempoZona = (seg) => {
  if (seg == null) return "—";
  const total = Number(seg);
  if (Number.isNaN(total)) return "—";
  if (total <= 0) return "0:00";
  const min = Math.floor(total / 60);
  const sec = Math.round(total % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
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
    const resumen = await fetchJSON(`${API}/entrenamientos_asignados/${entrenamientoId}/resumen_zonas?fuente=${fuente}`);
    contenedor.innerHTML = renderTablaZonas(resumen, label);
  } catch (err) {
    contenedor.innerHTML = `<div class="text-muted small">Sin datos de zonas (${label}).</div>`;
  }
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

const renderAnalisis = (entrenamiento, data) => {
  if (!analisisBody) return;
  const plan = data.plan || {};
  const real = data.real || {};

  const planKm = plan.km != null ? `${Number(plan.km).toFixed(2)} km` : '—';
  const realKm = real.km != null ? `${Number(real.km).toFixed(2)} km` : '—';
  const planDur = formatearTiempoDesdeSeg(plan.duracion_seg);
  const realDur = formatearTiempoDesdeSeg(real.duracion_seg);
  const planRitmo = formatoRitmoSegKm(plan.ritmo_seg_km);
  const realRitmo = formatoRitmoSegKm(real.ritmo_seg_km);
  const realFc = real.fc_media || real.fc_max ? `${real.fc_media ?? '—'} / ${real.fc_max ?? '—'} bpm` : '—';
  const realCad = real.cadencia_media != null ? `${Number(real.cadencia_media).toFixed(0)} spm` : '—';
  const planZonas = plan.zonas && plan.zonas.length
    ? `<div class="mt-1">${plan.zonas.map((z) => `<span class=\"chip chip-info me-1\">Z${z.zona}: ${z.repeticiones}</span>`).join('')}</div>`
    : '<div class="text-muted small mt-1">Sin zonas planificadas.</div>';

  analisisBody.innerHTML = `
    <div class="mb-3">
      <h5 class="mb-1">${entrenamiento?.nombre || 'Entrenamiento'}</h5>
      <div class="text-muted">${entrenamiento?.fecha ? new Date(entrenamiento.fecha).toLocaleDateString('es-ES') : ''}</div>
    </div>
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
    <div class="mt-3">
      <h6>Tiempo en zonas (plan vs real)</h6>
      <div id="analisis-zonas-ritmo" class="mb-3"></div>
      <div id="analisis-zonas-fc"></div>
    </div>
  `;
};

const cargarAnalisis = async (entrenamientoId) => {
  const entrenamiento = entrenamientosPorId.get(entrenamientoId);
  if (!entrenamiento) return;
  try {
    const data = await fetchJSON(`${API}/entrenamientos_asignados/${entrenamientoId}/comparativa`);
    renderAnalisis(entrenamiento, data);
    cargarResumenZonas(entrenamientoId, "ritmo", "analisis-zonas-ritmo", "Ritmo");
    cargarResumenZonas(entrenamientoId, "fc", "analisis-zonas-fc", "FC");
    modalAnalisis?.show();
  } catch (err) {
    console.error('Error al cargar análisis:', err);
    alert('No se pudo cargar el análisis del entrenamiento.');
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
  const guardado = getRegistroGuardado(ent.id);
  statusChip.className = `chip ${completado ? "chip-success" : "chip-warning"}`;
  statusChip.textContent = completado ? "Completado" : "Pendiente";
  clone.querySelector(".training-card__header-main")?.appendChild(statusChip);
  const card = clone.querySelector(".training-card");
  if (guardado && !completado) {
    const savedChip = document.createElement("span");
    savedChip.className = "chip chip-success ms-2";
    savedChip.textContent = "Guardado";
    card.querySelector(".training-card__header-main")?.appendChild(savedChip);
  }

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
  const btnAnalisis = clone.querySelector(".btn-ver-analisis");
  if (btnAnalisis) {
    btnAnalisis.addEventListener("click", () => cargarAnalisis(ent.id));
  }
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
  const feedbackPayload = construirPayloadFeedback();
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

  const invalidInputs = [];
  const invalidTimes = Array.from(document.querySelectorAll('#lista-intervalos-tiempos input')).filter((input) => {
    if (!input.value) return false;
    return !/^\d+:([0-5]\d)$/.test(input.value);
  });
  invalidTimes.forEach((input) => input.classList.add('is-invalid'));
  if (invalidTimes.length) {
    invalidInputs.push('Revisa el formato de tiempos (mm:ss).');
  }
  if (Number.isFinite(kmRealizadosValor) && kmRealizadosValor < 0) {
    kmInput?.classList.add('is-invalid');
    invalidInputs.push('Los kilómetros no pueden ser negativos.');
  }
  if (invalidInputs.length) {
    setRegistroStatus(invalidInputs[0], 'error');
    return;
  }
  const hayResultados = seriesPayload.length > 0 || Number.isFinite(kmRealizadosValor);
  const hayFeedback = tieneDatosFeedback(feedbackPayload);
  const hayFit = Boolean(fitFileInput?.files?.[0]);

  if (!hayResultados && !hayFeedback && !hayFit) {
    setRegistroStatus("Añade tiempos/km, adjunta un .fit o completa algún campo de feedback para enviar.", "error");
    return;
  }

  btnGuardarTiempos.disabled = true;
  btnGuardarTiempos.textContent = "Guardando...";

  try {
    if (hayResultados) {
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
          body: JSON.stringify({
            series: seriesPayload,
            km_realizados: Number.isFinite(kmRealizadosValor) ? kmRealizadosValor : null
          })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron guardar los tiempos");
      }
      resultadosCache.set(entrenamientoActivo.id, seriesPayload);
    }

    if (hayFeedback) {
      await enviarFeedback(entrenamientoActivo.id, feedbackPayload);
      feedbacksEnviados.add(Number(entrenamientoActivo.id));
    }

    if (hayFit) {
      await registrarPlaceholderFit();
    }

    const mensaje =
      hayResultados && hayFeedback
        ? "Tiempos y feedback enviados correctamente"
        : hayResultados
          ? "Tiempos guardados correctamente"
          : hayFeedback
            ? "Feedback enviado correctamente"
            : "Archivo FIT registrado correctamente";

    setRegistroStatus(mensaje, "success");
    try {
      const key = `registro_guardado_${entrenamientoActivo.id}`;
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), msg: mensaje }));
    } catch (_) {}
    modalRegistrar?.hide();
    const soloPendientes = btnPendientes?.dataset.mode === "pendientes";
    cargarHistorial(soloPendientes);
  } catch (err) {
    console.error("Error al guardar tiempos:", err);
    alert(err.message || "No se pudieron guardar los tiempos");
  } finally {
    setGuardarLoading(false);
  }
});


