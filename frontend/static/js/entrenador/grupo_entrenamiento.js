const API = window.API_BASE || "http://127.0.0.1:5000";
window.API_BASE = API;

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

document.addEventListener("DOMContentLoaded", async function () {
  const formFiltros = document.getElementById("form-filtros");
  const formAsignar = document.getElementById("form-asignar-entrenamiento");
  const tablaBody = document.querySelector("#tabla-atletas tbody");
  const checkTodos = document.getElementById("check-todos");
  const selectEntrenamiento = document.getElementById("select-entrenamiento");
  const fechaInput = document.getElementById("fecha");
  const contenedorResumen = document.getElementById("resumen-asignacion");
  const btnVolver = document.getElementById("btn-volver");
  const formAsignarCiclo = document.getElementById("form-asignar-ciclo");
  const selectCicloTipo = document.getElementById("select-ciclo-tipo");
  const selectCicloId = document.getElementById("select-ciclo-id");
  const fechaCicloInput = document.getElementById("fecha-ciclo");
  const ayudaCiclo = document.getElementById("ayuda-ciclo-grupo");

  let entrenamientos = [];
  const ciclosCache = {
    macro: null,
    meso: null,
    micro: null,
  };

  async function cargarAtletasIniciales() {
    try {
      const res = await fetch(`${API}/atletas_filtrados`, {
        credentials: "include",
        headers: {
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
      });
      if (!res.ok) throw new Error("No se pudieron cargar los atletas");
      const atletas = await res.json();
      renderTabla(atletas);
    } catch (err) {
      console.error("Error al cargar atletas iniciales:", err);
    }
  }

  try {
    const res = await fetch(`${API}/entrenamientos`, {
      credentials: "include",
      headers: {
        Authorization:
          "Basic " +
          btoa(
            `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
          ),
      },
    });
    if (!res.ok) throw new Error("No se pudieron cargar los entrenamientos");
    entrenamientos = await res.json();
    selectEntrenamiento.innerHTML = entrenamientos
      .map((e) => `<option value="${e.id}">${e.nombre}</option>`) 
      .join("");
  } catch (err) {
    console.error("Error al cargar entrenamientos tipo:", err);
    alert("Error al cargar entrenamientos");
  }

  cargarAtletasIniciales();

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
        headers: {
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
      });
      if (!res.ok) throw new Error("No se pudieron cargar los atletas");
      const atletas = await res.json();
      renderTabla(atletas);
    } catch (err) {
      console.error("Error al filtrar atletas:", err);
      alert("Error al filtrar atletas");
    }
  });

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
        url: "//cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json",
      },
    });
  }

  checkTodos.addEventListener("change", () => {
    document.querySelectorAll(".check-atleta").forEach((cb) => {
      cb.checked = checkTodos.checked;
    });
  });

  formAsignar.addEventListener("submit", async function (e) {
    e.preventDefault();
    const fecha = fechaInput.value;
    const entrenamiento_id = selectEntrenamiento.value;
    const atletasSeleccionados = Array.from(document.querySelectorAll(".check-atleta:checked"))
      .map((cb) => cb.value);

    if (atletasSeleccionados.length === 0) {
      alert("Debes seleccionar al menos un atleta");
      return;
    }

    const entrenamientoSeleccionado = entrenamientos.find((e) => e.id == entrenamiento_id);
    const nombre = entrenamientoSeleccionado ? entrenamientoSeleccionado.nombre : "Entrenamiento";

    if (!confirm(`¿Asignar '${nombre}' a ${atletasSeleccionados.length} atletas en la fecha ${fecha}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API}/asignar_entrenamiento_lote`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
        body: JSON.stringify({ fecha, entrenamiento_id, atletas_ids: atletasSeleccionados, nombre })
      });

      const resultado = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resultado.error || "No se pudo asignar el entrenamiento");
      }
      contenedorResumen.innerHTML = `<div class="alert alert-success">${resultado.message || "Entrenamiento asignado correctamente"}</div>`;
    } catch (err) {
      console.error("Error al asignar entrenamiento:", err);
      alert("Error al asignar el entrenamiento");
    }
  });

  btnVolver.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  async function fetchCiclos(tipo) {
    if (ciclosCache[tipo]) return ciclosCache[tipo];
    const endpoint =
      tipo === "macro"
        ? "/macrociclos"
        : tipo === "meso"
        ? "/mesociclos"
        : "/microciclos";
    try {
      const res = await fetch(`${API}${endpoint}`, {
        credentials: "include",
        headers: {
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
      });
      if (!res.ok) throw new Error("No se pudieron cargar los ciclos");
      const data = await res.json();
      ciclosCache[tipo] = Array.isArray(data) ? data : [];
      return ciclosCache[tipo];
    } catch (err) {
      console.error("Error al cargar ciclos:", err);
      alert(err.message || "No se pudieron cargar los ciclos");
      return [];
    }
  }

  async function actualizarSelectCiclo(tipo) {
    if (!selectCicloId) return;
    selectCicloId.innerHTML = '<option value="">Cargando...</option>';
    const ciclos = await fetchCiclos(tipo);
    if (!ciclos.length) {
      selectCicloId.innerHTML =
        '<option value="">No hay ciclos disponibles</option>';
      if (ayudaCiclo) {
        ayudaCiclo.textContent =
          "Crea ciclos desde la sección Planificación antes de asignarlos.";
      }
      return;
    }
    selectCicloId.innerHTML =
      '<option value="">Selecciona un ciclo</option>' +
      ciclos
        .map(
          (c) =>
            `<option value="${c.id}">${c.nombre} (${c.fecha_inicio} → ${c.fecha_fin})</option>`
        )
        .join("");
    if (ayudaCiclo) {
      ayudaCiclo.textContent =
        "El ciclo se desplegará desde la fecha real que indiques.";
    }
  }

  selectCicloTipo?.addEventListener("change", () =>
    actualizarSelectCiclo(selectCicloTipo.value)
  );
  if (selectCicloTipo) {
    actualizarSelectCiclo(selectCicloTipo.value);
  }

  formAsignarCiclo?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = selectCicloTipo.value;
    const cicloId = selectCicloId.value;
    const fecha = fechaCicloInput.value;
    const atletasSeleccionados = Array.from(
      document.querySelectorAll(".check-atleta:checked")
    ).map((cb) => cb.value);

    if (!tipo || !cicloId || !fecha) {
      alert("Completa todos los campos del ciclo.");
      return;
    }
    if (!atletasSeleccionados.length) {
      alert("Debes seleccionar al menos un atleta");
      return;
    }

    if (
      !confirm(
        `¿Asignar el ${tipo} ${cicloId} a ${atletasSeleccionados.length} atletas desde ${fecha}?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `${API}/ciclos/${tipo}/${cicloId}/asignaciones`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
            Authorization:
              "Basic " +
              btoa(
                `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
              ),
          },
          body: JSON.stringify({
            fecha_inicio_real: fecha,
            atleta_ids: atletasSeleccionados,
          }),
        }
      );
      const resultado = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resultado.error || "No se pudo asignar el ciclo");
      }
      contenedorResumen.innerHTML = `<div class="alert alert-info">${resultado.message || "Ciclo desplegado correctamente. Revisa el calendario de los atletas."}</div>`;
    } catch (err) {
      console.error("Error al asignar ciclo:", err);
      alert(err.message || "No se pudo asignar el ciclo");
    }
  });
});
