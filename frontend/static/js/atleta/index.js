document.addEventListener("DOMContentLoaded", async function () {
  const contenedor = document.getElementById("entrenamientos-container");

  const modal = new bootstrap.Modal(document.getElementById("modalFeedback"));
  const formFeedback = document.getElementById("form-feedback");
  const comentarioInput = document.getElementById("comentario");
  const entrenamientoIdInput = document.getElementById("feedback-entrenamiento-id");

  try {
    const userId = localStorage.getItem("userId");

    if (!userId) {
      contenedor.innerHTML = "<div class='alert alert-warning'>No se ha podido identificar al atleta.</div>";
      return;
    }
    
    const res = await fetch(`http://127.0.0.1:5000/entrenamientos_asignados/${userId}`, {
    
      headers: {
        Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
      }
    });

    if (!res.ok) throw new Error("Error al obtener entrenamientos asignados");

    const entrenamientos = await res.json();

    if (entrenamientos.length === 0) {
      contenedor.innerHTML = "<div class='alert alert-info'>No tienes entrenamientos asignados aún.</div>";
      return;
    }

    entrenamientos.forEach((ent) => {
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
      contenedor.appendChild(card);
    });

    // Escuchar clicks en botones "Enviar Feedback"
    contenedor.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-feedback")) {
        const id = e.target.dataset.id;
        entrenamientoIdInput.value = id;
        comentarioInput.value = "";
        modal.show();
      }
    });

  } catch (err) {
    console.error("Error al cargar entrenamientos:", err);
    contenedor.innerHTML = "<div class='alert alert-danger'>Error al cargar los entrenamientos.</div>";
  }

  // Enviar el feedback
  formFeedback.addEventListener("submit", async (e) => {
    e.preventDefault();

    const comentario = comentarioInput.value;
    const entrenamiento_id = entrenamientoIdInput.value;

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
      alert(resultado.message || "Feedback enviado");
      modal.hide();
    } catch (err) {
      alert("Error al enviar el feedback");
      console.error(err);
    }
  });
});
