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

// Helper para CSRF: usa window.CSRF si existe, o localStorage
const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

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
        Entrenamientos.init();
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
  }
});

function inicializarDashboardEntrenador() {
  cargarProximosEntrenamientos();
  mostrarFeedbacksPendientes();

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
    const res = await fetch("http://127.0.0.1:5000/feedbacks_pendientes", {
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
      li.innerHTML = `
        <a href="feedback.html?id=${fb.id}" class="text-decoration-none">
          <strong>${fb.atleta}:</strong> ${fb.comentario.slice(0, 40)}...
          ${fb.url_datos ? `<br><small><a href="${fb.url_datos}" target="_blank" rel="noopener">Actividad</a></small>` : ""}
          <br><small>${formatFechaCorta(fb.fecha)}</small>
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
    const res = await fetch("http://127.0.0.1:5000/entrenamientos_proximos", {
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

  const res = await fetch("http://127.0.0.1:5000/atletas", {
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

  const res = await fetch(
    "http://127.0.0.1:5000/entrenamientos_asignados/visibilidad",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    console.error("Respuesta HTTP al actualizar visibilidad:", res.status);
    const texto = await res.text().catch(() => "");
    console.error("Cuerpo de la respuesta:", texto);
    throw new Error("Error al actualizar visibilidad " + res.status);
  }

  const data = await res.json().catch(() => ({}));
  console.log("Visibilidad actualizada correctamente:", data);
}
