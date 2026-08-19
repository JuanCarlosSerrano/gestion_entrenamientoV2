let Atletas;
let Calendario;
let Entrenamientos;

// Entrenamiento seleccionado en el panel de "Próximos entrenamientos"
let entrenoSeleccionado = null;
let modalVisibilidad = null;
let cachedAtletasIds = null;
let proximosEntrenamientos = [];
let proximosPaginaActual = 1;
const PROXIMOS_POR_PAGINA = 5;
const dashboardState = {
  atletasActivos: 0,
  pendientesPublicar: 0,
  sesionesPorRevisar: 0,
  sesionesPlanificadas: 0,
  alertas: 0,
  feedbacks: 0,
};

const formatFechaCorta = (valor) => {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor || "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const formatFechaDashboard = (valor) => {
  const d = valor ? new Date(valor) : new Date();
  if (Number.isNaN(d.getTime())) return { dia: "Hoy", mes: "" };
  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);
  const mismoDia = d.toDateString() === hoy.toDateString();
  const esManana = d.toDateString() === manana.toDateString();
  const dia = mismoDia
    ? "Hoy"
    : esManana
      ? "Mañana"
      : d.toLocaleDateString("es-ES", { weekday: "short" });
  return {
    dia: dia.charAt(0).toUpperCase() + dia.slice(1).replace(".", ""),
    mes: d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).toUpperCase().replace(".", ""),
  };
};

const getIsoWeek = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const escapeHtml = (valor) =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const textoRpe = (valor) => {
  const num = Number(valor);
  if (Number.isNaN(num)) return "";
  if (num <= 3) return "Muy suave";
  if (num <= 6) return "Controlado";
  if (num <= 8) return "Exigente";
  return "Máximo";
};

const chipResumen = (valor, clase, prefijo = "") =>
  valor ? `<span class="chip ${clase}">${prefijo}${valor}</span>` : "";

const iconoSensacion = (valor) => {
  const mapa = { "muy bien": "😄", bien: "🙂", normal: "😐", mal: "😖" };
  const val = (valor || "").toLowerCase();
  return mapa[val] ? `${mapa[val]} ${valor}` : valor;
};

const renderChipsFeedback = (fb) => {
  const chips = [];
  const rpeVal = Number(fb.rpe);
  if (Number.isFinite(rpeVal)) {
    const clase = rpeVal >= 9 ? "chip-danger" : rpeVal >= 7 ? "chip-warning" : "chip-success";
    chips.push(`<span class="chip ${clase}">RPE ${rpeVal} · ${textoRpe(rpeVal)}</span>`);
  }
  if (fb.sensacion) chips.push(`<span class="chip chip-soft">${iconoSensacion(fb.sensacion)}</span>`);
  if (fb.fatiga) {
    const nivel = (fb.fatiga || "").toLowerCase();
    const clase = nivel === "alta" ? "chip-danger" : nivel === "media" ? "chip-warning" : "chip-success";
    chips.push(chipResumen(fb.fatiga, clase, "Fatiga "));
  }
  if (fb.dolor) {
    chips.push(
      `<span class="chip chip-danger">⚠️ Dolor${fb.zona_dolor ? `: ${fb.zona_dolor}` : ""}</span>`
    );
  }
  const incompleto = fb.completado === 0 || fb.completado === false;
  if (incompleto) {
    chips.push('<span class="chip chip-muted">No completado</span>');
  }
  return chips.join(" ");
};

// Helper para CSRF: usa window.CSRF si existe, o localStorage
const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));


const configurarOnboardingEntrenador = () => {
  const setupBar = document.getElementById("setup-bar");
  const setupDetails = document.getElementById("setup-bar-details");
  if (!setupBar) return;
  if (localStorage.getItem("onboarding_entrenador_closed") === "1") {
    setupBar.classList.add("d-none");
    setupDetails?.classList.add("d-none");
    return;
  }
  const hideBtn = document.getElementById("setup-bar-hide");
  const toggleBtn = document.getElementById("setup-bar-toggle");
  const toggleDetails = () => {
    if (!setupDetails) return;
    setupDetails.classList.toggle("d-none");
    if (toggleBtn) {
      toggleBtn.textContent = setupDetails.classList.contains("d-none") ? "Ver detalles" : "Ocultar";
    }
  };
  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      setupBar.classList.add("d-none");
      setupDetails?.classList.add("d-none");
      localStorage.setItem("onboarding_entrenador_closed", "1");
    });
  }
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleDetails);
  }
};


const setOnboardingBadge = (key, done, helpText) => {
  const el = document.querySelector(`[data-step-status="${key}"]`);
  if (el) {
    el.textContent = done ? "Completado" : "Pendiente";
    el.classList.remove("bg-secondary", "bg-success");
    el.classList.add(done ? "bg-success" : "bg-secondary");
  }
  const helpEl = document.querySelector(`[data-step-help="${key}"]`);
  if (helpEl && helpText) {
    helpEl.textContent = helpText;
  }
  actualizarSetupBar();
};

const actualizarSetupBar = () => {
  const chips = document.getElementById("setup-bar-chips");
  const countEl = document.getElementById("setup-bar-count");
  const progressEl = document.getElementById("setup-bar-progress");
  if (!chips || !countEl || !progressEl) return;
  const steps = Array.from(document.querySelectorAll('[data-step-status]'));
  const total = steps.length;
  const completados = steps.filter((step) => step.textContent.trim() === "Completado").length;
  countEl.textContent = `${completados}/${total} completado`;
  const porcentaje = total ? Math.round((completados / total) * 100) : 0;
  progressEl.style.width = `${porcentaje}%`;
  const labels = [
    "Atleta",
    "Zonas",
    "Plan",
    "Semana",
    "Comparativa"
  ];
  chips.innerHTML = steps
    .map((step, idx) => {
      const done = step.textContent.trim() === "Completado";
      return `<span class="setup-chip ${done ? 'setup-chip--done' : ''}">${done ? '✓' : idx + 1} ${labels[idx] || ''}</span>`;
    })
    .join('');
};

const evaluarOnboardingEntrenador = async () => {
  const card = document.getElementById("onboarding-entrenador");
  if (!card) return;
  try {
    const atletasRes = await fetch(`${API_BASE}/atletas`, { credentials: "include" });
    const atletas = atletasRes.ok ? await atletasRes.json() : [];
    const tieneAtletas = Array.isArray(atletas) && atletas.length > 0;
    setOnboardingBadge("crear-atleta", tieneAtletas, tieneAtletas ? "Atleta creado. Puedes seguir con zonas y VDOT." : "Crea el primer atleta para empezar a planificar.");

    let tieneZonas = false;
    let tieneAsignaciones = false;
    let tieneResultados = false;
    let anyAsignadoId = null;

    if (tieneAtletas) {
      for (const atleta of atletas) {
        try {
          const zonasRes = await fetch(`${API_BASE}/zonas_atleta/${atleta.id}`, { credentials: "include" });
          if (zonasRes.ok) {
            const zonas = await zonasRes.json();
            if (zonas && (zonas.vdot_val || zonas.z1 || zonas.fc_z1)) {
              tieneZonas = true;
            }
          }
        } catch (_) {}
        if (tieneZonas) break;
      }

      for (const atleta of atletas) {
        try {
          const asignRes = await fetch(`${API_BASE}/entrenamientos_asignados/${atleta.id}`, { credentials: "include" });
          if (asignRes.ok) {
            const asignados = await asignRes.json();
            if (Array.isArray(asignados) && asignados.length) {
              tieneAsignaciones = true;
              anyAsignadoId = asignados[0].id;
              break;
            }
          }
        } catch (_) {}
      }

      if (anyAsignadoId) {
        try {
          const resRes = await fetch(`${API_BASE}/entrenamientos_asignados/${anyAsignadoId}/resultados`, { credentials: "include" });
          if (resRes.ok) {
            const resultados = await resRes.json();
            if (Array.isArray(resultados) && resultados.length > 0) {
              tieneResultados = true;
            }
          }
        } catch (_) {}
      }
    }

    setOnboardingBadge("zonas-vdot", tieneZonas, tieneZonas ? "Zonas/VDOT configurados." : "Calcula zonas o VDOT para personalizar ritmos.");

    let tienePlan = false;
    try {
      const planRes = await fetch(`${API_BASE}/entrenamientos`, { credentials: "include" });
      if (planRes.ok) {
        const planes = await planRes.json();
        tienePlan = Array.isArray(planes) && planes.length > 0;
      }
    } catch (_) {}
    setOnboardingBadge("crear-plan", tienePlan, tienePlan ? "Ya tienes entrenamientos en biblioteca." : "Crea tu primer entrenamiento o plantilla.");
    setOnboardingBadge("asignar-semana", tieneAsignaciones, tieneAsignaciones ? "Semana asignada." : "Asigna una semana a tus atletas.");
    setOnboardingBadge("revisar-comparativa", tieneResultados, tieneResultados ? "Ya hay resultados para analizar." : "Registra al menos una sesión para ver comparativas.");
  } catch (err) {
    console.warn("No se pudo evaluar onboarding", err);
  }
};

const API_BASE =
  window.API_BASE_URL ||
  (window.location && window.location.origin
    ? window.location.origin
    : "http://127.0.0.1:5002");

// --- Inicialización por página ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("main.js cargado");

  const ruta = window.location.pathname;

  if (ruta.endsWith("atletas.html")) {
    import("./atletas.js")
      .then((module) => {
        Atletas = module;
        Atletas.init();
      })
      .catch((error) => {
        console.error("Error cargando atletas.js", error);
      });
  } else if (ruta.endsWith("entrenamientos.html")) {
    import("./entrenamientos.js")
      .then((module) => {
        Entrenamientos = module;
        if (Entrenamientos?.init) {
          Entrenamientos.init();
          return;
        }
        if (window.Entrenamientos?.init) {
          window.Entrenamientos.init();
        }
      })
      .catch((error) => {
        console.error("Error cargando entrenamientos.js", error);
      });
  } else if (ruta.endsWith("calendario.html")) {
    import("./calendario.js")
      .then((module) => {
        Calendario = module;
        Calendario.initCalendario();
      })
      .catch((error) => {
        console.error("Error cargando calendario.js", error);
      });
  } else if (ruta.endsWith("index.html")) {
    // Página de inicio del entrenador
    inicializarDashboardEntrenador();
    const rail = document.getElementById("coach-rail");
    const toggle = document.querySelector(".coach-rail__toggle");
    if (rail && toggle) {
      toggle.addEventListener("click", () => {
        rail.classList.toggle("is-open");
      });
    }
  }
});

function inicializarDashboardEntrenador() {
  inicializarCentroControl();
  cargarContextoAtletas();
  cargarProximosEntrenamientos();
  mostrarFeedbacksPendientes();
  configurarOnboardingEntrenador();
  evaluarOnboardingEntrenador();
  actualizarSetupBar();

  // Configurar modal de visibilidad
  const modalElement = document.getElementById("modalVisibilidadEntreno");
  if (modalElement && window.bootstrap && window.bootstrap.Modal) {
    modalVisibilidad = new bootstrap.Modal(modalElement);
  }

  const btnOcultar = document.getElementById("btn-modal-ocultar");
  const btnMostrar = document.getElementById("btn-modal-mostrar");

  if (btnOcultar) {
    btnOcultar.addEventListener("click", () => {
      cambiarVisibilidadDesdeModal(0);
    });
  }
  if (btnMostrar) {
    btnMostrar.addEventListener("click", () => {
      cambiarVisibilidadDesdeModal(1);
    });
  }
}

function inicializarCentroControl() {
  const fechaEl = document.getElementById("dashboard-date");
  const weekEl = document.getElementById("dashboard-week");
  const hoy = new Date();
  if (fechaEl) {
    const weekday = hoy.toLocaleDateString("es-ES", { weekday: "long" });
    const month = hoy.toLocaleDateString("es-ES", { month: "long" });
    const compactDate = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${hoy.getDate()} ${month}`;
    fechaEl.textContent = compactDate;
  }
  if (weekEl) {
    weekEl.textContent = `Semana ${getIsoWeek(hoy)}`;
  }
  const weekNoteEl = document.getElementById("weekly-summary-note");
  if (weekNoteEl) {
    weekNoteEl.textContent = `Datos de la semana actual (Semana ${getIsoWeek(hoy)})`;
  }

  const storedName =
    localStorage.getItem("userName") ||
    localStorage.getItem("userEmail") ||
    "";
  const readableName = storedName.includes("@") ? storedName.split("@")[0] : storedName;
  const displayName = !readableName || readableName.toLowerCase() === "entrenador" ? "Juan Carlos" : readableName;
  const greeting = document.getElementById("trainer-greeting");
  const nameEl = document.getElementById("trainer-name");
  const initialsEl = document.getElementById("trainer-initials");
  const sidebarNameEl = document.getElementById("sidebar-trainer-name");
  const sidebarInitialsEl = document.getElementById("sidebar-trainer-initials");
  if (greeting) greeting.textContent = `${saludoPorHora()}, ${displayName}`;
  if (nameEl) nameEl.textContent = displayName;
  if (sidebarNameEl) sidebarNameEl.textContent = displayName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (initialsEl) initialsEl.textContent = initials || "MP";
  if (sidebarInitialsEl) sidebarInitialsEl.textContent = initials || "MP";
  actualizarCabeceraPrioridad();
}

function saludoPorHora() {
  const hora = new Date().getHours();
  if (hora < 14) return "Buenos días";
  if (hora < 21) return "Buenas tardes";
  return "Buenas noches";
}

function textoPlural(valor, singular, plural) {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

function actualizarCabeceraPrioridad() {
  const priorityEl = document.getElementById("dashboard-priority");
  if (priorityEl) {
    const pendientes = textoPlural(dashboardState.pendientesPublicar, "entrenamiento pendiente de publicar", "entrenamientos pendientes de publicar");
    const revisar = textoPlural(dashboardState.sesionesPorRevisar, "sesión nueva por revisar", "sesiones nuevas por revisar");
    priorityEl.textContent = `Hoy tienes ${pendientes} y ${revisar}.`;
  }

  const planContext = document.getElementById("quick-plan-context");
  if (planContext) {
    planContext.textContent = `${dashboardState.pendientesPublicar} pendientes`;
  }

  const athletesContext = document.getElementById("quick-athletes-context");
  if (athletesContext) {
    athletesContext.textContent = `${dashboardState.atletasActivos} activos`;
  }

  const todayValues = {
    "today-pending-publish": dashboardState.pendientesPublicar,
    "today-review": dashboardState.sesionesPorRevisar,
    "today-alerts": dashboardState.alertas,
    "today-fit": dashboardState.feedbacks,
  };
  Object.entries(todayValues).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });

}

async function cargarContextoAtletas() {
  try {
    const res = await fetch(`${API_BASE}/atletas`, { credentials: "include" });
    if (!res.ok) return;
    const atletas = await res.json();
    dashboardState.atletasActivos = Array.isArray(atletas) ? atletas.length : 0;
    actualizarCabeceraPrioridad();
  } catch (err) {
    console.warn("No se pudo cargar el contexto de atletas", err);
  }
}

function actualizarActividadBadges(total) {
  dashboardState.sesionesPorRevisar = Number(total) || 0;
  dashboardState.feedbacks = Number(total) || 0;
  ["activity-count", "activity-badge"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(total);
  });
  const metricReview = document.getElementById("metric-review");
  if (metricReview) metricReview.textContent = String(dashboardState.sesionesPorRevisar);
  actualizarCabeceraPrioridad();
}

function actualizarResumenSemanal(entrenos) {
  const lista = Array.isArray(entrenos) ? entrenos : [];
  const sessionsEl = document.getElementById("metric-sessions");
  const athletesEl = document.getElementById("metric-athletes");
  const hiddenEl = document.getElementById("metric-hidden");
  const kmEl = document.getElementById("metric-km");

  const atletas = new Set();
  let ocultos = 0;
  let kmPlanificados = 0;
  lista.forEach((entreno) => {
    if (Number(entreno.visible) !== 1) ocultos += 1;
    const km = Number(
      entreno.km_planificados ??
      entreno.distancia_km ??
      entreno.distancia ??
      entreno.km ??
      0
    );
    if (Number.isFinite(km)) kmPlanificados += km;
    String(entreno.atletas_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => atletas.add(id));
  });
  dashboardState.sesionesPlanificadas = lista.length;
  dashboardState.pendientesPublicar = ocultos;

  if (sessionsEl) sessionsEl.textContent = String(lista.length);
  if (athletesEl) athletesEl.textContent = String(atletas.size || lista.reduce((acc, e) => acc + (Number(e.num_atletas) || 0), 0));
  if (hiddenEl) hiddenEl.textContent = String(ocultos);
  if (kmEl) kmEl.textContent = kmPlanificados > 0 ? `${kmPlanificados.toLocaleString("es-ES", { maximumFractionDigits: 1 })}` : "--";
  actualizarCabeceraPrioridad();
}

function renderPaginacionProximos(total) {
  const contenedor = document.getElementById("proximos-entrenamientos-paginacion");
  if (!contenedor) return;

  const totalPaginas = Math.max(1, Math.ceil(total / PROXIMOS_POR_PAGINA));
  if (total <= PROXIMOS_POR_PAGINA) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML = `
    <button type="button" class="training-pagination__btn" data-page-action="prev" ${proximosPaginaActual <= 1 ? "disabled" : ""}>
      Anterior
    </button>
    <span>Página ${proximosPaginaActual} de ${totalPaginas}</span>
    <button type="button" class="training-pagination__btn" data-page-action="next" ${proximosPaginaActual >= totalPaginas ? "disabled" : ""}>
      Siguiente
    </button>
  `;

  contenedor.querySelectorAll("[data-page-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.pageAction;
      const nextPage = action === "next" ? proximosPaginaActual + 1 : proximosPaginaActual - 1;
      proximosPaginaActual = Math.min(Math.max(nextPage, 1), totalPaginas);
      renderProximosEntrenamientos();
    });
  });
}

function renderProximosEntrenamientos() {
  const contenedor = document.getElementById("proximos-entrenamientos");
  if (!contenedor) return;

  contenedor.innerHTML = "";
  const total = proximosEntrenamientos.length;

  if (!total) {
    contenedor.innerHTML = '<p class="trainer-empty">No hay entrenamientos próximos.</p>';
    renderPaginacionProximos(0);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PROXIMOS_POR_PAGINA));
  proximosPaginaActual = Math.min(Math.max(proximosPaginaActual, 1), totalPaginas);
  const inicio = (proximosPaginaActual - 1) * PROXIMOS_POR_PAGINA;
  const entrenosPagina = proximosEntrenamientos.slice(inicio, inicio + PROXIMOS_POR_PAGINA);

  entrenosPagina.forEach((e, idx) => {
    const visibleValue = Number(e.visible);
    const esVisible = visibleValue === 1;
    const esProgramado = visibleValue === 2 || String(e.estado || "").toLowerCase() === "programado";
    const estadoTexto = esProgramado ? "Programado" : esVisible ? "Visible" : "Oculto";
    const statusClass = esProgramado ? "training-status--scheduled" : esVisible ? "training-status--visible" : "training-status--hidden";
    // calendario.html (v1) necesita un atleta concreto para mostrar algo;
    // sin eso solo pide "abre esto desde Mis atletas". Si el entrenamiento
    // es de un único atleta, llevamos directamente a su calendario en
    // atleta_planificacion.html (la vista v2); si es de grupo, no hay un
    // único calendario que mostrar, así que llevamos a Planificar semana.
    const atletasIds = String(e.atletas_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const destino =
      Number(e.num_atletas) === 1 && atletasIds.length === 1
        ? `atleta_planificacion.html?atletaId=${encodeURIComponent(atletasIds[0])}`
        : "planificacion_semanal.html";
    const primaryAction = esProgramado
      ? { label: "Ver programación", kind: "link", href: destino }
      : esVisible
        ? { label: "WhatsApp", kind: "link", href: "entrenamientos.html" }
        : { label: "Publicar", kind: "button" };
    const fecha = formatFechaDashboard(e.fecha);
    const div = document.createElement("div");
    div.className = "training-row";
    div.dataset.index = String(inicio + idx);

    div.innerHTML = `
      <div class="training-row__date">
        <strong>${fecha.dia}</strong>
        <span>${fecha.mes}</span>
      </div>
      <span class="training-row__icon ${esVisible ? "training-row__icon--green" : esProgramado ? "training-row__icon--orange" : "training-row__icon--blue"}">▰</span>
      <div class="training-row__main">
        <strong>${escapeHtml(e.nombre || "Entrenamiento")}</strong>
        <span>${formatFechaCorta(e.fecha)} · ${Number(e.num_atletas) || 0} atletas</span>
      </div>
      <div class="training-row__group">
        <strong>${Number(e.num_atletas) > 1 ? "Grupo asignado" : "Atleta"}</strong>
        <span>${Number(e.num_atletas) || 0} atletas</span>
      </div>
      <span class="training-status ${statusClass}">${estadoTexto}</span>
      <div class="training-row__actions">
        ${
          primaryAction.kind === "button"
            ? '<button class="training-action training-action--primary" type="button" data-action="publish">Publicar</button>'
            : `<a class="training-action training-action--primary" href="${primaryAction.href}" data-action="primary">${primaryAction.label}</a>`
        }
        <a class="training-action training-action--secondary" href="${destino}" data-action="view">Ver</a>
        <a class="training-action training-action--secondary" href="${destino}" data-action="edit">Editar</a>
      </div>
    `;

    div.querySelectorAll("a, button").forEach((actionEl) => {
      actionEl.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    });

    const publishBtn = div.querySelector('[data-action="publish"]');
    if (publishBtn) {
      publishBtn.addEventListener("click", () => {
        entrenoSeleccionado = e;
        cambiarVisibilidadDesdeModal(1);
      });
    }

    div.addEventListener("click", () => {
      entrenoSeleccionado = e;
      const info = document.getElementById("modal-entreno-info");
      if (info) {
        info.textContent = `${e.nombre} · ${formatFechaCorta(e.fecha)} · ${e.num_atletas} atletas`;
      }
      if (modalVisibilidad) {
        modalVisibilidad.show();
      }
    });

    contenedor.appendChild(div);
  });

  renderPaginacionProximos(total);
}

// --- FEEDBACKS PENDIENTES ---
async function mostrarFeedbacksPendientes() {
  const contenedor = document.getElementById("feedbacks-pendientes");
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_BASE}/feedbacks_pendientes`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("Error HTTP en feedbacks_pendientes:", res.status);
      contenedor.innerHTML =
        '<p class="trainer-error">Error al cargar los feedbacks.</p>';
      actualizarActividadBadges(0);
      return;
    }

    const feedbacks = await res.json();
    contenedor.innerHTML = "";

    if (!Array.isArray(feedbacks)) {
      contenedor.innerHTML =
        '<p class="trainer-error">Error al procesar los feedbacks.</p>';
      actualizarActividadBadges(0);
      return;
    }

    actualizarActividadBadges(feedbacks.length);
    dashboardState.alertas = feedbacks.filter((fb) => {
      const rpeVal = Number(fb.rpe);
      return Number(fb.dolor) === 1 || fb.dolor === true || rpeVal >= 8;
    }).length;
    actualizarCabeceraPrioridad();

    if (feedbacks.length === 0) {
      contenedor.innerHTML =
        '<p class="trainer-empty">No hay actividad pendiente.</p>';
      return;
    }

    feedbacks.slice(0, 3).forEach((fb) => {
      const item = document.createElement("article");
      item.className = "activity-item";
      const comentario = fb.comentario ? fb.comentario.slice(0, 42) : "";
      const rpeVal = Number(fb.rpe);
      const tieneDolor = Number(fb.dolor) === 1 || fb.dolor === true;
      const iconClass = tieneDolor || rpeVal >= 9 ? "activity-item__icon--red" : rpeVal >= 7 ? "activity-item__icon--orange" : "activity-item__icon--violet";
      const title = tieneDolor ? "Molestias reportadas" : rpeVal >= 8 ? "RPE alto" : "Nuevo feedback";
      const chip = tieneDolor && fb.zona_dolor ? escapeHtml(fb.zona_dolor) : rpeVal ? `RPE ${rpeVal}` : "Nuevo";
      const actionText = tieneDolor || rpeVal >= 8 ? "Revisar" : "Ver feedback";
      item.innerHTML = `
          <span class="activity-item__icon ${iconClass}">${tieneDolor ? "!" : "~"}</span>
          <div class="activity-item__body">
            <strong>${escapeHtml(fb.atleta || "Atleta")}</strong>
            <span>${escapeHtml(title)}${fb.entrenamiento_nombre ? ` · ${escapeHtml(fb.entrenamiento_nombre)}` : ""}</span>
            ${comentario ? `<small>${escapeHtml(comentario)}</small>` : ""}
            <small>${formatFechaCorta(fb.fecha)}</small>
          </div>
          <div class="activity-item__side">
            <span class="activity-chip">${chip}</span>
            <a class="activity-action" href="feedback.html?id=${fb.id}">${actionText}</a>
          </div>
      `;
      contenedor.appendChild(item);
    });
  } catch (err) {
    console.error("Error al obtener feedbacks pendientes:", err);
    contenedor.innerHTML =
      '<p class="trainer-error">Error al cargar los feedbacks.</p>';
    actualizarActividadBadges(0);
  }
}

// --- PRÓXIMOS ENTRENAMIENTOS ---
async function cargarProximosEntrenamientos() {
  const contenedor = document.getElementById("proximos-entrenamientos");

  try {
    const res = await fetch(`${API_BASE}/entrenamientos_proximos`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("Error HTTP en entrenamientos_proximos:", res.status);
      if (contenedor) {
        contenedor.innerHTML =
          '<p class="trainer-error">Error al cargar los entrenamientos.</p>';
      }
      actualizarResumenSemanal([]);
      proximosEntrenamientos = [];
      renderPaginacionProximos(0);
      return;
    }

    const entrenos = await res.json();
    if (contenedor) contenedor.innerHTML = "";
    proximosEntrenamientos = Array.isArray(entrenos) ? entrenos : [];
    proximosPaginaActual = 1;
    actualizarResumenSemanal(proximosEntrenamientos);

    if (!contenedor) return;

    if (!proximosEntrenamientos.length) {
      renderProximosEntrenamientos();
      return;
    }

    renderProximosEntrenamientos();
  } catch (err) {
    console.error("Error cargando entrenamientos:", err);
    if (contenedor) {
      contenedor.innerHTML =
        '<p class="trainer-error">Error al cargar los entrenamientos.</p>';
    }
    actualizarResumenSemanal([]);
    proximosEntrenamientos = [];
    renderPaginacionProximos(0);
  }
}

// --- Cambiar visibilidad desde el modal ---
function cambiarVisibilidadDesdeModal(nuevoVisible) {
  if (!entrenoSeleccionado) return;

  actualizarVisibilidad(nuevoVisible)
    .then(() => {
      if (modalVisibilidad) {
        modalVisibilidad.hide();
      }
      // Recargar la sección para reflejar cambios
      cargarProximosEntrenamientos();
    })
    .catch((err) => {
      console.error("Error al actualizar visibilidad:", err);
      alert("Error al actualizar visibilidad del entrenamiento.");
    });
}

// --- Obtener IDs de atletas del entrenador (para usar en visibilidad grupal) ---
async function obtenerAtletasIdsEntrenador() {
  if (Array.isArray(cachedAtletasIds) && cachedAtletasIds.length > 0) {
    return cachedAtletasIds;
  }

  const res = await fetch(`${API_BASE}/atletas`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Error al obtener atletas del entrenador");
  }

  const atletas = await res.json();
  cachedAtletasIds = atletas.map((a) => a.id);
  return cachedAtletasIds;
}

// --- Llamada al backend para actualizar visibilidad ---
async function actualizarVisibilidad(visible) {
  if (!entrenoSeleccionado) return;

  const atletasIds = await obtenerAtletasIdsEntrenador();

  const payload = {
    atletas: atletasIds, // todos los atletas del entrenador
    fecha: entrenoSeleccionado.fecha, // se usa DATE(fecha) en el backend
    visible: visible,
  };

  console.log("Enviando actualización de visibilidad:", payload);

  const res = await fetch(`${API_BASE}/entrenamientos_asignados/visibilidad`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCsrfToken(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("Respuesta HTTP al actualizar visibilidad:", res.status);
    const texto = await res.text().catch(() => "");
    console.error("Cuerpo de la respuesta:", texto);
    throw new Error("Error al actualizar visibilidad " + res.status);
  }

  const data = await res.json().catch(() => ({}));
  console.log("Visibilidad actualizada correctamente:", data);
}
