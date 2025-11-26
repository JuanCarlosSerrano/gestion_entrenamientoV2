const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : "http://127.0.0.1:5000");
window.API_BASE = API_BASE;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const elements = {
  tablaBody: document.getElementById("tabla-atletas-body"),
  tablaVacia: document.getElementById("tabla-atletas-vacia"),
  btnRefrescar: document.getElementById("btn-refrescar-atletas")
};

let atletas = [];

const renderTabla = () => {
  if (!elements.tablaBody) return;
  if (!atletas.length) {
    elements.tablaBody.innerHTML = "";
    elements.tablaVacia?.classList.remove("d-none");
    return;
  }
  elements.tablaVacia?.classList.add("d-none");
  elements.tablaBody.innerHTML = atletas
    .map(
      (atleta) => `
      <tr>
        <td>${atleta.nombre} ${atleta.apellidos || ""}</td>
        <td>${atleta.email || "—"}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-analizar-id="${atleta.id}">
            Analizar
          </button>
        </td>
      </tr>`
    )
    .join("");

  elements.tablaBody.querySelectorAll("[data-analizar-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `analisis_atleta.html?id=${btn.dataset.analizarId}`;
    });
  });
};

const cargarAtletas = async () => {
  try {
    const res = await fetch(`${API_BASE}/atletas`, {
      credentials: "include",
      headers: { Authorization: authHeader() }
    });
    if (!res.ok) {
      throw new Error("No se pudieron obtener los atletas.");
    }
    atletas = await res.json();
    renderTabla();
  } catch (err) {
    console.error("Error al cargar atletas:", err);
    if (elements.tablaVacia) {
      elements.tablaVacia.textContent = err.message || "No se pudieron cargar los atletas.";
      elements.tablaVacia.classList.remove("d-none");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cargarAtletas();
  elements.btnRefrescar?.addEventListener("click", cargarAtletas);
});
