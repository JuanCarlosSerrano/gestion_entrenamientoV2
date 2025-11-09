const API = window.API_BASE || "http://127.0.0.1:5000";
window.API_BASE = API;

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

document.addEventListener("DOMContentLoaded", async () => {
  async function cargarFeedbacks() {
    try {
      const res = await fetch(`${API}/feedbacks`, {
        credentials: "include",
        headers: {
          Authorization: authHeader(),
        },
      });

      const datos = await res.json();
      const listaNoLeidos = document.getElementById('lista-no-leidos');
      const listaLeidos = document.getElementById('lista-leidos');
      listaNoLeidos.innerHTML = '';
      listaLeidos.innerHTML = '';

      datos.forEach(fb => {
        const item = document.createElement('li');
        item.className = 'list-group-item';

        const contenido = document.createElement('div');
        contenido.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <strong>${fb.atleta} ${fb.respuesta ? '<span class="badge bg-success">Respondido</span>' : ''}</strong><br>
              ${fb.entrenamiento_nombre ? `<small class="text-muted">${fb.entrenamiento_nombre}</small><br>` : ''}
              ${fb.comentario}<br>
              ${fb.resultado ? `<small><strong>Resultado:</strong> ${fb.resultado}</small><br>` : ""}
              ${fb.tiempo_realizado ? `<small><strong>Tiempo:</strong> ${fb.tiempo_realizado}</small><br>` : ""}
              ${fb.percepcion ? `<small><strong>Percepción:</strong> ${fb.percepcion}</small><br>` : ""}
              ${fb.enlace ? `<a href="${fb.enlace}" target="_blank" rel="noopener" class="link-primary">Ver registro</a><br>` : ""}
              <small class="text-muted">${new Date(fb.fecha).toLocaleString()}</small>
              ${fb.respuesta ? `
                <div class="mt-3 p-3 rounded border border-success bg-light">
                  <strong class="text-success">Respuesta enviada:</strong>
                  <p class="mb-0">${fb.respuesta}</p>
                </div>
              ` : ''}       
            </div>
            <div class="text-end">
              <button class="btn ${fb.respuesta ? 'btn-success' : 'btn-outline-primary'} btn-sm mb-1" onclick="abrirModalFeedback(${fb.id})">
                Ver / Responder
              </button>
              <button class="btn btn-outline-secondary btn-sm" onclick="toggleLeido(${fb.id}, ${fb.leido})">
                Marcar como ${fb.leido ? 'no leído' : 'leído'}
              </button>
            </div>
          </div>
        `;

        item.appendChild(contenido);

        if (fb.leido) {
          listaLeidos.appendChild(item);
        } else {
          listaNoLeidos.appendChild(item);
        }
      });
    } catch (err) {
        console.error("Error al cargar los feedbacks:", err);
        alert("No se pudieron cargar los feedbacks");
    }
  }

  window.cargarFeedbacks = cargarFeedbacks;
  cargarFeedbacks();
});

window.abrirModalFeedback = async function (feedbackId) {
  try {
    const res = await fetch(`${API}/feedbacks/${feedbackId}`, {
      credentials: "include",
      headers: {
        Authorization: authHeader()
      }
    });
    const fb = await res.json();

    if (res.ok) {
      document.getElementById('modal-feedback-body').innerHTML = `
        <p><strong>Atleta:</strong> ${fb.atleta}</p>
        <p><strong>Entrenamiento:</strong> ${fb.entrenamiento_nombre || '-'}</p>
        <p><strong>Fecha del entrenamiento:</strong> ${new Date(fb.fecha_entreno).toLocaleDateString()}</p>
        <p><strong>Comentario:</strong> ${fb.comentario}</p>
        ${fb.resultado ? `<p><strong>Resultado:</strong> ${fb.resultado}</p>` : ''}
        ${fb.tiempo_realizado ? `<p><strong>Tiempo:</strong> ${fb.tiempo_realizado}</p>` : ''}
        ${fb.percepcion ? `<p><strong>Percepción del esfuerzo:</strong> ${fb.percepcion}</p>` : ''}
        ${fb.enlace ? `<p><strong>Enlace:</strong> <a href="${fb.enlace}" target="_blank" rel="noopener">${fb.enlace}</a></p>` : ''}
        <p><strong>Fecha del feedback:</strong> ${new Date(fb.fecha).toLocaleString()}</p>
        <p><strong>Estado:</strong> ${fb.leido ? 'Leído' : 'No leído'}</p>
        ${fb.respuesta ? `<div class="mt-3 p-3 bg-success-subtle border-start border-success border-3"><strong>Respuesta enviada:</strong><br>${fb.respuesta}</div>` : `
        <div class="mb-3">
          <label for="respuesta" class="form-label">Responder:</label>
          <textarea class="form-control" id="respuesta" rows="3"></textarea>
        </div>
        <button class="btn btn-primary" onclick="enviarRespuesta(${fb.id})">Enviar respuesta</button>`}
      `;

      const btnLeido = document.getElementById('btn-marcar-leido');
      btnLeido.onclick = () => marcarComoLeido(feedbackId);
      btnLeido.disabled = fb.leido;

      const modal = new bootstrap.Modal(document.getElementById('modalFeedback'));
      modal.show();
    } else {
      alert(fb.error || "Error al cargar feedback");
    }
  } catch (err) {
    console.error("Error:", err);
  }
};

async function enviarRespuesta(feedbackId) {
  const respuesta = document.getElementById('respuesta').value;
  if (!respuesta) return alert("Escribe una respuesta");

  try {
    const res = await fetch(`${API}/feedbacks/${feedbackId}/responder`, {
      method: 'POST',
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({ respuesta })
    });

    const data = await res.json();
    if (res.ok) {
      alert("Respuesta enviada");
      document.getElementById('respuesta').value = "";
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalFeedback'));
      modal.hide();
      document.querySelector('#modal-feedback-body').innerHTML = '';
      document.getElementById('btn-marcar-leido').disabled = true;
      cargarFeedbacks();
    } else {
      alert(data.error || "No se pudo enviar la respuesta");
    }
  } catch (err) {
    console.error("Error al enviar respuesta:", err);
  }
}

async function marcarComoLeido(feedbackId) {
  try {
    const res = await fetch(`${API}/feedbacks/${feedbackId}/leer`, {
      method: 'PUT',
      credentials: "include",
      headers: {
        Authorization: authHeader(),
        "X-CSRF-Token": getCsrfToken(),
      }
    });

    const data = await res.json();
    if (res.ok) {
      alert("Feedback marcado como leído");
      document.getElementById('btn-marcar-leido').disabled = true;
      cargarFeedbacks();
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error("Error al marcar como leído:", err);
  }
}

window.toggleLeido = async function(feedbackId, estadoActual) {
  try {
    const nuevoEstado = estadoActual ? 0 : 1;
    const res = await fetch(`${API}/feedbacks/${feedbackId}/leer`, {
      method: 'PUT',
      credentials: "include",
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader(),
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({ leido: nuevoEstado })
    });
    const data = await res.json();
    if (res.ok) {
      cargarFeedbacks();
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error("Error al cambiar estado de leído:", err);
  }
};
