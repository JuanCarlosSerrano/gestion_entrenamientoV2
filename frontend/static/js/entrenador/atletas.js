// frontend/js/entrenador/atletas.js

const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

// 💬 Mensaje flotante reutilizable
function mostrarMensaje(texto, tipo = "success") {
  let contenedor = document.getElementById("mensaje-flotante");
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.id = "mensaje-flotante";
    contenedor.className =
      "alert text-center position-fixed bottom-0 start-50 translate-middle-x w-50";
    contenedor.style.zIndex = "2000";
    contenedor.style.display = "none";

    const span = document.createElement("span");
    span.id = "mensaje-texto";
    contenedor.appendChild(span);
    document.body.appendChild(contenedor);
  }

  const span = document.getElementById("mensaje-texto");
  contenedor.classList.remove(
    "alert-success",
    "alert-danger",
    "alert-warning",
    "alert-info"
  );
  contenedor.classList.add(`alert-${tipo}`);

  span.textContent = texto;
  contenedor.style.display = "block";

  setTimeout(() => {
    contenedor.style.display = "none";
  }, 2500);
}

// ✅ Confirmación usando modalConfirmacion (si existe)
function mostrarConfirmacion(mensaje, onConfirm) {
  const modalEl = document.getElementById("modalConfirmacion");
  const mensajeEl = document.getElementById("modal-confirmacion-mensaje");
  const btnAceptar = document.getElementById("modal-confirmacion-aceptar");

  // Si por lo que sea no está el modal en el HTML, hacemos fallback al confirm nativo
  if (!modalEl || !mensajeEl || !btnAceptar) {
    const ok = window.confirm(mensaje);
    if (ok && typeof onConfirm === "function") onConfirm();
    return;
  }

  mensajeEl.textContent = mensaje;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  // Evitamos acumular múltiples handlers
  btnAceptar.onclick = () => {
    modal.hide();
    if (typeof onConfirm === "function") onConfirm();
  };

  modal.show();
}

/*
  Implementación mínima y segura de Atletas:
  - Si existe window.Atletas.init (legacy global), la invoca.
  - No intenta cargar ficheros adicionales para evitar 404.
  - Exporta default y named export `init` para compatibilidad con main.js.
*/
async function initAtletas() {
  try {
    if (window.Atletas && typeof window.Atletas.init === 'function') {
      console.info('Atletas: usando implementación global legacy (window.Atletas.init).');
      return await window.Atletas.init();
    }

    // Inicialización ligera por defecto (no rompe la app)
    console.info('Atletas: no hay implementación global. Ejecutando init vacía (noop).');
    // Si quieres aquí puedes inicializar elementos DOM mínimos para evitar más errores.
    // Ejemplo: comprobar existencia del contenedor y establecer estado vacío.
    const container = document.querySelector('.atletas-lista') || document.getElementById('atletas-lista');
    if (container) {
      container.innerHTML = container.innerHTML || '<div class="text-muted small">No hay datos de atletas (stub).</div>';
    }

    return Promise.resolve();
  } catch (err) {
    console.error('Atletas.init: error durante la inicialización:', err);
    return Promise.reject(err);
  }
}

// Exportaciones compatibles
export default { init: initAtletas };
export { initAtletas as init };

document.addEventListener("DOMContentLoaded", () => {
  const contenedor = document.getElementById("atletas-cards");

  // 1️⃣ Cargar lista de atletas
  async function cargarAtletas() {
    try {
      const res = await fetch(`${API_BASE}/atletas`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        console.error("Error al cargar atletas:", res.status);
        mostrarMensaje("Error al cargar atletas", "danger");
        return;
      }

      const atletas = await res.json();
      pintarAtletas(atletas);
    } catch (err) {
      console.error("Error de red al cargar atletas:", err);
      mostrarMensaje("Error de conexión al cargar atletas", "danger");
    }
  }

  // 2️⃣ Pintar tarjetas
  function pintarAtletas(atletas) {
    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (!Array.isArray(atletas) || atletas.length === 0) {
      contenedor.innerHTML =
        '<div class="col-12"><div class="alert alert-info">No hay atletas asignados.</div></div>';
      return;
    }

    atletas.forEach((a) => {
      const col = document.createElement("div");
      col.className = "col-md-6 col-lg-4 mb-3";

      col.innerHTML = `
        <div class="card h-100 shadow-sm">
          <div class="card-body">
            <h5 class="card-title">${a.nombre} ${a.apellidos}</h5>
            <p class="card-text mb-1"><strong>Fecha:</strong> ${
              a.fecha_nacimiento || "-"
            }</p>
            <p class="card-text mb-1"><strong>Email:</strong> ${
              a.email || "-"
            }</p>
            <p class="card-text mb-1"><strong>Teléfono:</strong> ${
              a.telefono || "-"
            }</p>
            <p class="card-text mb-2"><strong>Categoría:</strong> ${
              a.categoria || "-"
            }</p>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <a href="calendario.html?atletaId=${a.id}" class="btn btn-sm btn-success">
                Ver Calendario
              </a>
              <a class="btn btn-sm btn-primary" href="perfil_atleta.html?atletaId=${a.id}">
                Editar
              </a>
            </div>
          </div>
        </div>
      `;

      contenedor.appendChild(col);
    });
  }

  // 🚀 Inicializar
  cargarAtletas();
});
