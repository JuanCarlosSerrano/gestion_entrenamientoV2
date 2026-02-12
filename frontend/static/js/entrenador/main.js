let Atletas;
let Calendario;
let Entrenamientos;

// Entrenamiento seleccionado en el panel de "Próximos entrenamientos"
let entrenoSeleccionado = null;
let modalVisibilidad = null;
let cachedAtletasIds = null;

const formatFechaCorta = (valor) => {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor || "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

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
        '<p class="text-danger">Error al cargar los feedbacks.</p>';
      return;
    }

    const feedbacks = await res.json();
    contenedor.innerHTML = "";

    if (!Array.isArray(feedbacks)) {
      contenedor.innerHTML =
        '<p class="text-danger">Error al procesar los feedbacks.</p>';
      return;
    }

    if (feedbacks.length === 0) {
      contenedor.innerHTML =
        '<p class="text-muted">No hay feedbacks pendientes.</p>';
      return;
    }

    const lista = document.createElement("ul");
    lista.classList.add("list-group", "mt-3");

    feedbacks.forEach((fb) => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      const comentario = fb.comentario ? fb.comentario.slice(0, 80) : "Sin comentario";
      const resumen = renderChipsFeedback(fb);
      li.innerHTML = `
        <a href="feedback.html?id=${fb.id}" class="text-decoration-none d-block">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <strong>${fb.atleta}</strong>
              ${fb.entrenamiento_nombre ? `<div class="small text-muted">${fb.entrenamiento_nombre}</div>` : ""}
              ${resumen ? `<div class="d-flex flex-wrap gap-1 mt-2">${resumen}</div>` : ""}
              <div class="mt-2 text-body">${comentario}</div>
              ${
                fb.url_datos
                  ? `<small><a href="${fb.url_datos}" target="_blank" rel="noopener">Actividad</a></small><br>`
                  : ""
              }
              <small class="text-muted">${formatFechaCorta(fb.fecha)}</small>
            </div>
            <span class="chip chip-warning ms-2">Nuevo</span>
          </div>
        </a>
      `;
      lista.appendChild(li);
    });

    contenedor.appendChild(lista);
  } catch (err) {
    console.error("Error al obtener feedbacks pendientes:", err);
    contenedor.innerHTML =
      '<p class="text-danger">Error al cargar los feedbacks.</p>';
  }
}

// --- PRÓXIMOS ENTRENAMIENTOS ---
async function cargarProximosEntrenamientos() {
  const contenedor = document.getElementById("proximos-entrenamientos");
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_BASE}/entrenamientos_proximos`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("Error HTTP en entrenamientos_proximos:", res.status);
      contenedor.innerHTML =
        '<p class="text-danger">Error al cargar los entrenamientos.</p>';
      return;
    }

    const entrenos = await res.json();
    contenedor.innerHTML = "";

    if (!Array.isArray(entrenos) || entrenos.length === 0) {
      contenedor.innerHTML =
        '<p class="text-muted">No hay entrenamientos próximos.</p>';
      return;
    }

    entrenos.forEach((e, idx) => {
      const esVisible = Number(e.visible) === 1; // 1 = visible, 0 = oculto
      const estadoTexto = esVisible
        ? "Visible para atletas"
        : "Oculto para atletas";

      const colorClase = esVisible
        ? "border-success text-success"
        : "border-primary text-primary";

      const div = document.createElement("div");
      div.className = `mb-2 p-2 rounded border ${colorClase}`;
      div.style.cursor = "pointer";
      div.dataset.index = idx;

      div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${e.nombre}</strong><br>
            <small>${formatFechaCorta(e.fecha)} · ${e.num_atletas} atletas</small>
          </div>
          <span class="badge ${esVisible ? "bg-success" : "bg-primary"}">
            ${estadoTexto}
          </span>
        </div>
      `;

      // Al hacer clic, abrir modal para cambiar visibilidad
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
  } catch (err) {
    console.error("Error cargando entrenamientos:", err);
    contenedor.innerHTML =
      '<p class="text-danger">Error al cargar los entrenamientos.</p>';
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
