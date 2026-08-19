const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");

const state = {
  atletas: [],
  filtersLoaded: false,
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function setupIdentity() {
  const storedName = localStorage.getItem("userName") || localStorage.getItem("userEmail") || "Entrenador";
  const displayName = storedName.includes("@") ? storedName.split("@")[0] : storedName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const nameEl = $("#sidebar-trainer-name");
  const initialsEl = $("#sidebar-trainer-initials");
  if (nameEl) nameEl.textContent = displayName;
  if (initialsEl) initialsEl.textContent = initials || "E";
}

function fillSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  select.value = current;
}

async function fetchJson(url) {
  const response = await fetch(`${API_BASE}${url}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo cargar la información");
  return data;
}

function renderAtletas() {
  const container = $("#atletas-cards");
  if (!container) return;
  if (!state.atletas.length) {
    container.innerHTML = '<div class="empty-state">No hay atletas con esos filtros.</div>';
    return;
  }

  container.innerHTML = state.atletas.map((a) => {
    const name = `${a.nombre || ""} ${a.apellidos || ""}`.trim() || a.email || `Atleta ${a.id}`;
    const meta = [a.categoria, a.grupo, a.subgrupo].filter(Boolean).join(" · ");
    return `
      <button class="athlete-card athlete-card--select" data-athlete-id="${a.id}" type="button">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(meta || "Sin grupo asignado")}</small>
        <small>${a.tiene_zonas ? "Zonas registradas" : "Sin zonas registradas"}</small>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".athlete-card").forEach((card) => {
    card.addEventListener("click", () => {
      window.location.href = `atleta_planificacion.html?atletaId=${card.dataset.athleteId}`;
    });
  });
}

async function loadAtletas() {
  const params = new URLSearchParams();
  const search = $("#athlete-search")?.value.trim();
  const group = $("#filter-group")?.value;
  const subgroup = $("#filter-subgroup")?.value;
  const category = $("#filter-category")?.value;
  if (search) params.set("q", search);
  if (group) params.set("grupo", group);
  if (subgroup) params.set("subgrupo", subgroup);
  if (category) params.set("categoria", category);

  try {
    const data = await fetchJson(`/planificacion/atletas?${params.toString()}`);
    state.atletas = data.atletas || [];
    if (!state.filtersLoaded && data.filtros) {
      fillSelect($("#filter-group"), data.filtros.grupos || [], "Todos los grupos");
      fillSelect($("#filter-subgroup"), data.filtros.subgrupos || [], "Todos los subgrupos");
      fillSelect($("#filter-category"), data.filtros.categorias || [], "Todas las categorías");
      state.filtersLoaded = true;
    }
    renderAtletas();
  } catch (error) {
    const container = $("#atletas-cards");
    if (container) container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

export async function init() {
  setupIdentity();
  ["athlete-search", "filter-group", "filter-subgroup", "filter-category"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === "athlete-search" ? "input" : "change", loadAtletas);
  });
  await loadAtletas();
}

document.addEventListener("DOMContentLoaded", init);

export default { init };
