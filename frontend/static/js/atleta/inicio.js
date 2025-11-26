import { API, getAtletaId, fetchJSON } from "./api.js";
import { buildTreeFromFlat, renderPasos } from "./pasos.js";

const listaProximos = document.getElementById("lista-proximos");
const listaPendientes = document.getElementById("lista-pendientes");
const nombreAtletaEl = document.getElementById("nombre-atleta");
const cardTemplate = document.getElementById("inicio-entrenamiento-card");

// NUEVOS: elementos del resumen semanal
const resumenSesionesEl = document.getElementById("resumen-semana-sesiones");
const resumenCompletadasEl = document.getElementById("resumen-semana-completadas");
const resumenPendientesEl = document.getElementById("resumen-semana-pendientes");
const resumenRangoEl = document.getElementById("resumen-semana-rango");
let zonasAtleta = null;

// dd/mm/yyyy
const formatearFecha = (valor) => {
  if (!valor) return "--/--/----";
  const fecha = new Date(valor);
  return fecha.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

// lunes, martes...
const formatearDia = (valor) => {
  if (!valor) return "";
  return new Date(valor).toLocaleDateString("es-ES", { weekday: "long" });
};

// Lunes como inicio de semana
const inicioDeSemana = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo, 1 = lunes, ...
  const diff = (day === 0 ? -6 : 1) - day; // mover a lunes
  d.setDate(d.getDate() + diff);
  return d;
};

const formatearRangoSemana = (inicio, fin) => {
  const ini = inicio.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit"
  });
  const f = fin.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit"
  });
  return `${ini} – ${f}`;
};

const hidratarEntrenamiento = async (ent) => {
  try {
    const detalle = await fetchJSON(
      `${API}/entrenamientos_asignados/${ent.id}/detalle`
    );
    return { ...ent, pasos: buildTreeFromFlat(detalle) };
  } catch (err) {
    console.warn("No se pudo cargar detalle del entrenamiento", ent.id, err);
    return { ...ent, pasos: [] };
  }
};

const renderCardEntreno = (ent, opciones = {}) => {
  if (!cardTemplate) return null;
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector("article");
  if (!card) return null;

  card.dataset.entrenamientoId = ent.id ?? "";

  const nombreEl = card.querySelector(".entrenamiento-nombre");
  if (nombreEl) nombreEl.textContent = ent.nombre || "Entrenamiento";

  const objetivoEl = card.querySelector(".entrenamiento-objetivo");
  if (objetivoEl) {
    objetivoEl.textContent = [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "—";
  }

  const fechaChip = card.querySelector(".entrenamiento-fecha");
  if (fechaChip) {
    const fechaSpan = fechaChip.querySelector("span");
    if (fechaSpan) fechaSpan.textContent = formatearFecha(ent.fecha);
    const diaSpan = fechaChip.querySelector(".entrenamiento-fecha-dayname");
    if (diaSpan) diaSpan.textContent = formatearDia(ent.fecha);
  }

  const estadoChip = card.querySelector(".entrenamiento-estado");
  if (estadoChip) {
    estadoChip.className = `chip entrenamiento-estado ${opciones.estadoChipClass || ""}`.trim();
    estadoChip.textContent = opciones.estadoLabel || "";
  }

  const bloquesEl =
    card.querySelector(".training-card-blocks") || card.querySelector(".bloques-preview");
  if (bloquesEl) {
    bloquesEl.innerHTML = renderPasos(ent.pasos || [], zonasAtleta);
  }

  if (opciones.cardClass) {
    card.classList.add(opciones.cardClass);
  }

  const actionBtn = card.querySelector("[data-role='primary-action']");
  if (actionBtn) {
    actionBtn.textContent = opciones.actionLabel || "Ver detalles";
    if (typeof opciones.onAction === "function") {
      actionBtn.addEventListener("click", opciones.onAction);
    } else {
      actionBtn.style.display = "none";
    }
  }

  return fragment;
};

const renderListaEntrenos = (destino, entrenos, obtenerOpciones, mensajeVacio) => {
  if (!destino) return;
  if (!Array.isArray(entrenos) || !entrenos.length) {
    destino.innerHTML = `<p class="text-muted mb-0">${mensajeVacio}</p>`;
    return;
  }
  destino.innerHTML = "";
  let agregados = 0;
  entrenos.forEach((ent) => {
    const opciones = typeof obtenerOpciones === "function" ? obtenerOpciones(ent) : {};
    const card = renderCardEntreno(ent, opciones);
    if (card) {
      destino.appendChild(card);
      agregados += 1;
    }
  });
  if (!agregados) {
    destino.innerHTML = `<p class="text-muted mb-0">${mensajeVacio}</p>`;
  }
};

// A partir de entrenos pasados, filtra los que NO tienen resultados guardados
const construirPendientes = async (pasados) => {
  const resultados = await Promise.all(
    pasados.map(async (ent) => {
      try {
        const datos = await fetchJSON(
          `${API}/entrenamientos_asignados/${ent.id}/resultados`
        );
        const tieneResultados = Array.isArray(datos) && datos.length > 0;
        return { entreno: ent, pendiente: !tieneResultados };
      } catch (e) {
        console.warn(
          "No se pudieron obtener resultados para el entrenamiento",
          ent.id,
          e
        );
        // Si falla la consulta, por prudencia lo marcamos como pendiente
        return { entreno: ent, pendiente: true };
      }
    })
  );

  return resultados
    .filter((r) => r.pendiente)
    .map((r) => r.entreno);
};

// Nuevo: actualizar resumen semanal (sesiones / completadas / pendientes)
const actualizarResumenSemana = (entrenos, pendientes, hoy) => {
  if (!resumenSesionesEl || !resumenCompletadasEl || !resumenPendientesEl) {
    return;
  }

  const inicioSemana = inicioDeSemana(hoy);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);

  if (resumenRangoEl) {
    resumenRangoEl.textContent = formatearRangoSemana(inicioSemana, finSemana);
  }

  const entrenosSemana = entrenos.filter((ent) => {
    if (!ent.fecha) return false;
    const f = new Date(ent.fecha);
    return f >= inicioSemana && f <= finSemana;
  });

  const idsPendientes = new Set((pendientes || []).map((e) => e.id));

  let completadas = 0;
  let pend = 0;

  entrenosSemana.forEach((ent) => {
    if (!ent.fecha) return;
    const f = new Date(ent.fecha);
    f.setHours(0, 0, 0, 0);

    // Sólo consideramos completadas/pendientes los días PASADOS respecto a hoy
    if (f < hoy) {
      if (idsPendientes.has(ent.id)) {
        pend += 1;
      } else {
        completadas += 1;
      }
    }
  });

  resumenSesionesEl.textContent = entrenosSemana.length.toString();
  resumenCompletadasEl.textContent = completadas.toString();
  resumenPendientesEl.textContent = pend.toString();
};

const cargarInicio = async () => {
  const atletaId = getAtletaId();

  if (!atletaId) {
    listaProximos.innerHTML =
      '<p class="text-danger mb-0">No se pudo identificar al atleta.</p>';
    listaPendientes.innerHTML =
      '<p class="text-danger mb-0">Inicia sesión nuevamente.</p>';
    return;
  }

  // 1) Cargar nombre del atleta para el hero
  try {
    const perfil = await fetchJSON(`${API}/perfil_atleta/${atletaId}`);
    if (nombreAtletaEl) {
      nombreAtletaEl.textContent = `Bienvenid@, ${
        perfil.nombre || "atleta"
      }`;
    }
  } catch (err) {
    console.warn("No se pudo cargar el perfil del atleta:", err);
  }

  // 2) Zonas del atleta para mostrar ritmos objetivo
  try {
    zonasAtleta = await fetchJSON(`${API}/zonas_atleta/${atletaId}`);
  } catch (err) {
    zonasAtleta = null;
    console.warn("No se pudieron cargar las zonas del atleta:", err);
  }

  // 3) Cargar entrenamientos asignados y separar futuros / pendientes
  try {
    const entrenos = await fetchJSON(
      `${API}/entrenamientos_asignados/${atletaId}`
    );

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Próximos (>= hoy), ordenados y limitados a 2
    const futuros = entrenos
      .filter((ent) => {
        if (!ent.fecha) return false;
        const f = new Date(ent.fecha);
        f.setHours(0, 0, 0, 0);
        return f >= hoy;
      })
      .sort(
        (a, b) =>
          new Date(a.fecha || hoy).getTime() -
          new Date(b.fecha || hoy).getTime()
      );

    const proximosDetallados = await Promise.all(
      futuros.slice(0, 2).map((ent) => hidratarEntrenamiento(ent))
    );
    renderListaEntrenos(
      listaProximos,
      proximosDetallados,
      (ent) => ({
        estadoLabel: "Próximo",
        cardClass: "training-card--pending",
        actionLabel: "Ver entrenamiento",
        onAction: () => {
          window.location.href = `entrenamientos.html#entreno-${ent.id}`;
        }
      }),
      "No hay entrenamientos publicados."
    );

    // Pasados (< hoy) para revisar si tienen resultados
    const pasados = entrenos.filter((ent) => {
      if (!ent.fecha) return false;
      const f = new Date(ent.fecha);
      f.setHours(0, 0, 0, 0);
      return f < hoy;
    });

    const pendientes = await construirPendientes(pasados);
    const pendientesDetallados = await Promise.all(
      pendientes.slice(0, 3).map((ent) => hidratarEntrenamiento(ent))
    );
    renderListaEntrenos(
      listaPendientes,
      pendientesDetallados,
      (ent) => ({
        estadoLabel: "Pendiente",
        estadoChipClass: "chip-warning",
        cardClass: "training-card--pending",
        actionLabel: "Registrar tiempos",
        onAction: () => {
          window.location.href = `entrenamientos.html#entreno-${ent.id}`;
        }
      }),
      "Todo al día. ¡Buen trabajo!"
    );

    // 🔹 Actualizar el mini-resumen semanal arriba
    actualizarResumenSemana(entrenos, pendientes, hoy);
  } catch (err) {
    console.error("Error al cargar entrenamientos:", err);
    listaProximos.innerHTML =
      '<p class="text-danger mb-0">No se pudieron cargar los entrenamientos.</p>';
    listaPendientes.innerHTML =
      '<p class="text-danger mb-0">No se pudo revisar el historial.</p>';

    if (resumenSesionesEl && resumenCompletadasEl && resumenPendientesEl) {
      resumenSesionesEl.textContent = "-";
      resumenCompletadasEl.textContent = "-";
      resumenPendientesEl.textContent = "-";
      if (resumenRangoEl) resumenRangoEl.textContent = "Semana actual";
    }
  }
};

document.addEventListener("DOMContentLoaded", cargarInicio);
