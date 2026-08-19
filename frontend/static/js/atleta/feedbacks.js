import { API, getAtletaId, fetchJSON } from "./api.js";

const $ = (selector) => document.querySelector(selector);

const parseDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const pace = (value) => {
  const total = Math.round(Number(value || 0) * 60);
  if (!total) return "-";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
};

const metric = (label, value) => `
  <article class="athlete-metric-card">
    <span class="athlete-muted">${label}</span>
    <strong>${value}</strong>
  </article>`;

const render = async () => {
  const atletaId = getAtletaId();
  if (!atletaId) return;
  try {
    const [entrenos, feedbacks, zonas, vdot] = await Promise.all([
      fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`),
      fetchJSON(`${API}/mis_feedbacks`).catch(() => []),
      fetchJSON(`${API}/zonas_atleta/${atletaId}`).catch(() => null),
      fetchJSON(`${API}/atletas/${atletaId}/vdot`).catch(() => null),
    ]);
    const now = new Date();
    const fourWeeksAgo = new Date(now);
    fourWeeksAgo.setDate(now.getDate() - 28);
    const recent = (entrenos || []).filter((ent) => {
      const date = parseDate(ent.fecha);
      return date && date >= fourWeeksAgo && date <= now;
    });
    const completed = (feedbacks || []).filter((fb) => fb.completado !== 0 && fb.completado !== false);
    const rpes = (feedbacks || []).map((fb) => Number(fb.rpe)).filter(Number.isFinite);
    const rpeAvg = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : "-";
    const km = recent.reduce((sum, ent) => sum + (Number(ent.km_previstos) || 0), 0);
    $("#evolution-metrics").innerHTML = [
      metric("Km últimas 4 semanas", km ? km.toFixed(1) : "-"),
      metric("Sesiones completadas", completed.length),
      metric("RPE medio", rpeAvg),
      metric("VDOT", vdot?.vdot_val ? Number(vdot.vdot_val).toFixed(1) : "-"),
    ].join("");
    $("#evolution-zones").innerHTML = zonas
      ? [1, 2, 3, 4, 5].map((i) => metric(`Z${i}`, pace(zonas[`z${i}`]))).join("")
      : '<div class="athlete-muted">Todavía no hay zonas calculadas.</div>';
    const recentFeedback = (feedbacks || []).slice(0, 5);
    $("#evolution-feedback").innerHTML = recentFeedback.length
      ? recentFeedback.map((fb) => `
        <div class="athlete-history-row">
          <span>${fb.fecha_entreno ? new Date(fb.fecha_entreno).toLocaleDateString("es-ES") : "-"}</span>
          <span><strong>${fb.entrenamiento_nombre || "Entrenamiento"}</strong><small class="athlete-muted d-block">${fb.sensacion || "Sin sensación"} · RPE ${fb.rpe || "-"}</small></span>
          <span class="athlete-status ${fb.dolor ? "athlete-status--pending" : "athlete-status--done"}">${fb.dolor ? "Molestias" : "OK"}</span>
        </div>`).join("")
      : '<div class="athlete-muted">Sin feedback reciente.</div>';
  } catch (err) {
    console.error("No se pudo cargar evolución:", err);
    $("#evolution-metrics").innerHTML = '<div class="text-danger">No se pudo cargar la evolución.</div>';
  }
};

document.addEventListener("DOMContentLoaded", render);
