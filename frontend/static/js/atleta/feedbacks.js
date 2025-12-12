import { API, fetchJSON } from "./api.js";

const lista = document.getElementById("lista-feedbacks");
const template = document.getElementById("feedback-card-template");

const textoRpe = (valor) => {
  const num = Number(valor);
  if (Number.isNaN(num)) return "";
  if (num <= 3) return "Muy suave";
  if (num <= 6) return "Controlado";
  if (num <= 8) return "Exigente";
  return "Máximo";
};

const chipRpe = (rpe) => {
  if (!Number.isFinite(Number(rpe))) return "";
  const valor = Number(rpe);
  const clase = valor >= 9 ? "chip-danger" : valor >= 7 ? "chip-warning" : "chip-success";
  return `<span class="chip ${clase}">RPE ${valor} · ${textoRpe(valor)}</span>`;
};

const iconoSensacion = (valor) => {
  const mapa = {
    "muy bien": "😄",
    bien: "🙂",
    normal: "😐",
    mal: "😖"
  };
  const val = (valor || "").toLowerCase();
  return mapa[val] ? `${mapa[val]} ${valor}` : valor;
};

const chipFatiga = (valor) => {
  if (!valor) return "";
  const val = (valor || "").toLowerCase();
  const clase = val === "alta" ? "chip-danger" : val === "media" ? "chip-warning" : "chip-success";
  return `<span class="chip ${clase}">Fatiga ${valor}</span>`;
};

const renderResumen = (fb) => {
  const bloques = [];
  const rpe = chipRpe(fb.rpe);
  if (rpe) bloques.push(rpe);
  const sensacion = fb.sensacion ? `<span class="chip chip-soft">${iconoSensacion(fb.sensacion)}</span>` : "";
  if (sensacion) bloques.push(sensacion);
  const fatiga = chipFatiga(fb.fatiga);
  if (fatiga) bloques.push(fatiga);
  if (fb.dolor) {
    bloques.push(
      `<span class="chip chip-danger">⚠️ Dolor${fb.zona_dolor ? `: ${fb.zona_dolor}` : ""}</span>`
    );
  }
  const incompleto = fb.completado === 0 || fb.completado === false;
  if (incompleto) {
    bloques.push('<span class="chip chip-muted">Entreno no completado</span>');
  }
  return bloques.join(" ");
};

const renderFeedback = (fb) => {
  const clone = template.content.cloneNode(true);
  clone.querySelector(".feedback-entrenamiento").textContent =
    fb.entrenamiento_nombre || "Entrenamiento";
  clone.querySelector(".feedback-fecha").textContent = fb.fecha_entreno
    ? new Date(fb.fecha_entreno).toLocaleDateString("es-ES")
    : "--/--/----";
  const estado = clone.querySelector(".feedback-estado");
  estado.textContent = fb.leido ? "Revisado" : "Pendiente";
  estado.className = `chip ${fb.leido ? "chip-success" : "chip-warning"}`;

  const resumen = renderResumen(fb);
  const contenido = [];
  if (resumen) {
    contenido.push(`<div class="d-flex flex-wrap gap-1 mb-1">${resumen}</div>`);
  }
  if (fb.comentario) {
    contenido.push(`<p class="mb-1"><strong>Comentario:</strong> ${fb.comentario}</p>`);
  }
  if (fb.url_datos) {
    contenido.push(
      `<p class="mb-1"><a href="${fb.url_datos}" target="_blank" rel="noopener" class="link-primary">Ver actividad</a></p>`
    );
  }
  if (fb.respuesta) {
    contenido.push(
      `<div class="alert alert-info mb-0"><strong>Respuesta:</strong> ${fb.respuesta}</div>`
    );
  }
  clone.querySelector(".feedback-contenido").innerHTML =
    contenido.join("") || "<p class='text-muted mb-0'>Sin detalles.</p>";
  return clone;
};

const cargarFeedbacks = async () => {
  lista.innerHTML = '<p class="text-muted mb-0">Cargando feedbacks...</p>';
  try {
    const datos = await fetchJSON(`${API}/mis_feedbacks`);
    if (!Array.isArray(datos) || !datos.length) {
      lista.innerHTML = '<p class="text-muted mb-0">Todavía no has enviado feedback.</p>';
      return;
    }
    lista.innerHTML = "";
    datos.forEach((fb) => lista.appendChild(renderFeedback(fb)));
  } catch (err) {
    console.error("Error al cargar feedbacks:", err);
    lista.innerHTML =
      '<div class="alert alert-danger">No se pudieron cargar tus feedbacks.</div>';
  }
};

document.addEventListener("DOMContentLoaded", cargarFeedbacks);
