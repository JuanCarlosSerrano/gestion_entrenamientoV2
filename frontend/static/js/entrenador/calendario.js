document.addEventListener("DOMContentLoaded", function () {
  const API_BASE =
    window.API_BASE ||
    (window.location && window.location.origin
      ? window.location.origin
      : "http://127.0.0.1:5000");
  window.API_BASE = API_BASE;

  const getCsrfToken = () =>
    (window.CSRF && typeof window.CSRF.getToken === "function"
      ? window.CSRF.getToken()
      : localStorage.getItem("csrfToken"));

  // ----------------------------- Mensajes / confirmación -----------------------------
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

  // ----------------------------- Referencias DOM -----------------------------
  const atletaId = new URLSearchParams(window.location.search).get("atletaId");
  const calendarEl = document.getElementById("calendar");

  const modalAsignarEl = document.getElementById("modalAsignarEntrenamiento");
  const modalAsignar = modalAsignarEl
    ? new bootstrap.Modal(modalAsignarEl)
    : null;

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

  // Modal de detalle
  const modalDetalleEl = document.getElementById("modalDetalleEntreno");
  const modalDetalle = modalDetalleEl
    ? new bootstrap.Modal(modalDetalleEl)
    : null;
  
  const detalleCampos = {
    tipo: document.getElementById("detalle-tipo"),
    nombre: document.getElementById("detalle-nombre"),
    descripcion: document.getElementById("detalle-descripcion"),
    fecha: document.getElementById("detalle-fecha"),
  };

  const campos = {
    nombre: document.getElementById("nombre"),
    descripcion: document.getElementById("descripcion"),
  };

  let detalleEntrenamientoActual = null;
  let ultimoAsignadoId = null;

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

  // ----------------------------- Visibilidad entrenos -----------------------------
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

    const modo = visModo && visModo.value ? visModo.value : "dia";

    const payload = {
      atletas: [atletaIdNum],
      fecha: visFecha.value,
      visible: visible ? 1 : 0,
      modo,
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

  btnVisMostrar?.addEventListener("click", (e) => {
    e.preventDefault();
    actualizarVisibilidad(true);
  });

  btnVisOcultar?.addEventListener("click", (e) => {
    e.preventDefault();
    actualizarVisibilidad(false);
  });

  // ----------------------------- Ciclos (micro/meso/macro) -----------------------------
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
      mostrarMensaje(
        err.message || "No se pudieron cargar los ciclos",
        "danger"
      );
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
        ayudaCiclo.textContent = "Crea ciclos antes de asignarlos.";
      }
      return;
    }

    let options = '<option value="">Selecciona un ciclo</option>';
    options += ciclos
      .map(
        (c) =>
          `<option value="${c.id}">${c.nombre}${
            c.fecha_inicio && c.fecha_fin
              ? ` (${c.fecha_inicio} → ${c.fecha_fin})`
              : ""
          }</option>`
      )
      .join("");

    selectCicloId.innerHTML = options;
    if (ayudaCiclo) {
      ayudaCiclo.textContent =
        "Selecciona un ciclo y la fecha real para desplegarlo.";
    }
  }

  selectCicloTipo?.addEventListener("change", () =>
    actualizarSelectCiclo(selectCicloTipo.value)
  );

  // ----------------------------- Helpers bloques (estilo tarjetas) -----------------------------
  const TIPO_PASO_LABEL = {
    warmup: "Calentamiento",
    cooldown: "Enfriamiento",
    rest: "Descanso",
    interval: "Intervalo",
    repeat: "Bloque repetido",
    custom: "Personalizado",
  };

  function calSecondsToClock(seconds) {
    if (
      seconds === null ||
      seconds === undefined ||
      Number.isNaN(seconds)
    )
      return "";
    const total = Math.max(0, Math.round(seconds));
    const mins = String(Math.floor(total / 60)).padStart(2, "0");
    const secs = String(total % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function calGetStepLabel(tipo) {
    switch (tipo) {
      case "warmup":
        return "Calentamiento";
      case "interval":
        return "Intervalos";
      case "rest":
        return "Recuperación";
      case "repeat":
        return "Bloque repetido";
      case "cooldown":
        return "Enfriamiento";
      case "custom":
        return "Bloque libre";
      default:
        return "Bloque";
    }
  }

  function calGetBlockClass(tipo) {
    switch (tipo) {
      case "warmup":
        return "training-block--warmup";
      case "interval":
        return "training-block--interval";
      case "rest":
        return "training-block--rest";
      case "repeat":
        return "training-block--repeat";
      case "cooldown":
        return "training-block--cooldown";
      case "custom":
        return "training-block--custom";
      default:
        return "";
    }
  }

  function calDescribeStep(step) {
    if (!step) return "";

    if (step.tipo_paso === "repeat") {
      const inner = (step.subpasos || [])
        .map(calDescribeStep)
        .filter(Boolean)
        .join(" + ");
      const reps = step.repeticiones || 1;
      return `${reps}×(${inner})`;
    }

    const partes = [];
    if (step.objetivo_valor) {
      const unidad = step.unidad || "";
      partes.push(`${step.objetivo_valor}${unidad}`);
    }
    if (step.zona) {
      partes.push(`Zona ${step.zona}`);
    }
    if (step.recuperacion_valor) {
      partes.push(`Rec: ${calSecondsToClock(step.recuperacion_valor)}`);
    }
    if (step.descripcion) {
      partes.push(step.descripcion);
    }

    return partes.join(" · ") || "Sin detalles";
  }

  function calCreateBlockElement(step, index) {
    const block = document.createElement("div");
    block.className = `training-block ${calGetBlockClass(
      step.tipo_paso
    )}`.trim();

    const header = document.createElement("div");
    header.className = "training-block-header";

    const title = document.createElement("div");
    title.className = "training-block-title";
    title.textContent = calGetStepLabel(step.tipo_paso);

    const meta = document.createElement("div");
    meta.className = "training-block-meta";

    const numSpan = document.createElement("span");
    numSpan.className = "training-pill training-pill--index";
    numSpan.textContent = `Bloque ${index + 1}`;
    meta.appendChild(numSpan);

    if (step.tipo_paso === "repeat" && step.repeticiones) {
      const repSpan = document.createElement("span");
      repSpan.className = "training-pill training-pill--repeat";
      repSpan.textContent = `${step.repeticiones} repeticiones`;
      meta.appendChild(repSpan);
    }

    header.appendChild(title);
    header.appendChild(meta);
    block.appendChild(header);

    const body = document.createElement("div");
    body.className = "training-block-body";

    const content = document.createElement("div");
    content.className = "training-block-text";
    content.textContent = calDescribeStep(step);
    body.appendChild(content);

    if (
      step.tipo_paso === "repeat" &&
      Array.isArray(step.subpasos) &&
      step.subpasos.length
    ) {
      const subList = document.createElement("ul");
      subList.className = "training-substeps-list";
      step.subpasos.forEach((sub, idx) => {
        const li = document.createElement("li");
        li.textContent = `${idx + 1}. ${calDescribeStep(sub)}`;
        subList.appendChild(li);
      });
      body.appendChild(subList);
    }

    block.appendChild(body);
    return block;
  }

  function renderBloquesPreview(pasos = []) {
    const container = document.getElementById("bloques-preview-list");
    const empty = document.getElementById("bloques-preview-empty");
    if (!container || !empty) return;

    container.innerHTML = "";

    if (!Array.isArray(pasos) || !pasos.length) {
      empty.classList.remove("d-none");
      return;
    }

    empty.classList.add("d-none");

    pasos.forEach((step, idx) => {
      container.appendChild(calCreateBlockElement(step, idx));
    });
  }

  function renderDetalleBloques(pasos = []) {
    const container = document.getElementById("detalle-bloques-list");
    const empty = document.getElementById("detalle-bloques-empty");
    if (!container || !empty) return;

    container.innerHTML = "";

    if (!Array.isArray(pasos) || !pasos.length) {
      empty.classList.remove("d-none");
      return;
    }

    empty.classList.add("d-none");

    pasos.forEach((step, idx) => {
      container.appendChild(calCreateBlockElement(step, idx));
    });
  }

  // Alias por si se usa desde otro sitio
  function renderAsignadoBlocks(pasos) {
    renderDetalleBloques(pasos);
  }

const llenarModalDetalle = (data = {}) => {
  if (!modalDetalle) return;

  // Guardamos el id en una variable global y en el propio modal
  detalleEntrenamientoActual = data;
  if (modalDetalleEl && data.id) {
    modalDetalleEl.dataset.asignadoId = data.id;
  }

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

    if (campos.nombre) campos.nombre.value = datos.nombre || "";
    if (campos.descripcion) {
      campos.descripcion.value =
        datos.descripcion || datos.bloque_principal || "";
    }

    if (renderBloques) {
      if (Array.isArray(datos.pasos) && datos.pasos.length) {
        renderBloquesPreview(datos.pasos);
      } else {
        renderBloquesPreview([]);
      }
    }
  };

  // ----------------------------- Plantillas / entrenamientos base -----------------------------
  async function cargarPlantillasEntrenamientos() {
    try {
      const response = await fetch(`${API_BASE}/entrenamientos`, {
        method: "GET",
        credentials: "include",
      });
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
          .map((p) => `<option value="${p.id}">${p.nombre}</option>`)
          .join("");

      selectEntrenamiento.innerHTML = opciones;

      if (preseleccion) {
        const existe = plantillasDisponibles.some(
          (p) => String(p.id) === String(preseleccion)
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
    if (!res.ok)
      throw new Error("No se pudo cargar el detalle del entrenamiento");
    const data = await res.json();
    detalleEntrenamientosCache[entrenamientoId] = data;
    return data;
  }

  selectEntrenamiento?.addEventListener("change", async () => {
    const value = selectEntrenamiento.value;

    const plantilla = plantillasDisponibles.find(
      (p) => String(p.id) === String(value)
    );

    if (plantilla) {
      aplicarEntrenamientoAlFormulario(plantilla, { renderBloques: false });
      renderBloquesPreview([]);

      try {
        const detalle = await obtenerDetalleEntrenamientoBase(plantilla.id);
        const pasos = detalle.pasos || [];
        renderBloquesPreview(pasos);

        if (!campos.descripcion.value) {
          campos.descripcion.value =
            detalle.descripcion || detalle.bloque_principal || "";
        }
      } catch (err) {
        console.error("Error cargando bloques base:", err);
        renderBloquesPreview([]);
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
      (p) => String(p.id) === String(entrenamientoSeleccionado)
    );

    const nombre = (campos.nombre?.value || plantilla?.nombre || "").trim();
    if (!nombre) {
      mostrarMensaje(
        "No se pudo determinar el nombre del entrenamiento",
        "danger"
      );
      return null;
    }

    return {
      atleta_id: parseInt(atletaId, 10),
      fecha: fechaSeleccionada,
      entrenamiento_id: Number(entrenamientoSeleccionado),
      nombre,
      visible: 0, // se crean ocultos
    };
  }

  // ----------------------------- Abrir modales (nuevo / existente) -----------------------------
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
      aplicarEntrenamientoAlFormulario(data, { renderBloques: false });

      // 1) si el entreno asignado tiene pasos propios → los usamos
      if (Array.isArray(data.pasos) && data.pasos.length) {
        renderBloquesPreview(data.pasos);
      } else if (data.entrenamiento_id) {
        // 2) si no, usamos los pasos del entrenamiento base
        try {
          const detalleBase = await obtenerDetalleEntrenamientoBase(
            data.entrenamiento_id
          );
          renderBloquesPreview(detalleBase.pasos || []);
        } catch (err) {
          console.error(
            "Error cargando detalle de entrenamiento base:",
            err
          );
          renderBloquesPreview([]);
        }
      } else {
        renderBloquesPreview([]);
      }

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

    // Guardamos el detalle y NOS ASEGURAMOS de tener un id
    detalleEntrenamientoActual = data || {};
    if (!detalleEntrenamientoActual.id) {
      detalleEntrenamientoActual.id = eventoId;
    }
    ultimoAsignadoId = detalleEntrenamientoActual.id;

    llenarModalDetalle(detalleEntrenamientoActual);
    modalDetalle.show();
  } catch (err) {
    console.error("Error al mostrar detalle del entrenamiento:", err);
    mostrarMensaje("No se pudo abrir el entrenamiento", "danger");
  }
}


  // ----------------------------- Guardar / eliminar -----------------------------
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

  // ----------------------------- FullCalendar -----------------------------
  function getInitialView() {
    return window.innerWidth < 768 ? "dayGridMonth" : "dayGridMonth";
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: getInitialView(),
    firstDay: 1,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek",
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
    dateClick: async function (info) {
      await abrirFormularioNuevo(info.dateStr);
    },
   eventClick: async function (info) {
  const event = info.event;
  const datos = event.extendedProps || {};

  const asignadoId =
    datos.entrenamiento_asignado_id ??
    datos.asignado_id ??
    datos.id ??
    event.id;

  if (!asignadoId) {
    mostrarMensaje(
      "No se pudo identificar el entrenamiento asignado",
      "danger"
    );
    return;
  }

  // Guardamos el último id clicado
  ultimoAsignadoId = asignadoId;

  // Abrimos el modal de detalle
  mostrarDetalleEntrenamiento(asignadoId);
},

  });

  window.addEventListener("resize", () => {
    if (window.innerWidth < 768) {
      calendar.changeView("dayGridMonth");
    }
  });

  calendar.render();

  // ----------------------------- Detalle → Editar -----------------------------
  // Botón "Editar bloques" del modal de detalle
  // ----------------------------- Detalle → Editar -----------------------------
const btnEditarBloques = document.getElementById("btn-editar-bloques");

btnEditarBloques?.addEventListener("click", () => {
  // Intentamos coger el id del detalle, o si no, el último clicado
  const id =
    (detalleEntrenamientoActual && detalleEntrenamientoActual.id) ||
    ultimoAsignadoId;

  if (!id) {
    console.warn("No hay id de entrenamiento asignado al pulsar Editar");
    mostrarMensaje(
      "No se pudo identificar el entrenamiento a editar",
      "danger"
    );
    return;
  }

  modalDetalle?.hide();

  window.location.href =
    `/static/entrenador/entrenamiento_asignado_editor.html?asignadoId=${id}`;
});


  // ----------------------------- Cargar nombre atleta -----------------------------
  async function cargarNombreAtleta(id) {
    try {
      const response = await fetch(`${API_BASE}/atletas/${id}`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) throw new Error("No se pudo cargar el atleta");
      const atleta = await response.json();
      const h2 = document.getElementById("atleta-name");
      if (h2) h2.textContent = `${atleta.nombre} ${atleta.apellidos}`;
    } catch (err) {
      console.error("Error al cargar atleta:", err);
      const h2 = document.getElementById("atleta-name");
      if (h2)
        h2.textContent =
          "Calendario del atleta (error al cargar datos)";
    }
  }

  if (atletaId) cargarNombreAtleta(atletaId);

  // ----------------------------- Asignar ciclo al atleta -----------------------------
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
      anclar_en: anclarEn,
    };

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
