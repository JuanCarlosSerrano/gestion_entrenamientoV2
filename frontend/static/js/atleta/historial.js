import { API, getAtletaId, fetchJSON } from "./api.js";
import { buildTreeFromFlat, renderPasos } from "./pasos.js";

const $ = (selector) => document.querySelector(selector);
const state = { entrenos: [], feedbacks: new Map(), zonas: null };

const parseDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "Sin fecha";
};

const feedbackStatus = (id) => state.feedbacks.has(Number(id));
const summary = (ent) => [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "Sesión planificada";

const renderList = () => {
  const box = $("#historial-lista");
  if (!box) return;
  if (!state.entrenos.length) {
    box.innerHTML = '<div class="athlete-muted">Todavía no hay sesiones en el historial.</div>';
    return;
  }
  box.innerHTML = state.entrenos.map((ent) => `
    <button class="athlete-history-row" type="button" data-history-id="${ent.id}">
      <span>${formatDate(ent.fecha)}</span>
      <span><strong>${ent.nombre || "Entrenamiento"}</strong><small class="athlete-muted d-block">${summary(ent)}</small></span>
      <span class="athlete-status ${feedbackStatus(ent.id) ? "athlete-status--done" : "athlete-status--pending"}">${feedbackStatus(ent.id) ? "Completado" : "Pendiente"}</span>
    </button>
  `).join("");
  box.querySelectorAll("[data-history-id]").forEach((btn) => {
    btn.addEventListener("click", () => openDetail(Number(btn.dataset.historyId)));
  });
};

const formatDuration = (seconds) => {
  const total = Math.round(Number(seconds || 0));
  if (!total) return "-";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const feedbackSummary = (fb) => {
  if (!fb) return "Sin feedback registrado.";
  return [
    fb.sensacion ? `Sensación: ${fb.sensacion}` : "",
    fb.fatiga ? `Fatiga: ${fb.fatiga}` : "",
    fb.dolor ? `Molestias: ${fb.zona_dolor || "sí"}` : "Sin molestias",
    fb.comentario ? `Comentario: ${fb.comentario}` : "",
  ].filter(Boolean).join("<br>");
};

const openDetail = async (id) => {
  const ent = state.entrenos.find((item) => Number(item.id) === id);
  if (!ent) return;
  $("#history-detail-date").textContent = formatDate(ent.fecha);
  $("#history-detail-title").textContent = ent.nombre || "Entrenamiento";
  let pasos = [];
  let resultados = [];
  try {
    pasos = buildTreeFromFlat(await fetchJSON(`${API}/entrenamientos_asignados/${id}/detalle`));
  } catch {}
  try {
    resultados = await fetchJSON(`${API}/entrenamientos_asignados/${id}/resultados`);
  } catch {}
  const fb = state.feedbacks.get(Number(id));
  const kmPorBloque = Array.isArray(resultados)
    ? resultados.filter((item) => item.km_realizados != null).map((item) => Number(item.km_realizados) || 0)
    : [];
  const km = kmPorBloque.length
    ? kmPorBloque.reduce((sum, value) => sum + value, 0)
    : Number(resultados?.[0]?.km_realizados_total || 0);
  $("#history-detail-body").innerHTML = `
    <div class="mb-3">${renderPasos(pasos, state.zonas)}</div>
    <div class="athlete-metric-grid mb-3">
      <div class="athlete-metric-card"><span class="athlete-muted">Feedback</span><strong>${fb ? "Sí" : "No"}</strong></div>
      <div class="athlete-metric-card"><span class="athlete-muted">RPE</span><strong>${fb?.rpe || "-"}</strong></div>
      <div class="athlete-metric-card"><span class="athlete-muted">Km</span><strong>${km ? km.toFixed(1) : "-"}</strong></div>
      <div class="athlete-metric-card"><span class="athlete-muted">FIT</span><strong>${resultados?.archivo_principal_id ? "Sí" : "-"}</strong></div>
    </div>
    <div class="history-feedback-box">
      <p class="athlete-eyebrow">Tu feedback</p>
      <div>${feedbackSummary(fb)}</div>
      ${fb ? "" : `<a class="athlete-primary-btn history-feedback-link" href="entrenamientos.html#entreno-${id}">Completar feedback</a>`}
    </div>
  `;
};

const init = async () => {
  const atletaId = getAtletaId();
  if (!atletaId) return;
  try {
    const [entrenos, feedbacks, zonas] = await Promise.all([
      fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`),
      fetchJSON(`${API}/mis_feedbacks`).catch(() => []),
      fetchJSON(`${API}/zonas_atleta/${atletaId}`).catch(() => null),
    ]);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    state.entrenos = (entrenos || [])
      .filter((ent) => {
        const date = parseDate(ent.fecha);
        return date && date <= today;
      })
      .sort((a, b) => parseDate(b.fecha) - parseDate(a.fecha));
    state.feedbacks = new Map((feedbacks || []).map((fb) => [Number(fb.entrenamiento_id), fb]));
    state.zonas = zonas;
    renderList();
    const hash = window.location.hash.match(/entreno-(\d+)/);
    if (hash) openDetail(Number(hash[1]));
  } catch (err) {
    console.error("No se pudo cargar historial:", err);
    $("#historial-lista").innerHTML = '<div class="text-danger">No se pudo cargar el historial.</div>';
  }
};

document.addEventListener("DOMContentLoaded", init);
