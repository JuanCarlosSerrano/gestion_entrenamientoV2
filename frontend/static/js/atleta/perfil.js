import { API, authHeader, getAtletaId, fetchJSON } from "./api.js";
import "../utils/csrf.js";

const formPerfil = document.getElementById("form-perfil");
const inputNombre = document.getElementById("input-nombre");
const inputApellidos = document.getElementById("input-apellidos");
const inputEmail = document.getElementById("input-email");
const inputTelefono = document.getElementById("input-telefono");
const inputFecha = document.getElementById("input-fecha");
const inputFoto = document.getElementById("input-foto");
const fotoPerfil = document.getElementById("foto-perfil");
const zonasEmpty = document.getElementById("zonas-empty");
const zonasTabla = document.getElementById("zonas-tabla");
const zonasBody = document.getElementById("zonas-body");
const perfilGrupo = document.getElementById("perfil-grupo");
const perfilCategoria = document.getElementById("perfil-categoria");
const perfilEntrenador = document.getElementById("perfil-entrenador");

const pace = (value) => {
  const total = Math.round(Number(value || 0) * 60);
  if (!total) return "-";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
};

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
    { clave: "z5", nombre: "Zona 5 · VO2max" }
  ];
  const filas = definiciones
    .map(({ clave, nombre }) =>
      zonas[clave]
        ? `<article class="athlete-metric-card"><span class="athlete-muted">${nombre}</span><strong>${pace(zonas[clave])}</strong></article>`
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
    inputEmail.value = perfil.email || "";
    inputTelefono.value = perfil.telefono || "";
    inputFecha.value = perfil.fecha_nacimiento || "";
    if (perfil.foto_url && fotoPerfil) fotoPerfil.src = perfil.foto_url;
    if (perfilGrupo) perfilGrupo.textContent = [perfil.grupo, perfil.subgrupo].filter(Boolean).join(" · ") || "-";
    if (perfilCategoria) perfilCategoria.textContent = perfil.categoria || "-";
    if (perfilEntrenador) perfilEntrenador.textContent = perfil.entrenador_nombre || perfil.entrenador_email || "-";
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
  const csrf = await window.CSRF.ensureToken().catch(() => null);
  if (!csrf) {
    alert("No se pudo obtener token CSRF. Recarga la página.");
    return;
  }
  const formData = new FormData();
  formData.append("nombre", inputNombre.value.trim());
  formData.append("apellidos", inputApellidos.value.trim());
  formData.append("email", inputEmail.value.trim());
  formData.append("telefono", inputTelefono.value.trim());
  formData.append("fecha_nacimiento", inputFecha.value);
  if (inputFoto.files[0]) {
    formData.append("foto", inputFoto.files[0]);
  }
  try {
    const res = await fetch(`${API}/actualizar_perfil`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: authHeader(),
        "X-CSRF-Token": csrf
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

// Cambio de contraseña
const formPassword = document.getElementById("form-password");
const inputPassActual = document.getElementById("input-pass-actual");
const inputPassNueva = document.getElementById("input-pass-nueva");
const inputPassConfirm = document.getElementById("input-pass-confirm");

const cambiarPassword = async (event) => {
  event.preventDefault();
  if (inputPassNueva.value !== inputPassConfirm.value) {
    alert("La confirmación de contraseña no coincide.");
    return;
  }
  const csrf = await window.CSRF.ensureToken().catch(() => null);
  if (!csrf) {
    alert("No se pudo obtener token CSRF. Recarga la página.");
    return;
  }
  try {
    const res = await fetch(`${API}/usuarios/password`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify({
        password_actual: inputPassActual.value,
        password_nueva: inputPassNueva.value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo cambiar la contraseña");
    alert("Contraseña actualizada correctamente");
    inputPassActual.value = "";
    inputPassNueva.value = "";
    inputPassConfirm.value = "";
  } catch (err) {
    console.error("Error al cambiar contraseña:", err);
    alert(err.message || "No se pudo cambiar la contraseña");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  formPassword?.addEventListener("submit", cambiarPassword);
});
