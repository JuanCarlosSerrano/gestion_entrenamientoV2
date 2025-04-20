document.addEventListener("DOMContentLoaded", function () {
  const atletaId = new URLSearchParams(window.location.search).get("atletaId");
  const calendarEl = document.getElementById("calendar");

  const offcanvas = new bootstrap.Offcanvas("#offcanvasEntrenamiento");
  const form = document.getElementById("form-asignar-entrenamiento");
  const selectEntrenamiento = document.getElementById("select-entrenamiento");
  const btnEliminar = document.getElementById("btn-eliminar-entrenamiento");

  const campos = {
    nombre: document.getElementById("nombre"),
    duracion_valor: document.getElementById("duracion_valor"),
    duracion_tipo: document.getElementById("duracion_tipo"),
    calentamiento_tipo: document.getElementById("calentamiento_tipo"),
    calentamiento_valor: document.getElementById("calentamiento_valor"),
    bloque_activacion: document.getElementById("bloque_activacion"),
    bloque_principal: document.getElementById("bloque_principal"),
    enfriamiento_tipo: document.getElementById("enfriamiento_tipo"),
    enfriamiento_valor: document.getElementById("enfriamiento_valor")
  };

  let fechaSeleccionada = null;
  let idEntrenamientoAsignado = null;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay"
    },
    selectable: true,
    events: async function (fetchInfo, successCallback, failureCallback) {
      try {
        const res = await fetch(`http://127.0.0.1:5000/calendario/${atletaId}`);
        const events = await res.json();
        successCallback(events);
      } catch (err) {
        failureCallback(err);
      }
    },
    dateClick: async function (info) {
      fechaSeleccionada = info.dateStr;
      idEntrenamientoAsignado = null;
      btnEliminar.style.display = 'none';

      try {
        const response = await fetch("http://127.0.0.1:5000/entrenamientos", {
          headers: {
            Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
          }
        });
        const entrenamientos = await response.json();
       
        selectEntrenamiento.innerHTML = entrenamientos
          .map((e) => `<option value="${e.id}">${e.nombre}</option>`)
          .join("");

        selectEntrenamiento.onchange = function () {
          const selected = entrenamientos.find((e) => e.id == this.value);
          if (selected) {
            Object.keys(campos).forEach((key) => {
              campos[key].value = selected[key] || "";
            });
          }
        };

        selectEntrenamiento.dispatchEvent(new Event("change"));
        offcanvas.show();
      } catch (err) {
        alert("Error al cargar entrenamientos tipo");
        console.error(err);
      }
    },
    eventClick: async function (info) {
      const fecha = info.event.startStr;
      fechaSeleccionada = fecha;
      idEntrenamientoAsignado = info.event.id;
      btnEliminar.style.display = 'block';

      try {
        const res = await fetch(
          `http://127.0.0.1:5000/entrenamientos_asignados/uno/${idEntrenamientoAsignado}`,
          {
            headers: {
              Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
            }
          }
        );
        const entrenamiento = await res.json();

        Object.keys(campos).forEach((key) => {
          campos[key].value = entrenamiento[key] || "";
        });

        selectEntrenamiento.innerHTML = "<option value=\"custom\">Entrenamiento personalizado</option>";
        selectEntrenamiento.value = "custom";

        offcanvas.show();
      } catch (err) {
        alert("Error al cargar entrenamiento asignado");
        console.error(err);
      }
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const data = {
      atleta_id: atletaId,
      fecha: fechaSeleccionada,
      nombre: campos.nombre.value,
      duracion_valor: campos.duracion_valor.value,
      duracion_tipo: campos.duracion_tipo.value,
      calentamiento_tipo: campos.calentamiento_tipo.value,
      calentamiento_valor: campos.calentamiento_valor.value,
      bloque_activacion: campos.bloque_activacion.value,
      bloque_principal: campos.bloque_principal.value,
      enfriamiento_tipo: campos.enfriamiento_tipo.value,
      enfriamiento_valor: campos.enfriamiento_valor.value
    };

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/entrenamientos_asignados${idEntrenamientoAsignado ? "/" + idEntrenamientoAsignado : ""}`,
        {
          method: idEntrenamientoAsignado ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
          },
          body: JSON.stringify(data)
        }
      );

      const resultado = await res.json();
      alert(resultado.message || "Acción completada");
      offcanvas.hide();
      calendar.refetchEvents();
    } catch (err) {
      alert("Error al guardar entrenamiento");
      console.error(err);
    }
  });

  btnEliminar.addEventListener("click", async function () {
    if (idEntrenamientoAsignado && confirm("¿Estás seguro de que deseas eliminar este entrenamiento asignado?")) {
      try {
        const res = await fetch(`http://127.0.0.1:5000/entrenamientos_asignados/${idEntrenamientoAsignado}`, {
          method: "DELETE",
          headers: {
            Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
          }
        });
        const resultado = await res.json();
        alert(resultado.message || "Entrenamiento eliminado");
        offcanvas.hide();
        calendar.refetchEvents();
      } catch (err) {
        alert("Error al eliminar el entrenamiento");
        console.error(err);
      }
    }
  });

  calendar.render();

  async function cargarNombreAtleta(id) {
    try {
      const response = await fetch(`http://127.0.0.1:5000/atletas/${id}`, {
        headers: {
          Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
        }
      });

      if (!response.ok) throw new Error("No se pudo cargar el atleta");

      const atleta = await response.json();
      const h2 = document.getElementById("atleta-name");
      h2.textContent = `${atleta.nombre} ${atleta.apellidos}`;
    } catch (err) {
      console.error("Error al cargar atleta:", err);
      document.getElementById("atleta-name").textContent = "Calendario del atleta (error al cargar)";
    }
  }

  cargarNombreAtleta(atletaId);
});
