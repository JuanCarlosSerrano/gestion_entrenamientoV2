import { API, getAtletaId, fetchJSON } from "./api.js";

const $ = (selector) => document.querySelector(selector);

const parseDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isoLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDate = (date) =>
  date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

const sessionSummary = (ent) => [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "Sesión planificada";

const setupIdentity = async () => {
  const atletaId = getAtletaId();
  const stored = localStorage.getItem("userName") || localStorage.getItem("userEmail") || "Atleta";
  let name = stored.includes("@") ? stored.split("@")[0] : stored;
  if (atletaId) {
    try {
      const perfil = await fetchJSON(`${API}/perfil_atleta/${atletaId}`);
      name = [perfil.nombre, perfil.apellidos].filter(Boolean).join(" ") || name;
    } catch {}
  }
  $("#nombre-atleta") && ($("#nombre-atleta").textContent = `Hola, ${name.split(" ")[0]}`);
  $("#athlete-sidebar-name") && ($("#athlete-sidebar-name").textContent = name);
  $("#athlete-sidebar-initials") &&
    ($("#athlete-sidebar-initials").textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "A");
};

const loadFeedbacks = async () => {
  try {
    return await fetchJSON(`${API}/mis_feedbacks`);
  } catch {
    return [];
  }
};

// No hay (todavía) forma de que el atleta marque una respuesta del
// entrenador como "leída" en el servidor -- leido en feedbacks solo
// indica si el entrenador ha leído el feedback del atleta, al revés.
// Se recuerda en este navegador qué respuestas ya se han visto para no
// mostrar el aviso para siempre una vez descartado.
const RESPUESTAS_VISTAS_KEY = "respuestasEntrenadorVistas";
const getRespuestasVistas = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(RESPUESTAS_VISTAS_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const marcarRespuestaVista = (feedbackId) => {
  const vistas = getRespuestasVistas();
  vistas.add(Number(feedbackId));
  localStorage.setItem(RESPUESTAS_VISTAS_KEY, JSON.stringify([...vistas]));
};

const renderRespuestasAviso = (feedbacks) => {
  const box = $("#today-response-alert");
  if (!box) return;
  const vistas = getRespuestasVistas();
  const nuevas = (feedbacks || []).filter((fb) => fb.respuesta && !vistas.has(Number(fb.id)));
  if (!nuevas.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = nuevas.map((fb) => `
    <div class="today-response-alert-card">
      <span>💬</span>
      <div>
        <strong>Tu entrenador te ha respondido</strong>
        <div class="athlete-muted">${fb.entrenamiento_nombre || "Entrenamiento"}</div>
      </div>
      <a class="btn btn-sm btn-outline-brand" href="historial.html#entreno-${fb.entrenamiento_id}" data-feedback-id="${fb.id}">Leer</a>
    </div>
  `).join("");
  box.querySelectorAll("[data-feedback-id]").forEach((link) => {
    link.addEventListener("click", () => marcarRespuestaVista(link.dataset.feedbackId));
  });
};

const renderToday = (items) => {
  const box = $("#today-training-list");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="today-session"><strong>Hoy no tienes entrenamiento planificado.</strong><small>Revisa Mi semana para ver próximos días.</small></div>';
    return;
  }
  box.innerHTML = items.map((ent) => `
    <article class="today-session">
      <small>${ent.franja ? String(ent.franja).toUpperCase() : "SESIÓN"}</small>
      <strong>${ent.nombre || "Entrenamiento"}</strong>
      <span>${sessionSummary(ent)}</span>
      <a class="athlete-primary-btn" href="entrenamientos.html#entreno-${ent.id}">Ver entrenamiento</a>
    </article>
  `).join("");
};

const renderNews = (items, feedbackSet) => {
  const box = $("#athlete-news");
  if (!box) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recent = items
    .filter((ent) => {
      const date = parseDate(ent.fecha);
      return date && date >= today;
    })
    .slice(0, 3);
  const pending = items
    .filter((ent) => {
      const date = parseDate(ent.fecha);
      return date && date < today && !feedbackSet.has(Number(ent.id));
    })
    .slice(0, 2);
  const rows = [
    ...recent.map((ent) => ({
      title: "Nuevo entrenamiento disponible",
      text: ent.nombre || "Entrenamiento",
      href: `entrenamientos.html#entreno-${ent.id}`,
    })),
    ...pending.map((ent) => ({
      title: "Pendiente de informar",
      text: ent.nombre || "Entrenamiento",
      href: `entrenamientos.html#entreno-${ent.id}`,
    })),
  ];
  if (!rows.length) {
    box.innerHTML = '<div class="athlete-muted">No hay novedades pendientes.</div>';
    return;
  }
  box.innerHTML = rows.map((row) => `
    <div class="athlete-history-row">
      <span class="athlete-status athlete-status--pending">Aviso</span>
      <div><strong>${row.title}</strong><div class="athlete-muted">${row.text}</div></div>
      <a class="btn btn-sm btn-outline-brand" href="${row.href}">Ver</a>
    </div>
  `).join("");
};

const loadHome = async () => {
  const atletaId = getAtletaId();
  $("#today-date") && ($("#today-date").textContent = formatDate(new Date()));
  if (!atletaId) {
    renderToday([]);
    return;
  }
  await setupIdentity();
  try {
    const [entrenos, feedbacks] = await Promise.all([
      fetchJSON(`${API}/entrenamientos_asignados/${atletaId}`),
      loadFeedbacks(),
    ]);
    const feedbackSet = new Set((feedbacks || []).map((fb) => Number(fb.entrenamiento_id)).filter(Boolean));
    const todayIso = isoLocal(new Date());
    const todayItems = (entrenos || []).filter((ent) => String(ent.fecha || "").slice(0, 10) === todayIso);
    renderRespuestasAviso(feedbacks);
    renderToday(todayItems);
    renderNews(entrenos || [], feedbackSet);
  } catch (err) {
    console.error("No se pudo cargar el inicio del atleta:", err);
    renderToday([]);
    $("#athlete-news") && ($("#athlete-news").innerHTML = '<div class="text-danger">No se pudieron cargar las novedades.</div>');
  }
};

document.addEventListener("DOMContentLoaded", loadHome);
