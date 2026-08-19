const API =
  window.API_BASE ||
  (window.location && window.location.origin
    ? window.location.origin
    : "http://127.0.0.1:5000");
window.API_BASE = API;

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

document.addEventListener("DOMContentLoaded", async function () {
  // --- Helpers ---
  const formFiltros = document.getElementById("form-filtros");
  const formAsignar = document.getElementById("form-asignar-entrenamiento");
  const tablaBody = document.querySelector("#tabla-atletas tbody");
  const checkTodos = document.getElementById("check-todos");
  const selectEntrenamiento = document.getElementById("select-entrenamiento");
  const fechaInput = document.getElementById("fecha");
  const contenedorResumen = document.getElementById("resumen-asignacion");
  const btnVolver = document.getElementById("btn-volver");

  // Visibilidad grupal
  const visGrupoFecha = document.getElementById("vis-grupo-fecha");
  const visGrupoModo = document.getElementById("vis-grupo-modo");
  const btnGrupoMostrar = document.getElementById("btn-grupo-mostrar");
  const btnGrupoOcultar = document.getElementById("btn-grupo-ocultar");

  let entrenamientos = [];

  function mostrarMensaje(texto, tipo = "info") {
    if (!contenedorResumen) return;
    const mapaBootstrap = {
      success: "alert-success",
      danger: "alert-danger",
      warning: "alert-warning",
      info: "alert-info",
    };
    const clase = mapaBootstrap[tipo] || "alert-info";
    contenedorResumen.innerHTML = `
      <div class="alert ${clase} mb-3">
        ${texto}
      </div>
    `;
  }

  // --- Carga inicial de atletas y entrenamientos tipo ---

  async function cargarAtletasIniciales() {
    try {
      const res = await fetch(`${API}/atletas_filtrados`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("No se pudieron cargar los atletas");
      const atletas = await res.json();
      renderTabla(atletas);
    } catch (err) {
      console.error("Error al cargar atletas iniciales:", err);
      mostrarMensaje("Error al cargar atletas.", "danger");
    }
  }

  try {
    const res = await fetch(`${API}/entrenamientos`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("No se pudieron cargar los entrenamientos");
    entrenamientos = await res.json();
    selectEntrenamiento.innerHTML = entrenamientos
      .map((e) => `<option value="${e.id}">${e.nombre}</option>`)
      .join("");
  } catch (err) {
    console.error("Error al cargar entrenamientos tipo:", err);
    mostrarMensaje("Error al cargar entrenamientos tipo.", "danger");
  }

  cargarAtletasIniciales();

  // --- Filtros de atletas ---

  formFiltros.addEventListener("submit", async function (e) {
    e.preventDefault();
    const grupo = document.getElementById("grupo").value;
    const subgrupo = document.getElementById("subgrupo").value;
    const categoria = document.getElementById("categoria").value;

    let url = new URL(`${API}/atletas_filtrados`);
    if (grupo) url.searchParams.append("grupo", grupo);
    if (subgrupo) url.searchParams.append("subgrupo", subgrupo);
    if (categoria) url.searchParams.append("categoria", categoria);

    try {
      const res = await fetch(url, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("No se pudieron cargar los atletas");
      const atletas = await res.json();
      renderTabla(atletas);
    } catch (err) {
      console.error("Error al filtrar atletas:", err);
      mostrarMensaje("Error al filtrar atletas.", "danger");
    }
  });

  // --- DataTable y tabla de atletas ---

  function renderTabla(atletas) {
    // Destruir DataTable si ya está inicializado
    if ($.fn.DataTable.isDataTable("#tabla-atletas")) {
      $("#tabla-atletas").DataTable().destroy();
    }

    // Vaciar tabla
    tablaBody.innerHTML = "";

    atletas.forEach((a) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" class="check-atleta" value="${a.id}" /></td>
        <td>${a.nombre}</td>
        <td>${a.apellidos}</td>
        <td>${a.email}</td>
        <td>${a.grupo || "-"}</td>
        <td>${a.subgrupo || "-"}</td>
        <td>${a.categoria || "-"}</td>
      `;
      tablaBody.appendChild(row);
    });

    // Volver a inicializar DataTables
    $("#tabla-atletas").DataTable({
      order: [],
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json",
      },
    });

    // Re-sincronizar el checkbox "todos"
    checkTodos.checked = false;
  }

  checkTodos.addEventListener("change", () => {
    document.querySelectorAll(".check-atleta").forEach((cb) => {
      cb.checked = checkTodos.checked;
    });
  });

  // --- Asignar entrenamiento tipo a varios atletas ---

  formAsignar.addEventListener("submit", async function (e) {
    e.preventDefault();
    const fecha = fechaInput.value;
    const entrenamiento_id = selectEntrenamiento.value;
    const atletasSeleccionados = Array.from(
      document.querySelectorAll(".check-atleta:checked")
    ).map((cb) => cb.value);

    if (!fecha) {
      alert("Selecciona una fecha.");
      return;
    }

    if (atletasSeleccionados.length === 0) {
      alert("Debes seleccionar al menos un atleta");
      return;
    }

    const entrenamientoSeleccionado = entrenamientos.find(
      (e) => e.id == entrenamiento_id
    );
    const nombre = entrenamientoSeleccionado
      ? entrenamientoSeleccionado.nombre
      : "Entrenamiento";

    if (
      !confirm(
        `¿Asignar '${nombre}' a ${atletasSeleccionados.length} atletas en la fecha ${fecha}?`
      )
    ) {
      return;
    }

    try {
      let token = getCsrfToken();
      if ((!token || token === "undefined") && window.CSRF?.ensureToken) {
        token = await window.CSRF.ensureToken(true);
      }

      const res = await fetch(`${API}/asignar_entrenamiento_lote`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
        body: JSON.stringify({
          fecha,
          entrenamiento_id,
          atletas_ids: atletasSeleccionados,
          nombre,
        }),
      });

      const resultado = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          resultado.error || "No se pudo asignar el entrenamiento"
        );
      }

      mostrarMensaje(
        resultado.message || "Entrenamiento asignado correctamente",
        "success"
      );
    } catch (err) {
      console.error("Error al asignar entrenamiento:", err);
      mostrarMensaje(
        err.message || "Error al asignar el entrenamiento",
        "danger"
      );
    }
  });

  // --- Volver al panel ---

  btnVolver.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // --- Visibilidad grupal ---

  if (visGrupoFecha && !visGrupoFecha.value) {
    visGrupoFecha.value = new Date().toISOString().slice(0, 10);
  }

  async function actualizarVisibilidadGrupo(visible) {
    const fecha = visGrupoFecha?.value;
    const modo = visGrupoModo?.value || "dia";
    const atletasSeleccionados = Array.from(
      document.querySelectorAll(".check-atleta:checked")
    )
      .map((cb) => parseInt(cb.value, 10))
      .filter((id) => Number.isFinite(id));

    if (!fecha) {
      alert("Selecciona una fecha para actualizar la visibilidad.");
      return;
    }
    if (!atletasSeleccionados.length) {
      alert("Debes seleccionar al menos un atleta.");
      return;
    }

    const confirmMsg = visible
      ? `¿Mostrar los entrenamientos de ${modo} para ${atletasSeleccionados.length} atletas?`
      : `¿Ocultar los entrenamientos de ${modo} para ${atletasSeleccionados.length} atletas?`;
    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      let token = getCsrfToken();
      if ((!token || token === "undefined") && window.CSRF?.ensureToken) {
        token = await window.CSRF.ensureToken(true);
      }

      const payload = {
        atletas: atletasSeleccionados,
        fecha,
        modo,
        visible: visible ? 1 : 0,
      };

      const res = await fetch(`${API}/entrenamientos_asignados/visibilidad`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "No se pudo actualizar la visibilidad grupal"
        );
      }

      const num = data.updated ?? data.actualizados ?? 0;
      mostrarMensaje(
        data.message ||
          `Visibilidad actualizada para ${atletasSeleccionados.length} atletas (${num} entrenamientos afectados).`,
        "info"
      );
    } catch (err) {
      console.error("Error al actualizar visibilidad grupal:", err);
      mostrarMensaje(
        err.message || "Error al actualizar visibilidad.",
        "danger"
      );
    }
  }

  btnGrupoMostrar?.addEventListener("click", (e) => {
    e.preventDefault();
    actualizarVisibilidadGrupo(true);
  });

  btnGrupoOcultar?.addEventListener("click", (e) => {
    e.preventDefault();
    actualizarVisibilidadGrupo(false);
  });
});

