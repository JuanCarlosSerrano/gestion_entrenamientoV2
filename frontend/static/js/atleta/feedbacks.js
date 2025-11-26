import { API, fetchJSON } from "./api.js";

const lista = document.getElementById("lista-feedbacks");
const template = document.getElementById("feedback-card-template");

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

  const contenido = [];
  if (fb.comentario) {
    contenido.push(`<p class="mb-1"><strong>Comentario:</strong> ${fb.comentario}</p>`);
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
