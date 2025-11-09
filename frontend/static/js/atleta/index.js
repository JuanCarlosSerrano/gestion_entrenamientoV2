const API = window.API_BASE || "http://127.0.0.1:5000";
window.API_BASE = API;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

document.addEventListener("DOMContentLoaded", async function () {
  const contenedor = document.getElementById("entrenamientos-asignados");
  const historial = document.getElementById("entrenamientos-historial");
  const nombreAtleta = document.getElementById("nombre-atleta");
  const fotoPerfil = document.getElementById("foto-perfil");
  const modal = new bootstrap.Modal(document.getElementById("modalFeedback"));
  const formFeedback = document.getElementById("form-feedback");
  const comentarioInput = document.getElementById("comentario");
  const entrenamientoIdInput = document.getElementById("feedback-entrenamiento-id");
  const enlaceInput = document.getElementById("enlace_entrenamiento");
  const percepcionSelect = document.getElementById("percepcion");
  const tiempoInput = document.getElementById("tiempo_realizado");
  const resultadoInput = document.getElementById("resultado_entrenamiento");
  const formPerfil = document.getElementById("form-perfil");
  const inputNombre = document.getElementById("input-nombre");
  const inputApellidos = document.getElementById("input-apellidos");
  const inputFoto = document.getElementById("input-foto");
  const listaFeedbacks = document.getElementById("feedbacks-enviados-lista");

  try {
    const atletaId = localStorage.getItem("userId");

    if (!atletaId) {
      contenedor.innerHTML = "<div class='alert alert-warning'>No se ha podido identificar al atleta.</div>";
      return;
    }

    // Cargar datos del perfil
    const perfilRes = await fetch(`${API}/perfil_atleta/${atletaId}`, {
      credentials: "include",
      headers: {
        Authorization: authHeader()
      }
    });
    const perfil = await perfilRes.json();
    nombreAtleta.textContent = `Bienvenid@, ${perfil.nombre}`;
    inputNombre.value = perfil.nombre;
    inputApellidos.value = perfil.apellidos;
    if (perfil.foto_url) {
      fotoPerfil.src = perfil.foto_url;
    } else {
      fotoPerfil.src = "../img/default-avatar.jpg";
    }

    // Entrenamientos asignados
    const res = await fetch(`${API}/entrenamientos_asignados/${atletaId}`, {
      credentials: "include",
      headers: {
        Authorization: authHeader()
      }
    });

    if (!res.ok) throw new Error("Error al obtener entrenamientos asignados");
    const entrenamientos = await res.json();

    const hoy = new Date();
    entrenamientos.forEach((ent) => {
      const fechaEntreno = new Date(ent.fecha);
      const card = document.createElement("div");
      card.className = "card mb-3";
      card.innerHTML = `
        <div class="card-body">
          <h5 class="card-title">${ent.nombre} - ${ent.fecha}</h5>
          <p><strong>Duración:</strong> ${ent.duracion_valor || '-'} ${ent.duracion_tipo || ''}</p>
          <p><strong>Calentamiento:</strong> ${ent.calentamiento_valor || '-'} ${ent.calentamiento_tipo || ''}</p>
          <p><strong>Bloque Activación:</strong> ${ent.bloque_activacion || '-'}</p>
          <p><strong>Bloque Principal:</strong> ${ent.bloque_principal || '-'}</p>
          <p><strong>Enfriamiento:</strong> ${ent.enfriamiento_valor || '-'} ${ent.enfriamiento_tipo || ''}</p>
          <button class="btn btn-sm btn-primary btn-feedback" data-id="${ent.id}">Enviar Feedback</button>
        </div>
      `;
      if (fechaEntreno >= hoy) {
        contenedor.appendChild(card);
      } else {
        historial.appendChild(card);
      }
    });

    // Escuchar clicks en los botones de feedback
    document.body.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-feedback")) {
        const entrenamientoId = e.target.dataset.id;
        entrenamientoIdInput.value = entrenamientoId;
        comentarioInput.value = "";
        enlaceInput.value = "";
        percepcionSelect.value = "";
        tiempoInput.value = "";
        resultadoInput.value = "";
        modal.show();
      }
    });

  } catch (err) {
    console.error("Error al cargar entrenamientos:", err);
    contenedor.innerHTML = "<div class='alert alert-danger'>Error al cargar los entrenamientos.</div>";
  }

  // Enviar el feedback
  formFeedback.addEventListener("submit", async function (e) {
    e.preventDefault();

    const comentario = comentarioInput.value.trim();
    const entrenamiento_id = entrenamientoIdInput.value;
    const enlace = enlaceInput.value.trim();
    const percepcion = percepcionSelect.value;
    const tiempo_realizado = tiempoInput.value;
    const resultado = resultadoInput.value.trim();

    if (!comentario || !entrenamiento_id || !percepcion || !tiempo_realizado || !resultado) {
      alert("Completa todos los campos del feedback.");
      return;
    }

    try {
      let csrf = getCsrfToken();
      if (window.CSRF?.ensureToken) {
        csrf = await window.CSRF.ensureToken();
      }
      const res = await fetch(`${API}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
          ...(csrf ? { "X-CSRF-Token": csrf } : {})
        },
        body: JSON.stringify({ entrenamiento_id, comentario, enlace, percepcion, tiempo_realizado, resultado })
      });

      const respuesta = await res.json();

      if (!res.ok) throw new Error(respuesta.error || "Error al enviar feedback");

      alert(respuesta.message || "Feedback enviado correctamente");
      modal.hide();
      cargarMisFeedbacks();
    } catch (err) {
      console.error("Error al enviar feedback:", err);
      alert(err.message || "Error al enviar feedback");
    }
  });

  // Guardar cambios de perfil
  formPerfil.addEventListener("submit", async function (e) {
    e.preventDefault();

    const nombre = inputNombre.value.trim();
    const apellidos = inputApellidos.value.trim();
    const foto = inputFoto.files[0];

    const formData = new FormData();
    formData.append("nombre", nombre);
    formData.append("apellidos", apellidos);
    if (foto) formData.append("foto", foto);

    try {
      const res = await fetch(`${API}/actualizar_perfil`, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: authHeader()
        },
        body: formData
      });

      const respuesta = await res.json();
      if (!res.ok) throw new Error(respuesta.error || "No se pudo actualizar el perfil");

      alert("Perfil actualizado correctamente");
      if (respuesta.foto_url) fotoPerfil.src = respuesta.foto_url;
      nombreAtleta.textContent = `Bienvenido, ${nombre}`;
    } catch (err) {
      console.error("Error al actualizar perfil:", err);
      alert("No se pudo actualizar el perfil");
    }
  });

  async function cargarMisFeedbacks() {
    if (!listaFeedbacks) return;
    try {
      const res = await fetch(`${API}/mis_feedbacks`, {
        credentials: "include",
        headers: {
          Authorization: authHeader()
        }
      });
      const feedbacks = await res.json();
      listaFeedbacks.innerHTML = "";

      if (!res.ok || !Array.isArray(feedbacks) || feedbacks.length === 0) {
        listaFeedbacks.innerHTML = '<p class="text-muted">Aún no has enviado feedbacks.</p>';
        return;
      }

      feedbacks.forEach((fb) => {
        const statusClass = fb.leido ? "chip chip-success" : "chip chip-warning";
        const statusText = fb.leido ? "Revisado" : "Pendiente";
        const card = document.createElement("div");
        card.className = "border rounded p-3 mb-3 bg-white shadow-sm";
        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <strong>${fb.entrenamiento_nombre || "Entrenamiento"}</strong><br>
              <small class="text-muted">${new Date(fb.fecha_entreno).toLocaleDateString()}</small>
            </div>
            <span class="${statusClass}">
              ${statusText}
            </span>
          </div>
          <div class="mt-2">
            ${fb.comentario ? `<p class="mb-1"><strong>Comentario:</strong> ${fb.comentario}</p>` : ""}
            ${fb.resultado ? `<p class="mb-1"><strong>Resultado:</strong> ${fb.resultado}</p>` : ""}
            ${fb.tiempo_realizado ? `<p class="mb-1"><strong>Tiempo:</strong> ${fb.tiempo_realizado}</p>` : ""}
            ${fb.percepcion ? `<p class="mb-1"><strong>Percepción:</strong> ${fb.percepcion}</p>` : ""}
            ${fb.enlace ? `<p class="mb-1"><strong>Enlace:</strong> <a href="${fb.enlace}" target="_blank" rel="noopener">${fb.enlace}</a></p>` : ""}
            <small class="text-muted">Enviado: ${new Date(fb.fecha).toLocaleString()}</small>
          </div>
          ${fb.respuesta ? `<div class="alert alert-info mt-3 mb-0"><strong>Respuesta del entrenador:</strong><br>${fb.respuesta}</div>` : ""}
        `;
        listaFeedbacks.appendChild(card);
      });
    } catch (err) {
      console.error("Error al cargar mis feedbacks:", err);
      listaFeedbacks.innerHTML = '<p class="text-danger">No se pudieron cargar tus feedbacks.</p>';
    }
  }

  cargarMisFeedbacks();
});
