const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5002");

const state = {
  view: "home",
  atletas: [],
  filtersLoaded: false,
  selected: null,
  newStep: 0,
  zonesPayload: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const authHeader = () => {
  const email = localStorage.getItem("userEmail");
  const pass = localStorage.getItem("userPassword");
  if (!email || !pass) return null;
  return "Basic " + btoa(`${email}:${pass}`);
};

const csrfToken = async () => {
  if (window.CSRF?.ensureToken) return window.CSRF.ensureToken();
  return localStorage.getItem("csrfToken");
};

const fetchJson = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const auth = authHeader();
  if (auth) headers.Authorization = auth;
  if (["POST", "PUT", "DELETE"].includes(options.method)) {
    const token = await csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  const response = await fetch(`${API_BASE}${url}`, {
    credentials: "include",
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la acción");
  return data;
};

const setupTrainerIdentity = () => {
  const storedName = localStorage.getItem("userName") || localStorage.getItem("userEmail") || "Entrenador";
  const displayName = storedName.includes("@") ? storedName.split("@")[0] : storedName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  $("#sidebar-trainer-name") && ($("#sidebar-trainer-name").textContent = displayName);
  $("#sidebar-trainer-initials") && ($("#sidebar-trainer-initials").textContent = initials || "E");
  $("#trainer-visible-name") && ($("#trainer-visible-name").textContent = displayName);
};

const setView = async (view) => {
  state.view = view;
  $("#config-home")?.classList.toggle("d-none", view !== "home");
  $$(".config-view").forEach((el) => el.classList.add("d-none"));
  $(`#view-${view}`)?.classList.remove("d-none");
  $("#btn-config-back")?.classList.toggle("d-none", view === "home");
  if (view === "atletas") await loadAtletas();
  if (view === "zonas") await initZonesView();
};

const fillSelect = (select, values, label) => {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  select.value = current;
};

const athleteName = (a) => `${a?.nombre || ""} ${a?.apellidos || ""}`.trim() || a?.email || "Atleta";

const loadAtletas = async () => {
  const params = new URLSearchParams();
  const values = {
    q: $("#config-search")?.value.trim(),
    grupo: $("#config-filter-group")?.value,
    subgrupo: $("#config-filter-subgroup")?.value,
    categoria: $("#config-filter-category")?.value,
    activo: $("#config-filter-active")?.value,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const data = await fetchJson(`/configuracion/atletas?${params.toString()}`);
  state.atletas = data.atletas || [];
  if (!state.filtersLoaded && data.filtros) {
    fillSelect($("#config-filter-group"), data.filtros.grupos || [], "Todos los grupos");
    fillSelect($("#config-filter-subgroup"), data.filtros.subgrupos || [], "Todos los subgrupos");
    fillSelect($("#config-filter-category"), data.filtros.categorias || [], "Todas las categorías");
    state.filtersLoaded = true;
  }
  renderAtletas();
  fillZonesAthleteSelect();
};

const renderAtletas = () => {
  const list = $("#config-athlete-list");
  if (!list) return;
  if (!state.atletas.length) {
    list.innerHTML = '<div class="history-empty">No hay atletas con esos filtros.</div>';
    return;
  }
  list.innerHTML = state.atletas.map((a) => {
    const meta = [a.categoria, a.grupo, a.subgrupo].filter(Boolean).join(" · ") || "Sin grupo";
    const active = Number(a.activo ?? 1) === 1;
    return `
      <button class="config-athlete-row" type="button" data-athlete-id="${a.id}">
        <span>
          <strong>${escapeHtml(athleteName(a))}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
        <span class="config-status ${active ? "is-active" : "is-inactive"}">${active ? "Activo" : "Inactivo"}</span>
      </button>`;
  }).join("");
  list.querySelectorAll("[data-athlete-id]").forEach((row) => {
    row.addEventListener("click", () => openAthlete(Number(row.dataset.athleteId)));
  });
};

const openAthlete = async (id) => {
  const atleta = await fetchJson(`/configuracion/atletas/${id}`);
  state.selected = atleta;
  fillAthleteForm(atleta);
  await Promise.all([loadAthleteZones(id), loadAthleteZoneHistory(id)]);
  setAthleteTab("datos");
  setView("athlete-detail");
};

const fillAthleteForm = (a) => {
  $("#athlete-detail-title").textContent = athleteName(a);
  $("#athlete-detail-state").textContent = Number(a.activo ?? 1) === 1 ? "Activo" : "Inactivo";
  $("#athlete-nombre").value = a.nombre || "";
  $("#athlete-apellidos").value = a.apellidos || "";
  $("#athlete-email").value = a.email || "";
  $("#athlete-telefono").value = a.telefono || "";
  $("#athlete-fecha").value = (a.fecha_nacimiento || "").slice(0, 10);
  $("#athlete-categoria").value = a.categoria || "";
  $("#athlete-grupo").value = a.grupo || "";
  $("#athlete-subgrupo").value = a.subgrupo || "";
  $("#athlete-categoria-grupo").value = a.categoria || "";
  $("#access-email").textContent = a.email || "-";
  $("#access-state").textContent = Number(a.activo ?? 1) === 1 ? "Activo" : "Inactivo";
  $("#access-force").textContent = Number(a.force_password_change || 0) ? "Sí" : "No";
  $("#btn-toggle-active").textContent = Number(a.activo ?? 1) === 1 ? "Desactivar atleta" : "Activar atleta";
  $("#temp-password-box")?.classList.add("d-none");
};

const athletePayload = () => ({
  nombre: $("#athlete-nombre").value.trim(),
  apellidos: $("#athlete-apellidos").value.trim(),
  email: $("#athlete-email").value.trim(),
  telefono: $("#athlete-telefono").value.trim(),
  fecha_nacimiento: $("#athlete-fecha").value,
  categoria: $("#athlete-categoria").value.trim() || $("#athlete-categoria-grupo").value.trim(),
  grupo: $("#athlete-grupo").value.trim(),
  subgrupo: $("#athlete-subgrupo").value.trim(),
});

const saveSelectedAthlete = async () => {
  if (!state.selected) return;
  await fetchJson(`/configuracion/atletas/${state.selected.id}`, {
    method: "PUT",
    body: JSON.stringify(athletePayload()),
  });
  await openAthlete(state.selected.id);
  state.filtersLoaded = false;
};

const setAthleteTab = (tab) => {
  $$(".panel-tab").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.athleteTab === tab));
  $$(".config-tab").forEach((el) => el.classList.add("d-none"));
  $(`#tab-${tab}`)?.classList.remove("d-none");
};

const formatDate = (value) => value ? new Date(value).toLocaleDateString("es-ES") : "Vigente";
const pace = (minKm) => {
  const total = Math.round(Number(minKm || 0) * 60);
  if (!total) return "-";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
};

const paceFromSpeed = (speedKmh) => (speedKmh > 0 ? 60 / speedKmh : null);

const zoneCardHtml = (z) => [1, 2, 3, 4, 5].map((i) => `
  <div class="config-zone-chip">
    <strong>${escapeHtml(z._labels?.[`z${i}`] || `Z${i}`)}</strong>
    <span>${escapeHtml(z._ranges?.[`z${i}`] || pace(z[`z${i}`]))}</span>
    <small>${z[`fc_z${i}`] ? `${Math.round(z[`fc_z${i}`])} ppm` : "FC -"}</small>
  </div>`).join("");

const loadAthleteZones = async (id) => {
  const box = $("#zone-current");
  if (!box) return;
  try {
    const z = await fetchJson(`/zonas_atleta/${id}`);
    box.innerHTML = `<h3>Configuración vigente</h3><div class="config-zone-grid">${zoneCardHtml(z)}</div>`;
  } catch {
    box.innerHTML = '<div class="history-empty">Sin configuración vigente.</div>';
  }
};

const loadAthleteZoneHistory = async (id, target = "#zone-history") => {
  const box = $(target);
  if (!box) return;
  try {
    const data = await fetchJson(`/zonas_atleta/${id}/historial`);
    if (!data.length) {
      box.innerHTML = '<div class="history-empty">Sin histórico de zonas.</div>';
      return;
    }
    box.innerHTML = data.map((z) => `
      <article class="config-history-item ${z.fecha_fin ? "" : "is-current"}">
        <div class="config-history-item__header">
          <strong>${escapeHtml((z.metodo || "zonas").toUpperCase())}</strong>
          ${z.fecha_fin ? "" : '<span class="config-current-badge">Vigente</span>'}
        </div>
        <span>${formatDate(z.fecha_inicio)} - ${formatDate(z.fecha_fin)}</span>
        <div class="config-zone-grid">${zoneCardHtml(z)}</div>
      </article>`).join("");
  } catch {
    box.innerHTML = '<div class="history-empty">Sin histórico de zonas.</div>';
  }
};

const toggleActive = async () => {
  if (!state.selected) return;
  const next = Number(state.selected.activo ?? 1) === 1 ? 0 : 1;
  await fetchJson(`/configuracion/atletas/${state.selected.id}/estado`, {
    method: "PUT",
    body: JSON.stringify({ activo: next }),
  });
  await openAthlete(state.selected.id);
};

const deleteAthlete = async () => {
  if (!state.selected) return;
  if (!window.confirm("¿Eliminar solo si no tiene historial? Si tiene historial se archivará.")) return;
  await fetchJson(`/atletas/${state.selected.id}`, { method: "DELETE" });
  await setView("atletas");
};

const resetPassword = async () => {
  if (!state.selected) return;
  if (!window.confirm("¿Generar una nueva contraseña temporal?")) return;
  const data = await fetchJson(`/configuracion/atletas/${state.selected.id}/reset-password`, { method: "POST" });
  $("#temp-password-value").textContent = data.password_temporal || "";
  $("#temp-password-box")?.classList.remove("d-none");
  await openAthlete(state.selected.id);
  $("#temp-password-value").textContent = data.password_temporal || "";
  $("#temp-password-box")?.classList.remove("d-none");
  setAthleteTab("acceso");
};

const showNewStep = () => {
  $$(".config-step").forEach((step) => step.classList.toggle("d-none", Number(step.dataset.step) !== state.newStep));
  $$("#new-athlete-steps span").forEach((item, index) => item.classList.toggle("is-active", index === state.newStep));
  $("#btn-new-prev").disabled = state.newStep === 0;
  $("#btn-new-next").classList.toggle("d-none", state.newStep === 3);
  $("#btn-new-save").classList.toggle("d-none", state.newStep !== 3);
};

const createAthlete = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await fetchJson("/configuracion/atletas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  form.reset();
  state.newStep = 0;
  showNewStep();
  await loadAtletas();
  await openAthlete(data.atleta_id);
  if (data.password_temporal) {
    $("#temp-password-value").textContent = data.password_temporal;
    $("#temp-password-box")?.classList.remove("d-none");
    setAthleteTab("acceso");
  }
};

const fillZonesAthleteSelect = () => {
  const select = $("#zones-athlete");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Selecciona un atleta</option>' + state.atletas
    .filter((a) => Number(a.activo ?? 1) === 1)
    .map((a) => `<option value="${a.id}">${escapeHtml(athleteName(a))}</option>`)
    .join("");
  select.value = current;
};

const initZonesView = async () => {
  if (!state.atletas.length) await loadAtletas();
  fillZonesAthleteSelect();
  if (!$("#zones-start").value) $("#zones-start").value = new Date().toISOString().slice(0, 10);
  setZoneMethod(state.zoneMethod || "vam");
};

const readNumber = (selector) => {
  const value = Number($(selector)?.value || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parsePaceToMinutes = (value) => {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes <= 0) return null;
  return minutes + seconds / 60;
};

const parseRaceTimeSeconds = () => {
  const h = Number($("#vdot-hours")?.value || 0);
  const m = Number($("#vdot-minutes")?.value || 0);
  const s = Number($("#vdot-seconds")?.value || 0);
  if (![h, m, s].every(Number.isFinite) || h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
};

const parseVamFromTest2000 = () => {
  const minutes = parsePaceToMinutes($("#vam-2000-time")?.value);
  if (!minutes) return null;
  return Number((120 / minutes).toFixed(2));
};

const buildVamZones = (vam, fcMax) => {
  const specs = [
    { key: "z1", name: "Z1", min: 0.60, max: 0.65, label: "<65%", value: 0.625 },
    { key: "z2", name: "Z2", min: 0.65, max: 0.75, label: "65-75%", value: 0.70 },
    { key: "z3", name: "Z3", min: 0.75, max: 0.80, label: "75-80%", value: 0.775 },
    { key: "z4", name: "Z4", min: 0.80, max: 0.90, label: "80-90%", value: 0.85 },
    { key: "z5", name: "Z5", min: 0.90, max: 1.00, label: "90-100%", value: 0.95 },
  ];
  const payload = { _labels: {}, _ranges: {} };
  specs.forEach((spec, index) => {
    payload._labels[spec.key] = spec.name;
    payload[spec.key] = Number(paceFromSpeed(vam * spec.value).toFixed(2));
    const fast = paceFromSpeed(vam * spec.max);
    const slow = paceFromSpeed(vam * spec.min);
    payload._ranges[spec.key] =
      spec.key === "z1"
        ? `${spec.label} · >${pace(fast)}`
        : `${spec.label} · ${pace(slow)}-${pace(fast)}`;
    if (fcMax) payload[`fc_z${index + 1}`] = Math.round(fcMax * spec.value);
  });
  return payload;
};

const vdotSpeedFromVo2 = (vo2) => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - vo2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const speedMetersMin = (-b + Math.sqrt(disc)) / (2 * a);
  return speedMetersMin > 0 ? speedMetersMin : null;
};

const vdotPaceFromFraction = (vdot, fraction) => {
  const speedMetersMin = vdotSpeedFromVo2(vdot * fraction);
  return speedMetersMin ? 1000 / speedMetersMin : null;
};

const calculateVdot = (distanceMeters, totalSeconds) => {
  const timeMin = totalSeconds / 60;
  const speedMetersMin = distanceMeters / timeMin;
  const vo2 = -4.60 + 0.182258 * speedMetersMin + 0.000104 * speedMetersMin * speedMetersMin;
  const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin);
  return fraction ? vo2 / fraction : null;
};

const vdotTimeFromDistance = (vdot, distanceMeters) => {
  if (!vdot || !distanceMeters) return null;
  let low = 2;
  let high = 400;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const speedMetersMin = distanceMeters / mid;
    const vo2 = -4.60 + 0.182258 * speedMetersMin + 0.000104 * speedMetersMin * speedMetersMin;
    const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * mid) + 0.2989558 * Math.exp(-0.1932605 * mid);
    const currentVdot = vo2 / fraction;
    if (currentVdot > vdot) low = mid;
    else high = mid;
  }
  return high * 60;
};

const formatDuration = (seconds) => {
  const total = Math.round(Number(seconds || 0));
  if (!total) return "-";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

const parseTimeParts = (prefix) => {
  const h = Number($(`#${prefix}-hours`)?.value || 0);
  const m = Number($(`#${prefix}-minutes`)?.value || 0);
  const s = Number($(`#${prefix}-seconds`)?.value || 0);
  if (![h, m, s].every(Number.isFinite) || h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
};

const parsePaceParts = () => {
  const mRaw = $("#pace-minutes-km")?.value;
  const sRaw = $("#pace-seconds-km")?.value;
  const hasMinutes = mRaw !== undefined && String(mRaw).trim() !== "";
  const hasSeconds = sRaw !== undefined && String(sRaw).trim() !== "";
  if (!hasMinutes && !hasSeconds) return null;
  const m = Number(mRaw || 0);
  const s = Number(sRaw || 0);
  if (![m, s].every(Number.isFinite) || m < 0 || m > 59 || s < 0 || s > 59) return NaN;
  const total = m * 60 + s;
  return total > 0 ? total : NaN;
};

const setTimeParts = (prefix, totalSeconds) => {
  const total = Math.round(Number(totalSeconds || 0));
  $(`#${prefix}-hours`) && ($(`#${prefix}-hours`).value = String(Math.floor(total / 3600)));
  $(`#${prefix}-minutes`) && ($(`#${prefix}-minutes`).value = String(Math.floor((total % 3600) / 60)));
  $(`#${prefix}-seconds`) && ($(`#${prefix}-seconds`).value = String(total % 60));
};

const setPaceParts = (secondsPerKm) => {
  const total = Math.round(Number(secondsPerKm || 0));
  $("#pace-minutes-km") && ($("#pace-minutes-km").value = String(Math.floor(total / 60)));
  $("#pace-seconds-km") && ($("#pace-seconds-km").value = String(total % 60));
};

const commonRaceDistances = [
  { label: "1500 m", meters: 1500 },
  { label: "3000 m", meters: 3000 },
  { label: "5K", meters: 5000 },
  { label: "10K", meters: 10000 },
  { label: "Media maratón", meters: 21097.5 },
  { label: "Maratón", meters: 42195 },
];

const trainingPaceSpecs = [
  { code: "E", name: "Suave", min: 0.65, max: 0.78 },
  { code: "M", name: "Maratón", min: 0.80, max: 0.84 },
  { code: "T", name: "Umbral", min: 0.88, max: 0.92 },
  { code: "I", name: "Intervalos", min: 0.95, max: 1.00 },
  { code: "R", name: "Repeticiones", min: 1.05, max: 1.15 },
];

const seriesSpecs = [
  { label: "1200 m", km: 1.2, zones: ["T", "I", "R"] },
  { label: "800 m", km: 0.8, zones: ["T", "I", "R"] },
  { label: "600 m", km: 0.6, zones: ["T", "I", "R"] },
  { label: "400 m", km: 0.4, zones: ["I", "R"] },
  { label: "300 m", km: 0.3, zones: ["I", "R"] },
  { label: "200 m", km: 0.2, zones: ["R"] },
];

const formatPaceRange = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "-";
  const slow = Math.max(min, max);
  const fast = Math.min(min, max);
  return `${pace(slow)} - ${pace(fast)}`;
};

const splitLabel = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${Number(km.toFixed(3))} km`);

const buildPaceSplits = (distanceKm, paceSeconds) => {
  const stepKm = distanceKm < 3 ? 0.4 : 1;
  const rows = [];
  for (let current = stepKm; current < distanceKm; current += stepKm) {
    rows.push({ label: splitLabel(current), seconds: current * paceSeconds });
  }
  if (!rows.length || Math.abs(rows[rows.length - 1].seconds - distanceKm * paceSeconds) > 1) {
    rows.push({ label: splitLabel(distanceKm), seconds: distanceKm * paceSeconds });
  }
  return {
    title: distanceKm < 3 ? "Tiempos de paso cada 400 m" : "Tiempos de paso cada 1000 m",
    rows,
  };
};

const renderPredictor = () => {
  const box = $("#predictor-results");
  if (!box) return;
  const distance = Number($("#predictor-distance")?.value || 0);
  const totalSeconds = parseTimeParts("predictor");
  if (!distance || !totalSeconds) {
    box.innerHTML = '<div class="history-empty">Introduce una distancia y un tiempo de carrera válidos.</div>';
    return;
  }
  const vdot = calculateVdot(distance, totalSeconds);
  if (!vdot || vdot < 20 || vdot > 90) {
    box.innerHTML = '<div class="history-empty">La marca introducida no permite calcular una previsión coherente.</div>';
    return;
  }
  const raceRows = commonRaceDistances.map((d) => {
    const predicted = vdotTimeFromDistance(vdot, d.meters);
    const paceSeconds = predicted ? predicted / (d.meters / 1000) : null;
    return `<tr><td>${d.label}</td><td>${formatDuration(predicted)}</td><td>${pace(paceSeconds / 60)}</td></tr>`;
  }).join("");
  const trainingRows = trainingPaceSpecs.map((spec) => `
    <tr>
      <td>${spec.code} · ${spec.name}</td>
      <td>${formatPaceRange(vdotPaceFromFraction(vdot, spec.min), vdotPaceFromFraction(vdot, spec.max))}</td>
    </tr>`).join("");
  const seriesRows = seriesSpecs.map((serie) => {
    const values = serie.zones.map((code) => {
      const spec = trainingPaceSpecs.find((item) => item.code === code);
      const mid = spec ? vdotPaceFromFraction(vdot, (spec.min + spec.max) / 2) : null;
      return `${code} ${formatDuration(mid ? mid * 60 * serie.km : 0)}`;
    });
    return `<tr><td>${serie.label}</td><td>${values.join(" · ")}</td></tr>`;
  }).join("");
  box.innerHTML = `
    <div class="utility-result-grid">
      <article class="utility-result-card"><span>VDOT estimado</span><strong>${vdot.toFixed(1)}</strong></article>
      <article class="utility-result-card"><span>Marca base</span><strong>${formatDuration(totalSeconds)}</strong></article>
      <article class="utility-result-card"><span>Ritmo base</span><strong>${pace((totalSeconds / (distance / 1000)) / 60)}</strong></article>
    </div>
    <div class="utility-table-grid">
      <div class="utility-table-card">
        <h3>Equivalencias</h3>
        <div class="table-responsive"><table class="table table-theme utility-table mb-0"><thead><tr><th>Distancia</th><th>Tiempo</th><th>Ritmo</th></tr></thead><tbody>${raceRows}</tbody></table></div>
      </div>
      <div class="utility-table-card">
        <h3>Ritmos de entrenamiento</h3>
        <div class="table-responsive"><table class="table table-theme utility-table mb-0"><thead><tr><th>Tipo</th><th>Rango</th></tr></thead><tbody>${trainingRows}</tbody></table></div>
      </div>
      <div class="utility-table-card utility-table-card--wide">
        <h3>Series de referencia</h3>
        <div class="table-responsive"><table class="table table-theme utility-table mb-0"><thead><tr><th>Distancia</th><th>Tiempos</th></tr></thead><tbody>${seriesRows}</tbody></table></div>
      </div>
    </div>
  `;
};

const resetPredictor = () => {
  $("#predictor-distance") && ($("#predictor-distance").value = "5000");
  ["predictor-hours", "predictor-minutes", "predictor-seconds"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  $("#predictor-results") && ($("#predictor-results").innerHTML = "");
};

const renderPaceCalculator = () => {
  const box = $("#pace-results");
  if (!box) return;
  let distanceKm = Number($("#pace-distance-km")?.value || 0);
  let totalSeconds = parseTimeParts("pace");
  let paceSeconds = parsePaceParts();
  if (!Number.isFinite(distanceKm) || distanceKm < 0) distanceKm = null;
  if (distanceKm === 0) distanceKm = null;

  const filled = [distanceKm, totalSeconds, paceSeconds].filter((value) => value !== null && Number.isFinite(value)).length;
  if (filled !== 2) {
    box.innerHTML = '<div class="history-empty">Rellena exactamente dos datos entre distancia, tiempo y ritmo.</div>';
    return;
  }
  if (!distanceKm) {
    distanceKm = totalSeconds / paceSeconds;
    $("#pace-distance-km") && ($("#pace-distance-km").value = distanceKm.toFixed(3));
  } else if (!totalSeconds) {
    totalSeconds = distanceKm * paceSeconds;
    setTimeParts("pace", totalSeconds);
  } else if (!Number.isFinite(paceSeconds)) {
    paceSeconds = totalSeconds / distanceKm;
    setPaceParts(paceSeconds);
  }
  if (!distanceKm || !totalSeconds || !paceSeconds) {
    box.innerHTML = '<div class="history-empty">Los datos introducidos no permiten calcular el resultado.</div>';
    return;
  }
  const speed = distanceKm / (totalSeconds / 3600);
  const splits = buildPaceSplits(distanceKm, paceSeconds);
  const estimates = commonRaceDistances
    .filter((d) => d.meters >= 5000)
    .map((d) => `<tr><td>${d.label}</td><td>${formatDuration((d.meters / 1000) * paceSeconds)}</td><td>${pace(paceSeconds / 60)}</td></tr>`)
    .join("");
  const splitRows = splits.rows
    .map((item) => `<tr><td>${item.label}</td><td>${formatDuration(item.seconds)}</td></tr>`)
    .join("");
  box.innerHTML = `
    <div class="utility-result-grid">
      <article class="utility-result-card"><span>Distancia</span><strong>${distanceKm.toFixed(3)} km</strong></article>
      <article class="utility-result-card"><span>Tiempo</span><strong>${formatDuration(totalSeconds)}</strong></article>
      <article class="utility-result-card"><span>Ritmo</span><strong>${pace(paceSeconds / 60)}</strong></article>
      <article class="utility-result-card"><span>Velocidad</span><strong>${speed.toFixed(2)} km/h</strong></article>
    </div>
    <div class="utility-table-grid">
      <div class="utility-table-card">
        <h3>${splits.title}</h3>
        <div class="table-responsive"><table class="table table-theme utility-table mb-0"><thead><tr><th>Paso</th><th>Tiempo acumulado</th></tr></thead><tbody>${splitRows}</tbody></table></div>
      </div>
      <div class="utility-table-card">
        <h3>Estimación al mismo ritmo</h3>
        <div class="table-responsive"><table class="table table-theme utility-table mb-0"><thead><tr><th>Distancia</th><th>Tiempo</th><th>Ritmo</th></tr></thead><tbody>${estimates}</tbody></table></div>
      </div>
    </div>
  `;
};

const resetPaceCalculator = () => {
  ["pace-distance-km", "pace-hours", "pace-minutes", "pace-seconds", "pace-minutes-km", "pace-seconds-km"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  $("#pace-results") && ($("#pace-results").innerHTML = "");
};

const buildVdotZones = (vdot, fcMax) => {
  const specs = [
    { key: "z1", name: "Easy", min: 0.65, max: 0.78, value: 0.715 },
    { key: "z2", name: "Marathon", min: 0.80, max: 0.84, value: 0.82 },
    { key: "z3", name: "Threshold", min: 0.88, max: 0.92, value: 0.90 },
    { key: "z4", name: "Interval", min: 0.95, max: 1.00, value: 0.975 },
    { key: "z5", name: "Repetition", min: 1.05, max: 1.15, value: 1.10 },
  ];
  const payload = { _labels: {}, _ranges: {} };
  specs.forEach((spec, index) => {
    const slow = vdotPaceFromFraction(vdot, spec.min);
    const fast = vdotPaceFromFraction(vdot, spec.max);
    const mid = vdotPaceFromFraction(vdot, spec.value);
    payload._labels[spec.key] = spec.name;
    payload._ranges[spec.key] = `${pace(slow)}-${pace(fast)}`;
    payload[spec.key] = Number(mid.toFixed(2));
    if (fcMax) payload[`fc_z${index + 1}`] = Math.round(fcMax * spec.value);
  });
  return payload;
};

const setZoneMethod = (method) => {
  state.zoneMethod = method;
  $$("[data-zone-method]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.zoneMethod === method));
  $$(".zone-method-panel").forEach((panel) => panel.classList.add("d-none"));
  $(`#zone-panel-${method}`)?.classList.remove("d-none");
  $("#btn-preview-zones") && ($("#btn-preview-zones").textContent = method === "manual" ? "Revisar zonas" : "Calcular");
  state.zonesPayload = null;
  $("#zones-preview") && ($("#zones-preview").innerHTML = "");
};

const renderZonesProposal = (title) => {
  $("#zones-preview").innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <div class="config-zone-grid">${zoneCardHtml(state.zonesPayload)}</div>
    <div class="config-actions config-proposal-actions">
      <button class="btn btn-brand" id="btn-save-zones" type="button">Guardar nuevas zonas</button>
      <button class="btn btn-outline-secondary" id="btn-discard-zones" type="button">Descartar</button>
    </div>
  `;
  $("#btn-save-zones")?.addEventListener("click", saveZones);
  $("#btn-discard-zones")?.addEventListener("click", discardZonesProposal);
};

const discardZonesProposal = () => {
  state.zonesPayload = null;
  $("#zones-preview").innerHTML = '<div class="history-empty">Propuesta descartada.</div>';
};

const calculateZones = () => {
  const method = state.zoneMethod || "vam";
  const fcMax = Number($("#zones-fcmax").value || 0);
  const athleteId = Number($("#zones-athlete").value || 0);
  const fechaInicio = $("#zones-start").value;

  if (!athleteId || !fechaInicio) {
    $("#zones-preview").innerHTML = '<div class="history-empty">Selecciona atleta y fecha de inicio.</div>';
    return false;
  }

  if (method === "manual") {
    const manualZones = [1, 2, 3, 4, 5].map((i) => parsePaceToMinutes($(`#manual-z${i}`)?.value));
    if (manualZones.some((value) => !value)) {
      $("#zones-preview").innerHTML = '<div class="history-empty">Introduce las cinco zonas con formato mm:ss.</div>';
      return false;
    }
    const fc = Object.fromEntries(
      [1, 2, 3, 4, 5]
        .map((i) => [`fc_z${i}`, readNumber(`#manual-fc-z${i}`)])
        .filter(([, value]) => value)
    );
    state.zonesPayload = {
      atleta_id: athleteId,
      vam: 1,
      vdot_val: null,
      metodo: "manual",
      fecha_inicio: fechaInicio,
      z1: manualZones[0], z2: manualZones[1], z3: manualZones[2], z4: manualZones[3], z5: manualZones[4],
      ...fc,
    };
    renderZonesProposal("Propuesta manual");
    return true;
  }

  const vam = method === "vam" ? parseVamFromTest2000() : null;
  const vdot = method === "vdot" ? calculateVdot(Number($("#vdot-race-distance")?.value || 0), parseRaceTimeSeconds()) : null;
  if (method === "vam" && !vam) {
    $("#zones-preview").innerHTML = '<div class="history-empty">Introduce el test de 2000 m con formato mm:ss, por ejemplo 07:50.</div>';
    return false;
  }
  if (method === "vdot" && (!vdot || vdot < 20 || vdot > 90)) {
    $("#zones-preview").innerHTML = '<div class="history-empty">Introduce una distancia y tiempo de carrera válidos para calcular VDOT.</div>';
    return false;
  }
  const zones = method === "vam" ? buildVamZones(vam, fcMax) : buildVdotZones(vdot, fcMax);
  state.zonesPayload = {
    atleta_id: athleteId,
    vam: method === "vam" ? vam : Number((vdot / 3.5).toFixed(2)),
    vdot_val: method === "vdot" ? Number(vdot.toFixed(1)) : null,
    metodo: method,
    fecha_inicio: fechaInicio,
    ...zones,
  };
  renderZonesProposal(method === "vam" ? `Nuevo cálculo VAM · ${vam.toFixed(2)} km/h` : `Nuevo cálculo VDOT · ${vdot.toFixed(1)}`);
  return true;
};

const saveZones = async () => {
  if (!state.zonesPayload) {
    $("#zones-preview").innerHTML = '<div class="history-empty">Primero calcula o revisa una propuesta de zonas.</div>';
    return;
  }
  const athlete = state.atletas.find((a) => Number(a.id) === Number(state.zonesPayload.atleta_id));
  const name = athlete ? athleteName(athlete) : "el atleta";
  const confirmed = window.confirm(
    `Vas a crear una nueva configuración de zonas para ${name}. La configuración vigente anterior se cerrará con fecha fin. ¿Quieres continuar?`
  );
  if (!confirmed) return;
  $("#btn-save-zones") && ($("#btn-save-zones").disabled = true);
  try {
    const savedAthleteId = state.zonesPayload.atleta_id;
    await fetchJson("/guardar_zonas", {
      method: "POST",
      body: JSON.stringify(state.zonesPayload),
    });
    await loadAthleteZoneHistory(savedAthleteId, "#zones-history-global");
    state.zonesPayload = null;
    $("#zones-preview").innerHTML = '<div class="config-success">Zonas actualizadas correctamente.</div>';
    window.alert("Zonas actualizadas correctamente.");
  } catch (error) {
    $("#btn-save-zones") && ($("#btn-save-zones").disabled = false);
    window.alert(error.message || "No se pudieron guardar las zonas.");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  setupTrainerIdentity();
  $$("[data-config-view]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.configView)));
  $("#btn-config-back")?.addEventListener("click", () => setView("home"));
  $("#btn-return-athletes")?.addEventListener("click", () => setView("atletas"));
  $("#btn-new-athlete")?.addEventListener("click", () => {
    state.newStep = 0;
    showNewStep();
    setView("new-athlete");
  });
  ["config-search", "config-filter-group", "config-filter-subgroup", "config-filter-category", "config-filter-active"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener(id === "config-search" ? "input" : "change", loadAtletas);
  });
  $$("[data-athlete-tab]").forEach((btn) => btn.addEventListener("click", () => setAthleteTab(btn.dataset.athleteTab)));
  $("#tab-datos")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSelectedAthlete();
  });
  $("#tab-grupo")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#athlete-categoria").value = $("#athlete-categoria-grupo").value;
    await saveSelectedAthlete();
  });
  $("#btn-toggle-active")?.addEventListener("click", toggleActive);
  $("#btn-delete-athlete")?.addEventListener("click", deleteAthlete);
  $("#btn-reset-password")?.addEventListener("click", resetPassword);
  $("#btn-copy-password")?.addEventListener("click", () => navigator.clipboard?.writeText($("#temp-password-value").textContent || ""));
  $("#btn-new-prev")?.addEventListener("click", () => {
    state.newStep = Math.max(0, state.newStep - 1);
    showNewStep();
  });
  $("#btn-new-next")?.addEventListener("click", () => {
    state.newStep = Math.min(3, state.newStep + 1);
    showNewStep();
  });
  $("#new-athlete-form")?.addEventListener("submit", createAthlete);
  $("#zones-athlete")?.addEventListener("change", async () => {
    const id = Number($("#zones-athlete").value || 0);
    if (id) await loadAthleteZoneHistory(id, "#zones-history-global");
  });
  $("#btn-preview-zones")?.addEventListener("click", calculateZones);
  $$("[data-zone-method]").forEach((btn) => btn.addEventListener("click", () => setZoneMethod(btn.dataset.zoneMethod)));
  $("#btn-predict-race")?.addEventListener("click", renderPredictor);
  $("#btn-reset-predictor")?.addEventListener("click", resetPredictor);
  $("#btn-calc-pace")?.addEventListener("click", renderPaceCalculator);
  $("#btn-reset-pace")?.addEventListener("click", resetPaceCalculator);
  $$("[data-pace-distance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#pace-distance-km") && ($("#pace-distance-km").value = btn.dataset.paceDistance);
    });
  });
});
