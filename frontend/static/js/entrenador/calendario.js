document.addEventListener("DOMContentLoaded", function () {
  const API_BASE = window.API_BASE || "http://127.0.0.1:5000";
  window.API_BASE = API_BASE;

  const getCsrfToken = () =>
    (window.CSRF && typeof window.CSRF.getToken === "function"
      ? window.CSRF.getToken()
      : localStorage.getItem("csrfToken"));

  // --- 💬 Mensaje flotante bonito ---
  function mostrarMensaje(texto, tipo = "success") {
    let contenedor = document.getElementById("mensaje-flotante");
    if (!contenedor) {
      contenedor = document.createElement("div");
      contenedor.id = "mensaje-flotante";
      contenedor.className =
        "alert text-center position-fixed bottom-0 start-50 translate-middle-x w-50";
      contenedor.style.zIndex = "2000";
      contenedor.style.display = "none";

      const textoEl = document.createElement("span");
      textoEl.id = "mensaje-texto";
      contenedor.appendChild(textoEl);
      document.body.appendChild(contenedor);
    }

    const textoEl = document.getElementById("mensaje-texto");
    contenedor.classList.remove(
      "alert-success",
      "alert-danger",
      "alert-warning",
      "alert-info"
    );
    contenedor.classList.add(`alert-${tipo}`);
    textoEl.textContent = texto;
    contenedor.style.display = "block";

    setTimeout(() => {
      contenedor.style.display = "none";
    }, 2500);
  }

  // --- ✅ Confirmación con modal Bootstrap (sin confirm nativo) ---
  function mostrarConfirmacion(mensaje, onConfirm) {
    const modalEl = document.getElementById("modalConfirmacion");
    const mensajeEl = document.getElementById("modal-confirmacion-mensaje");
    const btnAceptar = document.getElementById("modal-confirmacion-aceptar");

    if (!modalEl || !mensajeEl || !btnAceptar) {
      console.error("Modal de confirmación no está definido en el HTML");
      if (typeof onConfirm === "function") onConfirm(); // fallback
      return;
    }

    mensajeEl.textContent = mensaje;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Evitar acumulación de handlers
    btnAceptar.onclick = () => {
      modal.hide();
      if (typeof onConfirm === "function") onConfirm();
    };

    modal.show();
  }

  // --- 📅 Configuración inicial ---
  const atletaId = new URLSearchParams(window.location.search).get("atletaId");
  const calendarEl = document.getElementById("calendar");

  const offcanvas = new bootstrap.Offcanvas("#offcanvasEntrenamiento");
  const form = document.getElementById("form-asignar-entrenamiento");
  const selectEntrenamiento = document.getElementById("select-entrenamiento");
  const btnEliminar = document.getElementById("btn-eliminar-entrenamiento");
  const btnAsignarCiclo = document.getElementById("btn-asignar-ciclo");
  const modalCicloEl = document.getElementById("modalAsignarCiclo");
  const modalCiclo = modalCicloEl ? new bootstrap.Modal(modalCicloEl) : null;
  const formCiclo = document.getElementById("form-asignar-ciclo");
  const selectCicloTipo = document.getElementById("select-ciclo-tipo");
  const selectCicloId = document.getElementById("select-ciclo-id");
  const inputCicloFecha = document.getElementById("input-ciclo-fecha");
  const ayudaCiclo = document.getElementById("ayuda-ciclo");
  const selectCicloAnclaje = document.getElementById("select-ciclo-anclaje");
  const labelCicloFecha = document.getElementById("label-ciclo-fecha");

  const ciclosCache = {
    micro: null,
    meso: null,
    macro: null,
  };

  const legacyEndpoints = {
    micro: "/microciclos",
    meso: "/mesociclos",
    macro: "/macrociclos",
  };

  const plantillaEndpoints = {
    micro: "/plantillas/microciclos",
    meso: "/plantillas/mesociclos",
    macro: "/plantillas/macrociclos",
  };

  const campos = {
    nombre: document.getElementById("nombre"),
    duracion_valor: document.getElementById("duracion_valor"),
    duracion_tipo: document.getElementById("duracion_tipo"),
    calentamiento_tipo: document.getElementById("calentamiento_tipo"),
    calentamiento_valor: document.getElementById("calentamiento_valor"),
    bloque_activacion: document.getElementById("bloque_activacion"),
    bloque_principal: document.getElementById("bloque_principal"),
    enfriamiento_tipo: document.getElementById("enfriamiento_tipo"),
    enfriamiento_valor: document.getElementById("enfriamiento_valor"),
  };

  let fechaSeleccionada = null;
  let idEntrenamientoAsignado = null;

  // --- 🗓️ FullCalendar ---
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    firstDay: 1,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    selectable: true,

    // Carga de eventos: entrenamientos asignados del atleta
    events: async function (fetchInfo, successCallback, failureCallback) {
      try {
        const res = await fetch(`${API_BASE}/calendario/${atletaId}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          console.error("Error al cargar calendario:", res.status);
          return failureCallback(
            new Error("No se pudo cargar el calendario")
          );
        }

        const events = await res.json();
        successCallback(events);
      } catch (err) {
        console.error("Error fetch calendario:", err);
        failureCallback(err);
      }
    },

    // Click en una fecha: crear nueva asignación
    dateClick: async function (info) {
      fechaSeleccionada = info.dateStr;
      idEntrenamientoAsignado = null;
      btnEliminar.style.display = "none";

      try {
        const response = await fetch(`${API_BASE}/entrenamientos`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          console.error(
            "Error al cargar entrenamientos tipo:",
            response.status
          );
          mostrarMensaje(
            "Error al cargar entrenamientos tipo",
            "danger"
          );
          return;
        }

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

        if (entrenamientos.length > 0) {
          selectEntrenamiento.value = entrenamientos[0].id;
          selectEntrenamiento.dispatchEvent(new Event("change"));
        } else {
          // Si no hay plantillas, limpiamos campos
          Object.keys(campos).forEach((key) => {
            campos[key].value = "";
          });
        }

        offcanvas.show();
      } catch (err) {
        console.error("Error al cargar entrenamientos tipo:", err);
        mostrarMensaje("Error al cargar entrenamientos tipo", "danger");
      }
    },

    // Click en evento existente: editar / borrar asignación
    eventClick: async function (info) {
      fechaSeleccionada = info.event.startStr;
      idEntrenamientoAsignado = info.event.id;
      btnEliminar.style.display = "block";

      try {
        const res = await fetch(
          `${API_BASE}/entrenamientos_asignados/uno/${idEntrenamientoAsignado}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (!res.ok) {
          console.error(
            "Error al cargar entrenamiento asignado:",
            res.status
          );
          mostrarMensaje(
            "Error al cargar entrenamiento asignado",
            "danger"
          );
          return;
        }

        const entrenamiento = await res.json();

        Object.keys(campos).forEach((key) => {
          campos[key].value = entrenamiento[key] || "";
        });

        selectEntrenamiento.innerHTML =
          '<option value="custom">Entrenamiento personalizado</option>';
        selectEntrenamiento.value = "custom";

        offcanvas.show();
      } catch (err) {
        console.error("Error al cargar entrenamiento asignado:", err);
        mostrarMensaje(
          "Error al cargar entrenamiento asignado",
          "danger"
        );
      }
    },
  });

  async function fetchListado(url) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) throw new Error("No se pudieron cargar los ciclos");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function fetchCiclos(tipo) {
    if (ciclosCache[tipo]) return ciclosCache[tipo];
    try {
      const [plantillas, legacy] = await Promise.all([
        fetchListado(plantillaEndpoints[tipo]),
        fetchListado(legacyEndpoints[tipo]),
      ]);
      ciclosCache[tipo] = { plantillas, legacy };
      return ciclosCache[tipo];
    } catch (err) {
      console.error("Error cargando ciclos:", err);
      mostrarMensaje(err.message || "Error al cargar ciclos", "danger");
      ciclosCache[tipo] = { plantillas: [], legacy: [] };
      return ciclosCache[tipo];
    }
  }

  async function actualizarSelectCiclo(tipo) {
    if (!selectCicloId) return;
    selectCicloId.innerHTML = '<option value="">Cargando...</option>';
    const { plantillas, legacy } = await fetchCiclos(tipo);
    if (!plantillas.length && !legacy.length) {
      selectCicloId.innerHTML =
        '<option value="">No hay ciclos disponibles</option>';
      if (ayudaCiclo)
        ayudaCiclo.textContent =
          "Crea plantillas desde Gestión de entrenamiento antes de asignarlas.";
      return;
    }
    let options = '<option value="">Selecciona un ciclo</option>';
    if (plantillas.length) {
      options += '<optgroup label="Plantillas">';
      options += plantillas
        .map(
          (c) =>
            `<option value="plantilla|${c.id}">${c.nombre}</option>`
        )
        .join("");
      options += "</optgroup>";
    }
    if (legacy.length) {
      options += '<optgroup label="Ciclos programados">';
      options += legacy
        .map(
          (c) =>
            `<option value="legacy|${c.id}">${c.nombre} (${c.fecha_inicio} → ${c.fecha_fin})</option>`
        )
        .join("");
      options += "</optgroup>";
    }
    selectCicloId.innerHTML = options;
    if (ayudaCiclo)
      ayudaCiclo.textContent =
        "Los ciclos seleccionados se desplegarán en el calendario tomando esta fecha como referencia.";
  }

  btnAsignarCiclo?.addEventListener("click", async () => {
    if (!modalCiclo) return;
    inputCicloFecha.value = "";
    selectCicloAnclaje.value = "inicio";
    labelCicloFecha.textContent = "Fecha de inicio real";
    ciclosCache.micro = null;
    ciclosCache.meso = null;
    ciclosCache.macro = null;
    await actualizarSelectCiclo(selectCicloTipo.value);
    modalCiclo.show();
  });

  selectCicloAnclaje?.addEventListener("change", () => {
    labelCicloFecha.textContent =
      selectCicloAnclaje.value === "fin"
        ? "Fecha final (el ciclo se rellenará hacia atrás)"
        : "Fecha de inicio real";
  });

  selectCicloTipo?.addEventListener("change", async () => {
    await actualizarSelectCiclo(selectCicloTipo.value);
  });

  formCiclo?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = selectCicloTipo.value;
    const optionValue = selectCicloId.value;
    const fecha = inputCicloFecha.value;
    const anclaje = selectCicloAnclaje?.value || "inicio";
    if (!tipo || !optionValue || !fecha) {
      mostrarMensaje("Completa todos los campos del ciclo.", "warning");
      return;
    }
    const [fuente, cicloId] = optionValue.split("|");
    const payload = {
      fecha_inicio_real: fecha,
      atleta_ids: [atletaId],
      anclar_en: anclaje,
    };
    try {
      let endpoint;
      if (fuente === "plantilla") {
        endpoint = `/plantillas/ciclos/${tipo}/${cicloId}/asignaciones`;
      } else {
        endpoint = `/ciclos/${tipo}/${cicloId}/asignaciones`;
        delete payload.anclar_en;
      }
      const res = await fetch(`${API_BASE}${endpoint}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify(payload),
        });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo asignar el ciclo");
      }
      mostrarMensaje("Ciclo asignado correctamente");
      modalCiclo?.hide();
      calendar.refetchEvents();
    } catch (err) {
      console.error("Error asignando ciclo:", err);
      mostrarMensaje(err.message || "No se pudo asignar el ciclo", "danger");
    }
  });

  // --- 💾 Crear o actualizar entrenamiento asignado ---
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!fechaSeleccionada) {
      mostrarMensaje("No hay fecha seleccionada.", "warning");
      return;
    }

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
      enfriamiento_valor: campos.enfriamiento_valor.value,
    };

    const url = `${API_BASE}/entrenamientos_asignados${
      idEntrenamientoAsignado ? "/" + idEntrenamientoAsignado : ""
    }`;
    const method = idEntrenamientoAsignado ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(data),
      });

      const resultado = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error(
          "Error al guardar entrenamiento:",
          res.status,
          resultado
        );
        mostrarMensaje(
          resultado.error || "Error al guardar entrenamiento",
          "danger"
        );
        return;
      }

      mostrarMensaje(
        resultado.message || "Entrenamiento guardado",
        "success"
      );
      offcanvas.hide();
      calendar.refetchEvents();
    } catch (err) {
      console.error("Error al guardar entrenamiento:", err);
      mostrarMensaje("Error al guardar entrenamiento", "danger");
    }
  });

  // --- 🗑️ Eliminar entrenamiento asignado ---
  btnEliminar.addEventListener("click", function () {
    if (!idEntrenamientoAsignado) return;

    mostrarConfirmacion(
      "¿Estás seguro de que deseas eliminar este entrenamiento asignado?",
      async () => {
        try {
          const res = await fetch(
            `${API_BASE}/entrenamientos_asignados/${idEntrenamientoAsignado}`,
            {
              method: "DELETE",
              credentials: "include",
              headers: {
                "X-CSRF-Token": getCsrfToken(),
              },
            }
          );

          const resultado = await res.json().catch(() => ({}));

          if (!res.ok) {
            console.error(
              "Error al eliminar entrenamiento:",
              res.status,
              resultado
            );
            mostrarMensaje(
              resultado.error || "Error al eliminar entrenamiento",
              "danger"
            );
            return;
          }

          mostrarMensaje(
            resultado.message || "Entrenamiento eliminado",
            "success"
          );
          offcanvas.hide();
          calendar.refetchEvents();
        } catch (err) {
          console.error("Error al eliminar entrenamiento:", err);
          mostrarMensaje(
            "Error al eliminar el entrenamiento",
            "danger"
          );
        }
      }
    );
  });

  calendar.render();

  // --- 🧍 Cargar nombre del atleta ---
  async function cargarNombreAtleta(id) {
    try {
      const response = await fetch(`${API_BASE}/atletas/${id}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) throw new Error("No se pudo cargar el atleta");

      const atleta = await response.json();
      const h2 = document.getElementById("atleta-name");
      if (h2) {
        h2.textContent = `${atleta.nombre} ${atleta.apellidos}`;
      }
    } catch (err) {
      console.error("Error al cargar atleta:", err);
      const h2 = document.getElementById("atleta-name");
      if (h2) {
        h2.textContent =
          "Calendario del atleta (error al cargar datos)";
      }
    }
  }

  if (atletaId) {
    cargarNombreAtleta(atletaId);
  }
});
