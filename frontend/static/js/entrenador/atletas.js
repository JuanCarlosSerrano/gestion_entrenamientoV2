// frontend/js/entrenador/atletas.js

const API_BASE = window.API_BASE || "http://127.0.0.1:5000";
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

document.addEventListener("DOMContentLoaded", () => {
  const contenedor = document.getElementById("atletas-cards");

  // Elementos del modal Editar Atleta
  const modalEditarEl = document.getElementById("modalEditarAtleta");
  const modalEditar = bootstrap.Modal.getOrCreateInstance(modalEditarEl);

  const formEditar = document.getElementById("form-editar-atleta");
  const inputId = document.getElementById("edit-atleta-id");
  const inputNombre = document.getElementById("edit-nombre");
  const inputApellidos = document.getElementById("edit-apellidos");
  const inputEmail = document.getElementById("edit-email");
  const inputTelefono = document.getElementById("edit-telefono");
  const inputFecha = document.getElementById("edit-fecha-nacimiento");
  const inputCategoria = document.getElementById("edit-categoria");
  const inputGrupo = document.getElementById("edit-grupo");
  const inputSubgrupo = document.getElementById("edit-subgrupo");
  const btnEliminarAtleta = document.getElementById("btn-eliminar-atleta");

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
              <button class="btn btn-sm btn-primary btn-editar-atleta" data-id="${
                a.id
              }">
                Editar
              </button>
            </div>
          </div>
        </div>
      `;

      contenedor.appendChild(col);
    });

    // Asignar eventos a botones Editar
    contenedor
      .querySelectorAll(".btn-editar-atleta")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          abrirModalEdicion(btn.getAttribute("data-id"))
        )
      );
  }

  // 3️⃣ Abrir modal con datos del atleta
  async function abrirModalEdicion(atletaId) {
    try {
      const res = await fetch(`${API_BASE}/atletas/${atletaId}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        console.error("Error al cargar atleta:", res.status);
        mostrarMensaje("No se pudo cargar los datos del atleta", "danger");
        return;
      }

      const a = await res.json();

      inputId.value = a.id;
      inputNombre.value = a.nombre || "";
      inputApellidos.value = a.apellidos || "";
      inputEmail.value = a.email || "";
      inputTelefono.value = a.telefono || "";
      inputFecha.value = a.fecha_nacimiento || "";
      inputCategoria.value = a.categoria || "";
      inputGrupo.value = a.grupo || "";
      inputSubgrupo.value = a.subgrupo || "";

      modalEditar.show();
    } catch (err) {
      console.error("Error de red al cargar atleta:", err);
      mostrarMensaje("Error al cargar atleta", "danger");
    }
  }

  // 4️⃣ Guardar cambios (PUT /atletas/:id)
  formEditar.addEventListener("submit", async (e) => {
    e.preventDefault();

    const atletaId = inputId.value;
    if (!atletaId) {
      mostrarMensaje("Atleta no válido", "danger");
      return;
    }

    const payload = {
      nombre: inputNombre.value.trim(),
      apellidos: inputApellidos.value.trim(),
      email: inputEmail.value.trim(),
      telefono: inputTelefono.value.trim(),
      fecha_nacimiento: inputFecha.value || null,
      categoria: inputCategoria.value.trim(),
      grupo: inputGrupo.value.trim(),
      subgrupo: inputSubgrupo.value.trim(),
    };

    try {
      const res = await fetch(`${API_BASE}/atletas/${atletaId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Error al actualizar atleta:", res.status, data);
        mostrarMensaje(
          data.error || "Error al actualizar atleta",
          "danger"
        );
        return;
      }

      mostrarMensaje(
        data.message || "Atleta actualizado correctamente",
        "success"
      );
      modalEditar.hide();
      cargarAtletas();
    } catch (err) {
      console.error("Error de red al actualizar atleta:", err);
      mostrarMensaje("Error al actualizar atleta", "danger");
    }
  });

  // 5️⃣ Eliminar atleta (DELETE /atletas/:id)
  btnEliminarAtleta.addEventListener("click", () => {
    const atletaId = inputId.value;
    if (!atletaId) return;

    mostrarConfirmacion(
      "¿Seguro que deseas eliminar este atleta? Esta acción no se puede deshacer.",
      async () => {
        try {
          const res = await fetch(`${API_BASE}/atletas/${atletaId}`, {
            method: "DELETE",
            credentials: "include",
            headers: {
              "X-CSRF-Token": getCsrfToken(),
            },
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            console.error("Error al eliminar atleta:", res.status, data);
            mostrarMensaje(
              data.error || "Error al eliminar atleta",
              "danger"
            );
            return;
          }

          mostrarMensaje(
            data.message || "Atleta eliminado correctamente",
            "success"
          );
          modalEditar.hide();
          cargarAtletas();
        } catch (err) {
          console.error("Error de red al eliminar atleta:", err);
          mostrarMensaje("Error al eliminar atleta", "danger");
        }
      }
    );
  });

  // 🚀 Inicializar
  cargarAtletas();
});
