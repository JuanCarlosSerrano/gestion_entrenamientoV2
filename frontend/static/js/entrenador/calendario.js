document.addEventListener("DOMContentLoaded", function () {
  const API_BASE =
    window.API_BASE ||
    (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
  window.API_BASE = API_BASE;

  const getCsrfToken = () =>
    (window.CSRF && typeof window.CSRF.getToken === "function"
      ? window.CSRF.getToken()
      : localStorage.getItem("csrfToken"));

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

  function mostrarConfirmacion(mensaje, onConfirm) {
    const modalEl = document.getElementById("modalConfirmacion");
    const mensajeEl = document.getElementById("modal-confirmacion-mensaje");
    const btnAceptar = document.getElementById("modal-confirmacion-aceptar");
    if (!modalEl || !mensajeEl || !btnAceptar) {
      console.error("Modal de confirmación no está definido en el HTML");
      if (typeof onConfirm === "function") onConfirm();
      return;
    }
    mensajeEl.textContent = mensaje;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    btnAceptar.onclick = () => {
      modal.hide();
      if (typeof onConfirm === "function") onConfirm();
    };
    modal.show();
  }

  const atletaId = new URLSearchParams(window.location.search).get("atletaId");
  const calendarEl = document.getElementById("calendar");
  const modalAsignarEl = document.getElementById("modalAsignarEntrenamiento");
  const modalAsignar = modalAsignarEl ? new bootstrap.Modal(modalAsignarEl) : null;
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
  const visFecha = document.getElementById("vis-fecha");
  const visModo = document.getElementById("vis-modo");
  const btnVisMostrar = document.getElementById("btn-vis-mostrar");
  const btnVisOcultar = document.getElementById("btn-vis-ocultar");

  if (!atletaId) {
    if (calendarEl) {
      calendarEl.innerHTML =
        '<div class="alert alert-warning">Debes abrir este calendario desde "Mis atletas" para seleccionar un deportista concreto.</div>';
    }
    [btnVisMostrar, btnVisOcultar, btnAsignarCiclo, form].forEach((el) => {
      if (el) el.disabled = true;
    });
    return;
  }

  if (visFecha && !visFecha.value) {
    visFecha.value = new Date().toISOString().slice(0, 10);
  }

    async function actualizarVisibilidad(visible) {
    if (!visFecha) return;

    if (!visFecha.value) {
      mostrarMensaje(
        "Selecciona una fecha para actualizar la visibilidad.",
        "warning"
      );
      return;
    }

    const atletaIdNum = parseInt(atletaId, 10);
    if (Number.isNaN(atletaIdNum)) {
      mostrarMensaje("Atleta no válido", "danger");
      return;
    }

    const modo = visModo && visModo.value ? visModo.value : "dia"; // 👈 aquí está la clave

    const payload = {
      atletas: [atletaIdNum],          // lista, como espera el backend
      fecha: visFecha.value,           // YYYY-MM-DD
      visible: visible ? 1 : 0,        // 1 = mostrar, 0 = ocultar
      modo: modo                       // "dia" o "semana"
    };

    try {
      let token = getCsrfToken();
      if ((!token || token === "undefined") && window.CSRF?.ensureToken) {
        token = await window.CSRF.ensureToken(true);
      }

      const res = await fetch(
        `${API_BASE}/entrenamientos_asignados/visibilidad`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-CSRF-Token": token } : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        mostrarMensaje(
          data.error || "No se pudo actualizar la visibilidad",
          "danger"
        );
        console.error("Respuesta visibilidad (error):", res.status, data);
        return;
      }

      const num = data.updated ?? data.actualizados ?? 0;

      mostrarMensaje(
        data.message || `Visibilidad actualizada (${num} entrenamientos)`,
        "success"
      );

      calendar.refetchEvents();

    } catch (err) {
      console.error("Error al actualizar visibilidad:", err);
      mostrarMensaje("Error al actualizar la visibilidad", "danger");
    }
  }



  if (btnVisMostrar) {
    btnVisMostrar.addEventListener("click", (event) => {
      event.preventDefault();
      actualizarVisibilidad(true);
    });
  }
  if (btnVisOcultar) {
    btnVisOcultar.addEventListener("click", (event) => {
      event.preventDefault();
      actualizarVisibilidad(false);
    });
  }

  const ciclosCache = { micro: null, meso: null, macro: null };
  const cicloEndpoints = {
    micro: "/microciclos",
    meso: "/mesociclos",
    macro: "/macrociclos",
  };

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
      const ciclos = await fetchListado(cicloEndpoints[tipo]);
      ciclosCache[tipo] = ciclos;
      return ciclos;
    } catch (err) {
      console.error("Error al cargar ciclos:", err);
      mostrarMensaje(err.message || "No se pudieron cargar los ciclos", "danger");
      ciclosCache[tipo] = [];
      return ciclosCache[tipo];
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
          "Crea ciclos antes de asignarlos.";
      }
      return;
    }
    let options = '<option value="">Selecciona un ciclo</option>';
    options += ciclos
      .map(
        (c) =>
          `<option value="${c.id}">${c.nombre}${
            c.fecha_inicio && c.fecha_fin ? ` (${c.fecha_inicio} → ${c.fecha_fin})` : ""
          }</option>`
      )
      .join("");
    selectCicloId.innerHTML = options;
    if (ayudaCiclo) {
      ayudaCiclo.textContent =
        "Selecciona un ciclo y la fecha real para desplegarlo.";
    }
  }

  const campos = {
    nombre: document.getElementById("nombre"),
    descripcion: document.getElementById("descripcion"),
  };
  const bloquesPreviewList = document.getElementById("bloques-preview-list");
  const bloquesPreviewEmpty = document.getElementById("bloques-preview-empty");
  const modalDetalleEl = document.getElementById("modalDetalleEntreno");
  const modalDetalle = modalDetalleEl ? new bootstrap.Modal(modalDetalleEl) : null;
  const btnDetalleEditar = document.getElementById("btn-detalle-editar");
  const detalleBloquesList = document.getElementById("detalle-bloques-list");
  const detalleBloquesEmpty = document.getElementById("detalle-bloques-empty");
  const detalleCampos = {
    tipo: document.getElementById("detalle-tipo"),
    nombre: document.getElementById("detalle-nombre"),
    descripcion: document.getElementById("detalle-descripcion"),
    fecha: document.getElementById("detalle-fecha"),
  };
  let detalleEntrenamientoActual = null;

  const formatearDistancia = (metros) => {
    if (typeof metros !== "number" || Number.isNaN(metros)) return "-";
    if (metros >= 1000) {
      const valor = metros / 1000;
      return `${Number.isInteger(valor) ? valor : valor.toFixed(2)} km`;
    }
    return `${metros} m`;
  };

  const TIPO_PASO_LABEL = {
    warmup: "Calentamiento",
    cooldown: "Enfriamiento",
    rest: "Descanso",
    interval: "Intervalo",
    repeat: "Bloque repetido",
    custom: "Personalizado",
  };

  const describirPaso = (paso = {}) => {
    if (paso.tipo_paso === "repeat" && Array.isArray(paso.subpasos) && paso.subpasos.length) {
      const hijos = paso.subpasos.map(describirPaso).join(" + ");
      return `${paso.repeticiones || 1}x(${hijos})`;
    }
    const tipoClave = (paso.tipo_paso || "Paso").toLowerCase();
    const tipo = (TIPO_PASO_LABEL[tipoClave] || paso.tipo_paso || "Paso").toUpperCase();
    const objetivo = paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "";
    const partes = [
      tipo,
      objetivo,
      paso.zona ? `Zona ${paso.zona}` : "",
      paso.intensidad || "",
      paso.descripcion || "",
    ].filter(Boolean);
    if (paso.recuperacion_valor) {
      partes.push(`Rec: ${paso.recuperacion_valor}${paso.recuperacion_unidad || ""}`);
    }
    return partes.join(" · ") || tipo;
  };

  const convertirPasosAPreview = (pasos = [], depth = 0, acc = []) => {
    pasos.forEach((paso) => {
      acc.push({
        texto: describirPaso(paso),
        depth,
        tipo: paso?.tipo_paso || "custom",
      });
      if (Array.isArray(paso.subpasos) && paso.subpasos.length) {
        convertirPasosAPreview(paso.subpasos, depth + 1, acc);
      }
    });
    return acc;
  };

  const renderBloquesPreview = (bloques = []) => {
    if (!bloquesPreviewList || !bloquesPreviewEmpty) return;
    if (!Array.isArray(bloques) || !bloques.length) {
      bloquesPreviewList.innerHTML = "";
      bloquesPreviewEmpty.classList.remove("d-none");
      return;
    }
    bloquesPreviewEmpty.classList.add("d-none");
    bloquesPreviewList.innerHTML = bloques
      .map((bloque) => {
        if (typeof bloque.texto === "string") {
          const indent = 12 * (bloque.depth || 0);
          return `<li class="list-group-item py-2 small" style="padding-left:${indent + 8}px;">
            ${bloque.texto}
          </li>`;
        }
        return `
        <li class="list-group-item py-2">
          <div class="fw-semibold">${bloque.repeticiones || 1} x ${formatearDistancia(
            Number(bloque.distancia_m) || 0
          )}</div>
          <div class="text-muted small">
            ${[
              bloque.recuperacion ? `Rec: ${bloque.recuperacion}` : "",
              bloque.zona ? `Zona ${bloque.zona}` : "",
              bloque.observacion ? bloque.observacion : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          ${
            bloque.ritmo_min_texto || bloque.ritmo_max_texto
              ? `<div class="small text-primary">
                  Ritmo (min/km): ${
                    bloque.ritmo_max_texto &&
                    bloque.ritmo_min_texto &&
                    bloque.ritmo_max_texto !== bloque.ritmo_min_texto
                      ? `${bloque.ritmo_max_texto} - ${bloque.ritmo_min_texto}`
                      : bloque.ritmo_min_texto || bloque.ritmo_max_texto
                  }
                </div>`
              : ""
          }
          ${
            bloque.tiempo_min_texto || bloque.tiempo_max_texto
              ? `<div class="small text-secondary">
                  Tiempo estimado: ${
                    bloque.tiempo_max_texto &&
                    bloque.tiempo_min_texto &&
                    bloque.tiempo_max_texto !== bloque.tiempo_min_texto
                      ? `${bloque.tiempo_max_texto} - ${bloque.tiempo_min_texto}`
                      : bloque.tiempo_min_texto || bloque.tiempo_max_texto
                  }
                </div>`
              : ""
          }
        </li>`;
      })
      .join("");
  };

  const tipoBloqueLabel = (tipoRaw) => {
    const tipo = (tipoRaw || "").toLowerCase();
    if (TIPO_PASO_LABEL[tipo]) {
      return TIPO_PASO_LABEL[tipo];
    }
    return tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Bloque";
  };

  const renderDetalleBloques = (pasos = []) => {
    if (!detalleBloquesList || !detalleBloquesEmpty) return;
    const items = convertirPasosAPreview(pasos);
    if (!items.length) {
      detalleBloquesList.innerHTML = "";
      detalleBloquesEmpty.classList.remove("d-none");
      return;
    }
    detalleBloquesEmpty.classList.add("d-none");
    detalleBloquesList.innerHTML = items
      .map((item) => {
        const tipo = (item.tipo || "custom").toLowerCase();
        const depth = item.depth || 0;
        const label = tipoBloqueLabel(tipo);
        const classes = ["detalle-bloque", `detalle-bloque--${tipo}`]
          .filter(Boolean)
          .join(" ");
        return `
          <li class="${classes}" style="margin-left:${depth * 14}px;">
            <div class="detalle-bloque__header">
              <span class="detalle-bloque__chip">${label}</span>
            </div>
            <p class="detalle-bloque__texto">${item.texto}</p>
          </li>
        `;
      })
      .join("");
  };

  const llenarModalDetalle = (data = {}) => {
    if (!modalDetalle) return;
    if (detalleCampos.tipo) detalleCampos.tipo.value = data.nombre || "";
    if (detalleCampos.nombre) detalleCampos.nombre.value = data.nombre || "";
    if (detalleCampos.descripcion) {
      detalleCampos.descripcion.value =
        data.descripcion || data.bloque_principal || "";
    }
    if (detalleCampos.fecha) {
      detalleCampos.fecha.value = data.fecha
        ? new Date(data.fecha).toLocaleDateString()
        : "";
    }
    renderDetalleBloques(data.pasos || []);
  };

  const limpiarCampos = () => {
    Object.values(campos).forEach((campo) => {
      if (!campo) return;
      campo.value = "";
    });
    if (selectEntrenamiento && selectEntrenamiento.options.length) {
      selectEntrenamiento.selectedIndex = 0;
    }
    renderBloquesPreview([]);
  };

  const aplicarEntrenamientoAlFormulario = (datos = {}, opciones = {}) => {
    const { renderBloques = true } = opciones;
    campos.nombre.value = datos.nombre || "";
    campos.descripcion.value = datos.descripcion || datos.bloque_principal || "";
    if (renderBloques) {
      const bloquesPreview =
        (Array.isArray(datos.bloques) && datos.bloques.length)
          ? datos.bloques
          : convertirPasosAPreview(datos.pasos || []);
      renderBloquesPreview(bloquesPreview);
    }
  };

  async function cargarPlantillasEntrenamientos() {
    try {
      const response = await fetch(`${API_BASE}/plantillas/entrenamientos`, { method: "GET", credentials: "include" });
      if (!response.ok) throw new Error("No se pudieron cargar las plantillas");
      const datos = await response.json();
      return Array.isArray(datos) ? datos : [];
    } catch (error) {
      console.error("Error al cargar plantillas:", error);
      throw error;
    }
  }

  let fechaSeleccionada = null;
  let idEntrenamientoAsignado = null;
  let plantillasDisponibles = [];

  async function asegurarCsrf() {
    let token = getCsrfToken();
    if ((!token || token === "undefined") && window.CSRF?.ensureToken) {
      try {
        token = await window.CSRF.ensureToken(true);
      } catch (err) {
        console.error("No se pudo asegurar el token CSRF", err);
      }
    }
    return token;
  }

  async function prepararSelectPlantillas(preseleccion = "") {
    try {
      plantillasDisponibles = await cargarPlantillasEntrenamientos();
      let opciones =
        '<option value="" disabled selected>Selecciona un entrenamiento</option>' +
        plantillasDisponibles
          .map((p) => `<option value="${p.entrenamiento_base_id || ""}">${p.nombre}</option>`)
          .join("");
      selectEntrenamiento.innerHTML = opciones;
      if (preseleccion) {
        const existe = plantillasDisponibles.some(
          (p) => String(p.entrenamiento_base_id) === String(preseleccion)
        );
        if (!existe) {
          const option = document.createElement("option");
          option.value = preseleccion;
          option.textContent = "Entrenamiento seleccionado";
          selectEntrenamiento.appendChild(option);
        }
        selectEntrenamiento.value = String(preseleccion);
      } else {
        selectEntrenamiento.selectedIndex = 0;
      }
    } catch (err) {
      console.error("Error al cargar plantillas:", err);
      selectEntrenamiento.innerHTML =
        '<option value="" disabled selected>Selecciona un entrenamiento</option>';
    }
  }

  const detalleEntrenamientosCache = {};

  async function obtenerDetalleEntrenamientoBase(entrenamientoId) {
    if (!entrenamientoId) return null;
    if (detalleEntrenamientosCache[entrenamientoId]) {
      return detalleEntrenamientosCache[entrenamientoId];
    }
    const res = await fetch(`${API_BASE}/entrenamientos/${entrenamientoId}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) throw new Error("No se pudo cargar el detalle del entrenamiento");
    const data = await res.json();
    detalleEntrenamientosCache[entrenamientoId] = data;
    return data;
  }

  selectEntrenamiento?.addEventListener("change", async () => {
    const value = selectEntrenamiento.value;
    const plantilla = plantillasDisponibles.find(
      (p) => String(p.entrenamiento_base_id) === String(value)
    );
    if (plantilla) {
      aplicarEntrenamientoAlFormulario(plantilla, { renderBloques: false });
      renderBloquesPreview([]);
      if (plantilla.entrenamiento_base_id) {
        try {
          const detalle = await obtenerDetalleEntrenamientoBase(
            plantilla.entrenamiento_base_id
          );
          renderBloquesPreview(convertirPasosAPreview(detalle.pasos || []));
          if (!campos.descripcion.value) {
            campos.descripcion.value =
              detalle.descripcion || detalle.bloque_principal || "";
          }
        } catch (err) {
          console.error("Error cargando bloques base:", err);
          renderBloquesPreview([]);
        }
      } else {
        renderBloquesPreview(convertirPasosAPreview(plantilla.pasos || []));
      }
    } else {
      limpiarCampos();
    }
  });

  function construirPayloadBase() {
    const entrenamientoSeleccionado = selectEntrenamiento?.value;
    if (!fechaSeleccionada || !entrenamientoSeleccionado) {
      mostrarMensaje("Selecciona un entrenamiento y una fecha", "warning");
      return null;
    }
    const plantilla = plantillasDisponibles.find(
      (p) => String(p.entrenamiento_base_id) === String(entrenamientoSeleccionado)
    );
    const nombre = (campos.nombre?.value || plantilla?.nombre || "").trim();
    if (!nombre) {
      mostrarMensaje("No se pudo determinar el nombre del entrenamiento", "danger");
      return null;
    }
    return {
      atleta_id: parseInt(atletaId, 10),
      fecha: fechaSeleccionada,
      plantilla_id: Number(entrenamientoSeleccionado),
      nombre,
      visible: 0,
    };
  }

  async function abrirFormularioNuevo(fechaStr) {
    fechaSeleccionada = fechaStr;
    idEntrenamientoAsignado = null;
    await prepararSelectPlantillas();
    limpiarCampos();
    if (btnEliminar) btnEliminar.style.display = "none";
    modalAsignar?.show();
  }

  async function abrirFormularioExistente(eventoId, datosPrecargados = null) {
    try {
      let data = datosPrecargados;
      if (!data) {
        const res = await fetch(
          `${API_BASE}/entrenamientos_asignados/uno/${eventoId}`,
          {
            method: "GET",
            credentials: "include",
          }
        );
        if (!res.ok) throw new Error("No se pudo cargar el entrenamiento");
        data = await res.json();
      }
      fechaSeleccionada = data.fecha;
      idEntrenamientoAsignado = data.id;
      await prepararSelectPlantillas(String(data.entrenamiento_id));
      aplicarEntrenamientoAlFormulario(data);
      if (btnEliminar) btnEliminar.style.display = "block";
      modalAsignar?.show();
    } catch (err) {
      console.error("Error al cargar entrenamiento asignado:", err);
      mostrarMensaje("No se pudo abrir el entrenamiento", "danger");
    }
  }

  async function mostrarDetalleEntrenamiento(eventoId) {
    if (!modalDetalle) {
      await abrirFormularioExistente(eventoId);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/entrenamientos_asignados/uno/${eventoId}`,
        {
          method: "GET",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("No se pudo cargar el entrenamiento");
      const data = await res.json();
      detalleEntrenamientoActual = data;
      llenarModalDetalle(data);
      modalDetalle.show();
    } catch (err) {
      console.error("Error al mostrar detalle del entrenamiento:", err);
      mostrarMensaje("No se pudo abrir el entrenamiento", "danger");
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = construirPayloadBase();
    if (!payload) return;

    const token = await asegurarCsrf();
    let url = `${API_BASE}/entrenamientos_asignados`;
    let method = "POST";
    if (idEntrenamientoAsignado) {
      url = `${API_BASE}/entrenamientos_asignados/${idEntrenamientoAsignado}`;
      method = "PUT";
    }

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        mostrarMensaje(
          data.error || "No se pudo guardar el entrenamiento",
          "danger"
        );
        return;
      }
      mostrarMensaje(
        data.message || "Entrenamiento guardado correctamente",
        "success"
      );
      modalAsignar?.hide();
      calendar.refetchEvents();
    } catch (err) {
      console.error("Error al guardar entrenamiento:", err);
      mostrarMensaje("Error al guardar entrenamiento", "danger");
    }
  });

  btnEliminar?.addEventListener("click", () => {
    if (!idEntrenamientoAsignado) return;
    mostrarConfirmacion(
      "¿Seguro que deseas eliminar este entrenamiento?",
      async () => {
        try {
          const token = await asegurarCsrf();
          const res = await fetch(
            `${API_BASE}/entrenamientos_asignados/${idEntrenamientoAsignado}`,
            {
              method: "DELETE",
              credentials: "include",
              headers: {
                ...(token ? { "X-CSRF-Token": token } : {}),
              },
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            mostrarMensaje(
              data.error || "No se pudo eliminar el entrenamiento",
              "danger"
            );
            return;
          }
          mostrarMensaje(
            data.message || "Entrenamiento eliminado",
            "success"
          );
          modalAsignar?.hide();
          calendar.refetchEvents();
        } catch (err) {
          console.error("Error eliminando entrenamiento:", err);
          mostrarMensaje("No se pudo eliminar el entrenamiento", "danger");
        }
      }
    );
  });

  // --- 🗓️ FullCalendar adaptado a móvil ---
  function getInitialView() {
    return window.innerWidth < 768 ? "dayGridMonth" : "dayGridMonth";

  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: getInitialView(),
    firstDay: 1,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek"
    },
    selectable: true,
    dayMaxEvents: true,
    eventDisplay: window.innerWidth < 768 ? "block" : "auto",
events: async function (fetchInfo, successCallback, failureCallback) {
  try {
    const res = await fetch(`${API_BASE}/calendario/${atletaId}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      return failureCallback(new Error("No se pudo cargar el calendario"));
    }

    const events = await res.json();

    const decorados = (events || []).map((evt) => {
      const esVisible = Number(evt.visible ?? 1) === 1;
      return {
        ...evt,
        classNames: esVisible ? [] : ["evento-oculto"],
      };
    });

    successCallback(decorados);
  } catch (err) {
    console.error("Error fetch calendario:", err);
    failureCallback(err);
  }
},

    dateClick: async function(info) {
      await abrirFormularioNuevo(info.dateStr);
    },
    eventClick: async function(info) {
      info.jsEvent.preventDefault();
      await mostrarDetalleEntrenamiento(info.event.id);
    },
  });

  // Cambiar vista automáticamente al redimensionar
 window.addEventListener('resize', () => {
    if(window.innerWidth < 768){
        calendar.changeView('dayGridMonth'); // vista compacta en móviles
    }
});


  calendar.render();

  btnDetalleEditar?.addEventListener("click", async () => {
    if (!detalleEntrenamientoActual) return;
    modalDetalle?.hide();
    await abrirFormularioExistente(
      detalleEntrenamientoActual.id,
      detalleEntrenamientoActual
    );
  });

  // --- 🧍 Cargar nombre del atleta ---
  async function cargarNombreAtleta(id) {
    try {
      const response = await fetch(`${API_BASE}/atletas/${id}`, { method: "GET", credentials: "include" });
      if (!response.ok) throw new Error("No se pudo cargar el atleta");
      const atleta = await response.json();
      const h2 = document.getElementById("atleta-name");
      if (h2) h2.textContent = `${atleta.nombre} ${atleta.apellidos}`;
    } catch (err) {
      console.error("Error al cargar atleta:", err);
      const h2 = document.getElementById("atleta-name");
      if (h2) h2.textContent = "Calendario del atleta (error al cargar datos)";
    }
  }

  if (atletaId) cargarNombreAtleta(atletaId);

  selectCicloTipo?.addEventListener("change", () =>
    actualizarSelectCiclo(selectCicloTipo.value)
  );

  btnAsignarCiclo?.addEventListener("click", async () => {
    if (!modalCiclo) return;
    ciclosCache[selectCicloTipo.value] = null;
    await actualizarSelectCiclo(selectCicloTipo.value);
    inputCicloFecha.value = "";
    selectCicloAnclaje.value = "inicio";
    labelCicloFecha.textContent = "Fecha de inicio real";
    modalCiclo.show();
  });

  formCiclo?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tipo = selectCicloTipo.value;
    const seleccionado = selectCicloId.value;
    const fecha = inputCicloFecha.value;
    const anclarEn = selectCicloAnclaje.value || "inicio";
    if (!tipo || !seleccionado || !fecha) {
      mostrarMensaje("Completa los datos del ciclo.", "warning");
      return;
    }
    const payload = {
      fecha_inicio_real: fecha,
      atleta_ids: [parseInt(atletaId, 10)],
    };
    payload.anclar_en = anclarEn;
    const endpoint = `/ciclos/${tipo}/${seleccionado}/asignaciones`;
    try {
      const token = await asegurarCsrf();
      const res = await fetch(`${API_BASE}${endpoint}`, {
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
        mostrarMensaje(data.error || "No se pudo asignar el ciclo", "danger");
        return;
      }
      mostrarMensaje(data.message || "Ciclo asignado", "success");
      modalCiclo.hide();
      calendar.refetchEvents();
    } catch (err) {
      console.error("Error al asignar ciclo:", err);
      mostrarMensaje("No se pudo asignar el ciclo", "danger");
    }
  });
});
