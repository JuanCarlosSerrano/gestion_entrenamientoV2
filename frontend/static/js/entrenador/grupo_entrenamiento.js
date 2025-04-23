document.addEventListener("DOMContentLoaded", async function () {
  const formFiltros = document.getElementById("form-filtros");
  const formAsignar = document.getElementById("form-asignar-entrenamiento");
  const tablaBody = document.querySelector("#tabla-atletas tbody");
  const checkTodos = document.getElementById("check-todos");
  const selectEntrenamiento = document.getElementById("select-entrenamiento");
  const fechaInput = document.getElementById("fecha");
  const contenedorResumen = document.getElementById("resumen-asignacion");
  const btnVolver = document.getElementById("btn-volver");

  let entrenamientos = [];

  async function cargarAtletasIniciales() {
    try {
      const res = await fetch("http://127.0.0.1:5000/atletas_filtrados", {
        headers: {
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
      });
      const atletas = await res.json();
      renderTabla(atletas);
    } catch (err) {
      console.error("Error al cargar atletas iniciales:", err);
    }
  }

  try {
    const res = await fetch("http://127.0.0.1:5000/entrenamientos", {
      headers: {
        Authorization:
          "Basic " +
          btoa(
            `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
          ),
      },
    });
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

    let url = new URL("http://127.0.0.1:5000/atletas_filtrados");
    if (grupo) url.searchParams.append("grupo", grupo);
    if (subgrupo) url.searchParams.append("subgrupo", subgrupo);
    if (categoria) url.searchParams.append("categoria", categoria);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
      });
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
      const res = await fetch("http://127.0.0.1:5000/asignar_entrenamiento_lote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            ),
        },
        body: JSON.stringify({ fecha, entrenamiento_id, atletas_ids: atletasSeleccionados, nombre })
      });

      const resultado = await res.json();
      contenedorResumen.innerHTML = `<div class="alert alert-success">${resultado.message || "Entrenamiento asignado correctamente"}</div>`;
    } catch (err) {
      console.error("Error al asignar entrenamiento:", err);
      alert("Error al asignar el entrenamiento");
    }
  });

  btnVolver.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
