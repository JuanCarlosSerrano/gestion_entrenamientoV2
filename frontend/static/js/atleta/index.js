document.addEventListener("DOMContentLoaded", async function () {
  const contenedor = document.getElementById("entrenamientos-asignados");
  const historial = document.getElementById("entrenamientos-historial");
  const nombreAtleta = document.getElementById("nombre-atleta");
  const fotoPerfil = document.getElementById("foto-perfil");
  const modal = new bootstrap.Modal(document.getElementById("modalFeedback"));
  const formFeedback = document.getElementById("form-feedback");
  const comentarioInput = document.getElementById("comentario");
  const entrenamientoIdInput = document.getElementById("feedback-entrenamiento-id");
  const formPerfil = document.getElementById("form-perfil");
  const inputNombre = document.getElementById("input-nombre");
  const inputApellidos = document.getElementById("input-apellidos");
  const inputFoto = document.getElementById("input-foto");

  try {
    const atletaId = localStorage.getItem("userId");

    if (!atletaId) {
      contenedor.innerHTML = "<div class='alert alert-warning'>No se ha podido identificar al atleta.</div>";
      return;
    }

    // Cargar datos del perfil
    const perfilRes = await fetch(`http://127.0.0.1:5000/perfil_atleta/${atletaId}`, {
      headers: {
        Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
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
    const res = await fetch(`http://127.0.0.1:5000/entrenamientos_asignados/${atletaId}`, {
      headers: {
        Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
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

    if (!comentario || !entrenamiento_id) {
      alert("Debes rellenar el comentario.");
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:5000/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
        },
        body: JSON.stringify({ entrenamiento_id, comentario })
      });

      const resultado = await res.json();

      if (!res.ok) throw new Error(resultado.error || "Error al enviar feedback");

      alert(resultado.message || "Feedback enviado correctamente");
      modal.hide();
    } catch (err) {
      console.error("Error al enviar feedback:", err);
      alert("Error al enviar feedback");
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
      const res = await fetch(`http://127.0.0.1:5000/actualizar_perfil`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
        },
        body: formData
      });

      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || "No se pudo actualizar el perfil");

      alert("Perfil actualizado correctamente");
      if (resultado.foto_url) fotoPerfil.src = resultado.foto_url;
      nombreAtleta.textContent = `Bienvenido, ${nombre}`;
    } catch (err) {
      console.error("Error al actualizar perfil:", err);
      alert("No se pudo actualizar el perfil");
    }
  });
});
