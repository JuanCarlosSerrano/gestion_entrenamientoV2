import { buildTreeFromFlat, renderPasos, calcularTiempoDesdeZona } from "../atleta/pasos.js";

const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const qs = new URLSearchParams(window.location.search);
const atletaId = qs.get("id");

const elements = {
  nombre: document.getElementById("athlete-name"),
  filtroNombre: document.getElementById("filtro-nombre"),
  comparativa: document.getElementById("comparativa-contenido"),
  resumenRango: document.getElementById("resumen-semana-rango-entrenador"),
  resumenSesiones: document.getElementById("resumen-semana-sesiones-entrenador"),
  resumenCompletadas: document.getElementById("resumen-semana-completadas-entrenador"),
  resumenPendientes: document.getElementById("resumen-semana-pendientes-entrenador")
};

let entrenamientosCargados = [];
let zonasAtleta = null;
const resultadosCache = new Map();

const formatearFecha = (valor) => {
  if (!valor) return "--/--/----";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return valor;
  return date.toLocaleDateString("es-ES");
};

const formatearTiempo = (segundos) => {
  if (!Number.isFinite(segundos) || segundos <= 0) return "—";
  const total = Math.round(segundos);
  const minutos = Math.floor(total / 60);
  const seg = total % 60;
  return `${minutos}:${String(seg).padStart(2, "0")}`;
};

const resumenSemana = (entrenos, pendientes, hoy) => {
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); // lunes
  inicioSemana.setHours(0, 0, 0, 0);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);

  const rango =
    elements.resumenRango ||
    elements.resumenSesiones ||
    elements.resumenCompletadas ||
    elements.resumenPendientes;
  if (elements.resumenRango) {
    const ini = inicioSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    const fin = finSemana.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    elements.resumenRango.textContent = `${ini} – ${fin}`;
  }

  const idsPend = new Set((pendientes || []).map((e) => e.id));
  const entrenosSemana = entrenos.filter((ent) => {
    if (!ent.fecha) return false;
    const f = new Date(ent.fecha);
    return f >= inicioSemana && f <= finSemana;
  });

  let completadas = 0;
  let pend = 0;
  entrenosSemana.forEach((ent) => {
    if (!ent.fecha) return;
    const f = new Date(ent.fecha);
    f.setHours(0, 0, 0, 0);
    if (f < hoy) {
      if (idsPend.has(ent.id)) pend += 1;
      else completadas += 1;
    }
  });

  if (elements.resumenSesiones) elements.resumenSesiones.textContent = `${entrenosSemana.length}`;
  if (elements.resumenCompletadas) elements.resumenCompletadas.textContent = `${completadas}`;
  if (elements.resumenPendientes) elements.resumenPendientes.textContent = `${pend}`;
};

const cargarZonas = async () => {
  try {
    const res = await fetch(`${API_BASE}/zonas_atleta/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (res.ok) zonasAtleta = await res.json();
  } catch (err) {
    console.warn("No se pudieron cargar zonas del atleta:", err);
    zonasAtleta = null;
  }
};

const obtenerResultados = async (entrenamientoId) => {
  if (resultadosCache.has(entrenamientoId)) return resultadosCache.get(entrenamientoId);
  try {
    const res = await fetch(`${API_BASE}/entrenamientos_asignados/${entrenamientoId}/resultados`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error("No se pudieron obtener resultados");
    const data = await res.json();
    resultadosCache.set(entrenamientoId, Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn("No se pudieron cargar resultados de", entrenamientoId, err);
    resultadosCache.set(entrenamientoId, []);
  }
  return resultadosCache.get(entrenamientoId);
};

const cargarAtleta = async () => {
  if (!atletaId) return;
  try {
    const res = await fetch(`${API_BASE}/atletas/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (res.ok) {
      const data = await res.json();
      if (elements.nombre) {
        elements.nombre.textContent = `${data.nombre || "Atleta"} ${data.apellidos || ""}`.trim();
      }
    } else if (elements.nombre) {
      elements.nombre.textContent = `Atleta ${atletaId}`;
    }
  } catch (err) {
    console.error("No se pudo cargar atleta:", err);
    if (elements.nombre) elements.nombre.textContent = `Atleta ${atletaId}`;
  }
};

const aplicarFiltro = () => {
  const seleccionado = elements.filtroNombre?.value || "todos";
  const filtrados =
    seleccionado === "todos"
      ? entrenamientosCargados
      : entrenamientosCargados.filter((e) => (e.nombre || "").trim() === seleccionado);

  renderComparativa(filtrados);
};

const poblarSelectNombres = () => {
  if (!elements.filtroNombre) return;
  const nombres = Array.from(
    new Set(
      entrenamientosCargados
        .map((e) => (e.nombre || "").trim())
        .filter(Boolean)
    )
  ).sort();

  const opciones = ['<option value="todos">Todos los entrenamientos</option>'].concat(
    nombres.map((n) => `<option value="${n}">${n}</option>`)
  );
  elements.filtroNombre.innerHTML = opciones.join("");
  elements.filtroNombre.onchange = aplicarFiltro;
};

const extraerIntervalos = (pasos, zonas, bloquePrefix = []) => {
  const resultado = [];
  const recorrer = (paso, idxBloque, repStack = []) => {
    if (!paso) return;
    if (paso.tipo_paso === "repeat") {
      const reps = Number(paso.repeticiones) || 1;
      for (let r = 1; r <= reps; r += 1) {
        (paso.subpasos || []).forEach((sub) => recorrer(sub, idxBloque, [...repStack, r]));
      }
      return;
    }
    if (paso.tipo_paso === "interval") {
      const repeticion = repStack.length ? repStack[repStack.length - 1] : 1;
      resultado.push({
        pasoId: paso.id,
        bloque: idxBloque + 1,
        repeticion,
        distancia: paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "—",
        objetivo: calcularTiempoDesdeZona(paso, zonas),
        zona: paso.zona || "",
        descripcion: paso.descripcion || ""
      });
    }
    (paso.subpasos || []).forEach((sub) => recorrer(sub, idxBloque, repStack));
  };
  (pasos || []).forEach((p, idx) => recorrer(p, idx));
  return resultado;
};

const renderComparativa = async (entrenos) => {
  if (!elements.comparativa) return;
  if (!entrenos.length) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">Selecciona un entrenamiento para ver los tiempos.</p>';
    return;
  }

  const filas = [];
  for (const ent of entrenos) {
    const resultados = await obtenerResultados(ent.id);
    const intervalos = extraerIntervalos(ent.pasos || [], zonasAtleta);
    intervalos.forEach((item) => {
      const encontrado = (resultados || []).find(
        (r) =>
          Number(r.paso_detalle_id) === Number(item.pasoId) &&
          Number(r.repeticion) === Number(item.repeticion)
      );
      filas.push({
        fecha: formatearFecha(ent.fecha),
        bloque: item.bloque,
        repeticion: item.repeticion,
        distancia: item.distancia,
        objetivo: item.objetivo || item.zona || "—",
        real: encontrado?.tiempo_real_seg ? formatearTiempo(encontrado.tiempo_real_seg) : "—"
      });
    });
  }

  if (!filas.length) {
    elements.comparativa.innerHTML =
      '<p class="text-muted mb-0">No hay intervalos con zona definida en estos entrenamientos.</p>';
    return;
  }

  const rowsHtml = filas
    .map(
      (f) => `
      <tr>
        <td>${f.fecha}</td>
        <td>${f.bloque} · Rep ${f.repeticion}</td>
        <td>${f.distancia}</td>
        <td>${f.objetivo}</td>
        <td>${f.real}</td>
      </tr>`
    )
    .join("");

  elements.comparativa.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>Fecha</th>
            <th>Bloque</th>
            <th>Distancia</th>
            <th>Tiempo propuesto</th>
            <th>Tiempo real</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
};

const cargarEntrenamientos = async () => {
  if (!atletaId) {
    if (elements.comparativa)
      elements.comparativa.innerHTML = '<p class="text-danger mb-0">Falta el id de atleta.</p>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/entrenamientos_asignados/${atletaId}`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) throw new Error("No se pudieron obtener los entrenamientos.");
    const entrenos = await res.json();
    if (!Array.isArray(entrenos) || !entrenos.length) {
      if (elements.comparativa) {
        elements.comparativa.innerHTML =
          '<p class="text-muted mb-0">No hay entrenamientos asignados.</p>';
      }
      return;
    }
    entrenamientosCargados = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    for (const ent of entrenos) {
      let pasos = [];
      try {
        const det = await fetch(
          `${API_BASE}/entrenamientos_asignados/${ent.id}/detalle`,
          {
            credentials: "include",
            headers: { Authorization: authHeader() }
          }
        );
        if (det.ok) {
          const flat = await det.json();
          pasos = buildTreeFromFlat(flat);
        }
      } catch (err) {
        console.warn("No se pudo obtener detalle de", ent.id, err);
      }
      const resultados = await obtenerResultados(ent.id);
      entrenamientosCargados.push({
        ...ent,
        pasos,
        _tieneResultados: Array.isArray(resultados) && resultados.length > 0
      });
    }
    const pendientes = entrenamientosCargados.filter((ent) => {
      const fecha = ent.fecha ? new Date(ent.fecha) : null;
      if (!fecha) return false;
      fecha.setHours(0, 0, 0, 0);
      return fecha < hoy && !ent._tieneResultados;
    });
    resumenSemana(entrenamientosCargados, pendientes, hoy);
    poblarSelectNombres();
    aplicarFiltro();
  } catch (err) {
    console.error("Error cargando entrenamientos:", err);
    if (elements.comparativa) {
      elements.comparativa.innerHTML =
        '<p class="text-danger mb-0">No se pudieron cargar los entrenamientos.</p>';
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cargarAtleta();
  cargarZonas();
  cargarEntrenamientos();
});
