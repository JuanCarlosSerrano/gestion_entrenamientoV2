const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const formatearNumero = (valor) => (typeof valor === "number" ? valor : 0);
const textoDelta = (valor) => valor || "—";
const formatearFecha = (valor) => {
  if (!valor) return "—";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) {
    const partes = String(valor).split("-");
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return valor;
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};
const formatearTiempo = (segundos) => {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return "—";
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const seg = total % 60;
  if (horas > 0) {
    return `${horas}:${minutos.toString().padStart(2, "0")}:${seg.toString().padStart(2, "0")}`;
  }
  return `${minutos}:${seg.toString().padStart(2, "0")}`;
};

const renderTablaBloques = (bloques = []) => {
  if (!Array.isArray(bloques) || !bloques.length) {
    return '<p class="text-muted">Este entrenamiento no tiene bloques configurados.</p>';
  }
  const filas = [];
  bloques.forEach((bloque, idx) => {
    const descripcion = `${idx + 1}. ${(bloque.repeticiones || 1)} x ${bloque.distancia_m || "-"}${
      bloque.distancia_m ? " m" : ""
    }${bloque.zona ? ` · Zona ${bloque.zona}` : ""}`;
    if (Array.isArray(bloque.series) && bloque.series.length) {
      bloque.series.forEach((serie) => {
        filas.push(`
          <tr>
            <td>${descripcion}</td>
            <td>${serie.numero_repeticion}</td>
            <td>${serie.tiempo_objetivo_texto || "-"}</td>
            <td>${serie.tiempo_real_texto || "Sin registro"}</td>
          </tr>`);
      });
    } else {
      filas.push(`
        <tr>
          <td>${descripcion}</td>
          <td>—</td>
          <td>${bloque.tiempo_min_texto || bloque.tiempo_max_texto || "-"}</td>
          <td>${bloque.resultado_tiempo_texto || "Sin registro"}</td>
        </tr>`);
    }
  });
  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>Bloque</th>
            <th>Serie</th>
            <th>Tiempo objetivo</th>
            <th>Tiempo real</th>
          </tr>
        </thead>
        <tbody>${filas.join("")}</tbody>
      </table>
    </div>`;
};

const cacheDetallesResultados = new Map();
let modalDetalleResultado = null;

document.addEventListener("DOMContentLoaded", () => {
  const resumenBody = document.getElementById("estadisticas-resumen");
  const resumenVacio = document.getElementById("estadisticas-vacio");
  const btnRefrescar = document.getElementById("btn-refrescar-estadisticas");
  const detallePlaceholder = document.getElementById("detalle-placeholder");
  const detalleContenido = document.getElementById("detalle-contenido");
  const detalleTitulo = document.getElementById("detalle-titulo");
  const detalleSubtitulo = document.getElementById("detalle-subtitulo");
  const detalleZonasBody = document.getElementById("detalle-zonas-body");
  const detalleSesiones = null;
  const tablaResultadosBody = document.getElementById("tabla-resultados-body");
  const resultadosVacio = document.getElementById("resultados-vacio");
  const btnRefrescarResultados = document.getElementById("btn-refrescar-resultados");
  const modalEl = document.getElementById("modalDetalleResultado");
  if (modalEl) {
    modalDetalleResultado = new bootstrap.Modal(modalEl);
  }
  const historicoSelect = document.getElementById("historico-select");
  const historicoBloqueSelect = document.getElementById("historico-bloque-select");
  const historicoEmpty = document.getElementById("historico-empty");
  const historicoContenido = document.getElementById("historico-contenido");
  const historicoTablaBody = document.getElementById("historico-tabla-body");
  const historicoChart = document.getElementById("historico-chart");
  const historicoState = {
    data: [],
    seleccionadoEntrenamiento: null,
    seleccionadoBloque: null
  };

  let resumenActual = [];
  let resultadosActuales = [];

  const renderResumen = () => {
    if (!resumenBody) return;
    if (!resumenActual.length) {
      resumenBody.innerHTML = "";
      resumenVacio?.classList.remove("d-none");
      return;
    }
    resumenVacio?.classList.add("d-none");
    resumenBody.innerHTML = resumenActual
      .map(
        (fila) => `
        <tr>
          <td>${fila.nombre}</td>
          <td>${formatearNumero(fila.total_series)}</td>
          <td>${formatearNumero(fila.series_reportadas)}</td>
          <td>${textoDelta(fila.desviacion_media_texto)}</td>
          <td>${fila.zona_mas_trabajada || "—"}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btn-ver-detalle" data-atleta-id="${fila.atleta_id}">
              Ver detalle
            </button>
          </td>
        </tr>`
      )
      .join("");
  };

  const cargarResumen = async () => {
    try {
      const res = await fetch(`${API_BASE}/estadisticas/entrenador/resumen`, {
        credentials: "include",
        headers: {
          Authorization: authHeader()
        }
      });
      if (!res.ok) throw new Error("No se pudieron obtener las estadísticas");
      resumenActual = await res.json();
      renderResumen();
    } catch (err) {
      console.error("Error cargando resumen:", err);
      if (resumenVacio) resumenVacio.textContent = err.message || "Error al cargar las estadísticas.";
      resumenVacio?.classList.remove("d-none");
    }
  };

  const renderDetalle = (detalle) => {
    if (!detalleContenido) return;
    detallePlaceholder?.classList.add("d-none");
    detalleContenido.classList.remove("d-none");
    detalleTitulo.textContent = `Detalle por atleta · ${detalle.atleta.nombre} ${detalle.atleta.apellidos}`;
    detalleSubtitulo.textContent = "Resumen de zonas y desviaciones recientes.";

    // Zonas
    if (detalleZonasBody) {
      if (!detalle.zonas.length) {
        detalleZonasBody.innerHTML = `<tr><td colspan="5" class="text-muted">No hay datos registrados.</td></tr>`;
      } else {
        detalleZonasBody.innerHTML = detalle.zonas
          .map(
            (zona) => `
              <tr>
                <td>${zona.zona || "-"}</td>
                <td>${zona.total_series}</td>
                <td>${zona.promedio_objetivo_texto || "—"}</td>
                <td>${zona.promedio_real_texto || "—"}</td>
                <td>${textoDelta(zona.desviacion_texto)}</td>
              </tr>`
          )
          .join("");
      }
    }

    // Sesiones
    if (detalleSesiones) {
      if (!detalle.sesiones.length) {
        detalleSesiones.innerHTML =
          "<p class='text-muted mb-0'>Sin sesiones registradas todavía.</p>";
      } else {
        detalleSesiones.innerHTML = detalle.sesiones
          .map(
            (sesion) => `
            <div class="border rounded px-3 py-2 mb-2">
              <div class="d-flex justify-content-between">
                <strong>${formatearFecha(sesion.fecha)}</strong>
                <span>${textoDelta(sesion.desviacion_texto)}</span>
              </div>
              <div>${sesion.entrenamiento}</div>
              <small class="text-muted">
                Series reportadas: ${sesion.series_reportadas}/${sesion.series_totales}
              </small>
            </div>`
          )
          .join("");
      }
    }
    configurarHistorico(detalle.historico_entrenamientos || []);
  };

  const cargarDetalle = async (atletaId) => {
    try {
      const res = await fetch(`${API_BASE}/estadisticas/atleta/${atletaId}`, {
        credentials: "include",
        headers: {
          Authorization: authHeader()
        }
      });
      if (!res.ok) throw new Error("No se pudo obtener el detalle del atleta");
      const detalle = await res.json();
      renderDetalle(detalle);
    } catch (err) {
      console.error("Error cargando detalle:", err);
      alert(err.message || "No se pudo cargar el detalle del atleta.");
    }
  };

  document.addEventListener("click", (event) => {
    const boton = event.target.closest(".btn-ver-detalle");
    if (boton?.dataset?.atletaId) {
      cargarDetalle(boton.dataset.atletaId);
    }
  });

  btnRefrescar?.addEventListener("click", () => {
    detalleContenido?.classList.add("d-none");
    detallePlaceholder?.classList.remove("d-none");
    cargarResumen();
  });

  cargarResumen();

  const configurarHistorico = (datos = []) => {
    if (!historicoSelect) return;
    historicoState.data = datos;
    if (!datos.length) {
      historicoSelect.innerHTML = "";
      historicoSelect.disabled = true;
      if (historicoBloqueSelect) {
        historicoBloqueSelect.innerHTML = "";
        historicoBloqueSelect.disabled = true;
      }
      historicoEmpty?.classList.remove("d-none");
      historicoContenido?.classList.add("d-none");
      return;
    }
    historicoSelect.disabled = false;
    historicoSelect.innerHTML = datos
      .map(
        (item, index) => {
          const totalSesiones = Array.isArray(item.bloques)
            ? item.bloques.reduce((acc, bloque) => acc + (bloque?.sesiones?.length || 0), 0)
            : 0;
          return `<option value="${item.entrenamiento_id}">${item.nombre} (${totalSesiones})</option>`;
        }
      )
      .join("");
    historicoEmpty?.classList.add("d-none");
    historicoContenido?.classList.remove("d-none");
    const inicialEntr = datos[0]?.entrenamiento_id;
    historicoState.seleccionadoEntrenamiento = inicialEntr;
    historicoSelect.value = inicialEntr;
    configurarBloques(inicialEntr);
  };

  const configurarBloques = (entrenamientoId) => {
    if (!historicoBloqueSelect) {
      renderHistorico(entrenamientoId, null);
      return;
    }
    const dataset = historicoState.data.find(
      (item) => String(item.entrenamiento_id) === String(entrenamientoId)
    );
    historicoBloqueSelect.innerHTML = "";
    if (!dataset || !Array.isArray(dataset.bloques) || !dataset.bloques.length) {
      historicoBloqueSelect.innerHTML = "";
      historicoBloqueSelect.disabled = true;
      historicoTablaBody.innerHTML = "";
      historicoContenido?.classList.add("d-none");
      historicoEmpty?.classList.remove("d-none");
      return;
    }
    historicoBloqueSelect.disabled = false;
    historicoBloqueSelect.innerHTML = dataset.bloques
      .map(
        (bloque) =>
          `<option value="${bloque.bloque_id}">${bloque.descripcion} (${bloque.sesiones?.length || 0})</option>`
      )
      .join("");
    const inicialBloque = dataset.bloques[0]?.bloque_id;
    historicoState.seleccionadoBloque = inicialBloque;
    historicoBloqueSelect.value = inicialBloque;
    renderHistorico(entrenamientoId, inicialBloque);
  };

  const renderHistorico = (entrenamientoId, bloqueId) => {
    if (!historicoTablaBody) return;
    const dataset = historicoState.data.find(
      (item) => String(item.entrenamiento_id) === String(entrenamientoId)
    );
    if (!dataset) {
      historicoTablaBody.innerHTML = "";
      historicoContenido?.classList.add("d-none");
      historicoEmpty?.classList.remove("d-none");
      return;
    }
    const bloque = dataset.bloques?.find(
      (b) => String(b.bloque_id) === String(bloqueId)
    ) || dataset.bloques?.[0];
    if (!bloque) {
      historicoTablaBody.innerHTML = "";
      historicoContenido?.classList.add("d-none");
      historicoEmpty?.classList.remove("d-none");
      return;
    }
    historicoState.seleccionadoBloque = bloque.bloque_id;
    historicoContenido?.classList.remove("d-none");
    historicoEmpty?.classList.add("d-none");
    const filas = bloque.sesiones
      .map(
        (sesion) => `
        <tr>
          <td>${formatearFecha(sesion.fecha)}</td>
          <td>${sesion.promedio_objetivo_texto || "—"}</td>
          <td>${sesion.promedio_real_texto || "—"}</td>
          <td>${sesion.delta_texto || "—"}</td>
        </tr>`
      )
      .join("");
    historicoTablaBody.innerHTML = filas;
    dibujarHistoricoChart(historicoChart, bloque.sesiones);
  };

  const dibujarHistoricoChart = (canvas, sesiones) => {
    if (!canvas || !sesiones || !sesiones.length) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth || 600;
    const height = canvas.height || 260;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const puntos = sesiones
      .map((sesion) => ({
        fecha: sesion.fecha,
        objetivo: sesion.promedio_objetivo_seg,
        real: sesion.promedio_real_seg
      }))
      .filter((p) => p.real || p.objetivo);
    if (!puntos.length) return;

    const valores = puntos.flatMap((p) => [p.real, p.objetivo]).filter((v) => typeof v === "number");
    const minVal = Math.min(...valores);
    const maxVal = Math.max(...valores);
    const rango = maxVal - minVal || 1;

    const areaWidth = width - padding.left - padding.right;
    const areaHeight = height - padding.top - padding.bottom;

    const getX = (index) => {
      if (puntos.length === 1) return padding.left + areaWidth / 2;
      return padding.left + (areaWidth * index) / (puntos.length - 1);
    };
    const getY = (valor) => {
      if (valor === null || valor === undefined) return null;
      return padding.top + areaHeight - ((valor - minVal) / rango) * areaHeight;
    };

    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    const drawLine = (prop, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      puntos.forEach((p, index) => {
        const y = getY(p[prop]);
        if (y === null) return;
        const x = getX(index);
        if (index === 0 || getY(puntos[index - 1][prop]) === null) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.fillStyle = color;
      puntos.forEach((p, index) => {
        const y = getY(p[prop]);
        if (y === null) return;
        const x = getX(index);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    drawLine("objetivo", "#6c757d");
    drawLine("real", "#0d6efd");

    ctx.fillStyle = "#6c757d";
    ctx.font = "12px sans-serif";
    puntos.forEach((p, index) => {
      const x = getX(index);
      ctx.fillText(formatearFecha(p.fecha) || "", x - 30, height - padding.bottom + 20);
    });
    ctx.fillText(formatearTiempo(maxVal), padding.left - 45, padding.top + 5);
    ctx.fillText(formatearTiempo(minVal), padding.left - 45, height - padding.bottom);
  };

  historicoSelect?.addEventListener("change", (event) => {
    historicoState.seleccionadoEntrenamiento = event.target.value;
    configurarBloques(event.target.value);
  });

  historicoBloqueSelect?.addEventListener("change", (event) => {
    historicoState.seleccionadoBloque = event.target.value;
    renderHistorico(historicoState.seleccionadoEntrenamiento, event.target.value);
  });

  const renderResultados = (datos = []) => {
    if (!tablaResultadosBody) return;
    if (!datos.length) {
      tablaResultadosBody.innerHTML = "";
      resultadosVacio?.classList.remove("d-none");
      return;
    }
    resultadosVacio?.classList.add("d-none");
    tablaResultadosBody.innerHTML = datos
      .map(
        (fila) => `
        <tr class="resultado-row" data-asignado-id="${fila.entrenamiento_asignado_id || ""}" style="cursor:pointer;">
          <td>${fila.atleta}</td>
          <td>${fila.entrenamiento}</td>
          <td>${formatearFecha(fila.fecha)}</td>
          <td>${formatearTiempo(fila.tiempo_objetivo_seg)}</td>
          <td>${formatearTiempo(fila.tiempo_real_seg)}</td>
          <td class="${fila.delta_seg > 0 ? "text-danger" : fila.delta_seg < 0 ? "text-success" : ""}">
            ${fila.delta_texto || "—"}
          </td>
        </tr>`
      )
      .join("");
  };

  const cargarResultados = async () => {
    if (!tablaResultadosBody) return;
    try {
      const res = await fetch(`${API_BASE}/estadisticas/resultados`, {
        credentials: "include",
        headers: {
          Authorization: authHeader()
        }
      });
      if (!res.ok) throw new Error("No se pudieron cargar los resultados");
      resultadosActuales = await res.json();
      renderResultados(resultadosActuales);
    } catch (err) {
      console.error("Error cargando resultados:", err);
      if (resultadosVacio) {
        resultadosVacio.textContent = err.message || "Error al cargar los resultados.";
        resultadosVacio.classList.remove("d-none");
      }
      if (tablaResultadosBody) tablaResultadosBody.innerHTML = "";
    }
  };

  tablaResultadosBody?.addEventListener("click", async (event) => {
    const row = event.target.closest(".resultado-row");
    if (!row) return;
    const asignadoId = row.dataset.asignadoId;
    if (!asignadoId) return;
    try {
      let detalle = cacheDetallesResultados.get(asignadoId);
      if (!detalle) {
        const res = await fetch(`${API_BASE}/entrenamientos_asignados/uno/${asignadoId}`, {
          credentials: "include",
          headers: { Authorization: authHeader() },
        });
        if (!res.ok) throw new Error("No se pudo cargar el detalle del entrenamiento");
        detalle = await res.json();
        cacheDetallesResultados.set(asignadoId, detalle);
      }
      const body = document.getElementById("detalle-resultado-body");
      if (body) {
        body.innerHTML = `
          <p><strong>Entrenamiento:</strong> ${detalle.nombre || "—"}</p>
          <p><strong>Fecha:</strong> ${detalle.fecha || "—"}</p>
          ${renderTablaBloques(detalle.bloques)}
        `;
      }
      modalDetalleResultado?.show();
    } catch (err) {
      console.error("Error mostrando detalle:", err);
      alert(err.message || "No se pudo cargar el detalle del entrenamiento.");
    }
  });

  btnRefrescarResultados?.addEventListener("click", () => {
    cacheDetallesResultados.clear();
    cargarResultados();
  });

  if (tablaResultadosBody) {
    cargarResultados();
  }
});
