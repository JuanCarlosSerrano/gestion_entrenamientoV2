const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin
    ? window.location.origin
    : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const tablaBody = document.getElementById("tabla-alertas");
const vacio = document.getElementById("alertas-vacio");
const btnRefrescar = document.getElementById("btn-refrescar");
const filtroTipo = document.getElementById("filtro-tipo");
const filtroEstado = document.getElementById("filtro-estado");

const tipoBadge = (tipo) => {
  const t = (tipo || "info").toLowerCase();
  const mapa = {
    danger: "bg-danger",
    warning: "bg-warning text-dark",
    info: "bg-info text-dark",
    success: "bg-success",
  };
  const cls = mapa[t] || "bg-secondary";
  return `<span class="badge ${cls} text-uppercase">${t}</span>`;
};

const formatFecha = (valor) => {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor || "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

const renderTabla = (alertas = []) => {
  if (!tablaBody) return;
  tablaBody.innerHTML = "";

  if (!alertas.length) {
    vacio?.classList.remove("d-none");
    return;
  }
  vacio?.classList.add("d-none");

  const rows = alertas
    .map((a) => {
      const isActiva = a.activo && Number(a.activo) === 1;
      const btnResolver = isActiva
        ? `<button class="btn btn-sm btn-outline-success" data-resolver-id="${a.id}">Resolver</button>`
        : `<button class="btn btn-sm btn-outline-secondary" data-reactivar-id="${a.id}">Reactivar</button>`;
      return `
        <tr>
          <td>${formatFecha(a.fecha_detectada)}</td>
          <td>${a.atleta || "—"}</td>
          <td>${a.entrenamiento || "—"}</td>
          <td>${tipoBadge(a.tipo)}</td>
          <td>${a.mensaje || "—"}</td>
          <td class="text-end">${btnResolver}</td>
        </tr>
      `;
    })
    .join("");
  tablaBody.innerHTML = rows;

  tablaBody.querySelectorAll("[data-resolver-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-resolver-id");
      if (!id) return;
      await resolverAlerta(id);
    });
  });

  tablaBody.querySelectorAll("[data-reactivar-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-reactivar-id");
      if (!id) return;
      await reactivarAlerta(id);
    });
  });
};

const cargarAlertas = async (refresh = true) => {
  if (!tablaBody) return;
  try {
    const tipo = (filtroTipo?.value || "").trim().toLowerCase();
    const activo = filtroEstado?.value ?? "1";
    const params = new URLSearchParams();
    params.set("refresh", refresh ? "1" : "0");
    if (tipo) params.set("tipo", tipo);
    if (activo !== "") params.set("activo", activo);
    const url = `${API_BASE}/alertas/entrenador?${params.toString()}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      throw new Error("No se pudieron obtener las alertas.");
    }
    const data = await res.json();
    renderTabla(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Error al cargar alertas:", err);
    if (vacio) {
      vacio.textContent = err.message || "No se pudieron cargar las alertas.";
      vacio.classList.remove("d-none");
    }
  }
};

const resolverAlerta = async (alertaId) => {
  try {
    const res = await fetch(`${API_BASE}/alertas/entrenador/${alertaId}/resolver`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo resolver la alerta.");
    }
    cargarAlertas(true);
  } catch (err) {
    console.error("Error al resolver alerta:", err);
    alert(err.message || "No se pudo resolver la alerta.");
  }
};

const reactivarAlerta = async (alertaId) => {
  try {
    const res = await fetch(`${API_BASE}/alertas/entrenador/${alertaId}/reactivar`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo reactivar la alerta.");
    }
    cargarAlertas(true);
  } catch (err) {
    console.error("Error al reactivar alerta:", err);
    alert(err.message || "No se pudo reactivar la alerta.");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cargarAlertas(true);
  btnRefrescar?.addEventListener("click", () => cargarAlertas(true));
  filtroTipo?.addEventListener("change", () => cargarAlertas(false));
  filtroEstado?.addEventListener("change", () => cargarAlertas(false));
});
