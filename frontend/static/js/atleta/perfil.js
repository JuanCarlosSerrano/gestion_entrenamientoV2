import { API, authHeader, getAtletaId, fetchJSON } from "./api.js";

const formPerfil = document.getElementById("form-perfil");
const inputNombre = document.getElementById("input-nombre");
const inputApellidos = document.getElementById("input-apellidos");
const inputFoto = document.getElementById("input-foto");
const fotoPerfil = document.getElementById("foto-perfil");
const zonasEmpty = document.getElementById("zonas-empty");
const zonasTabla = document.getElementById("zonas-tabla");
const zonasBody = document.getElementById("zonas-body");

const renderZonas = (zonas) => {
  if (!zonas || typeof zonas !== "object") {
    zonasEmpty.classList.remove("d-none");
    zonasTabla.classList.add("d-none");
    return;
  }
  const definiciones = [
    { clave: "z1", nombre: "Zona 1 · Recuperación" },
    { clave: "z2", nombre: "Zona 2 · Fondo suave" },
    { clave: "z3", nombre: "Zona 3 · Fondo medio" },
    { clave: "z4", nombre: "Zona 4 · Umbral" },
    { clave: "z5", nombre: "Zona 5 · VAM" },
    { clave: "z6", nombre: "Zona 6 · VO₂max" }
  ];
  const filas = definiciones
    .map(({ clave, nombre }) =>
      zonas[clave]
        ? `<tr><td>${nombre}</td><td>${Number(zonas[clave]).toFixed(2)} min/km</td></tr>`
        : ""
    )
    .filter(Boolean)
    .join("");
  if (!filas) {
    zonasEmpty.classList.remove("d-none");
    zonasTabla.classList.add("d-none");
    return;
  }
  zonasBody.innerHTML = filas;
  zonasEmpty.classList.add("d-none");
  zonasTabla.classList.remove("d-none");
};

const cargarPerfil = async () => {
  const atletaId = getAtletaId();
  if (!atletaId) {
    alert("Inicia sesión nuevamente para ver tu perfil.");
    return;
  }
  try {
    const perfil = await fetchJSON(`${API}/perfil_atleta/${atletaId}`);
    inputNombre.value = perfil.nombre || "";
    inputApellidos.value = perfil.apellidos || "";
    if (perfil.foto_url && fotoPerfil) fotoPerfil.src = perfil.foto_url;
  } catch (err) {
    console.error("Error al cargar perfil:", err);
  }

  try {
    const zonas = await fetchJSON(`${API}/zonas_atleta/${atletaId}`);
    renderZonas(zonas);
  } catch (err) {
    console.warn("No se pudieron cargar las zonas:", err);
    renderZonas(null);
  }
};

const actualizarPerfil = async (event) => {
  event.preventDefault();
  const formData = new FormData();
  formData.append("nombre", inputNombre.value.trim());
  formData.append("apellidos", inputApellidos.value.trim());
  if (inputFoto.files[0]) {
    formData.append("foto", inputFoto.files[0]);
  }
  try {
    const res = await fetch(`${API}/actualizar_perfil`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: authHeader()
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo actualizar el perfil");
    alert("Perfil actualizado correctamente");
    if (data.foto_url && fotoPerfil) fotoPerfil.src = data.foto_url;
  } catch (err) {
    console.error("Error al actualizar perfil:", err);
    alert("No se pudo actualizar el perfil.");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  cargarPerfil();
  formPerfil?.addEventListener("submit", actualizarPerfil);
});
