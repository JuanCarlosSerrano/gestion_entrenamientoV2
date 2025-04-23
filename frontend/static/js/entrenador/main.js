let Atletas;
let Calendario;
let Entrenamientos;

document.addEventListener('DOMContentLoaded', () => {
    console.log("main.js cargado");

    const ruta = window.location.pathname;

    // Inicializar las funcionalidades solo en la página correspondiente
    if (ruta.endsWith('atletas.html')) {
        import('./atletas.js').then(module => {
            Atletas = module;
            Atletas.init();
        }).catch(error => {
            console.error("Error cargando atletas.js", error);
        });
    } else if (ruta.endsWith('entrenamientos.html')) {
        console.log("Cargando entrenamientos.init()");
        import('./entrenamientos.js').then(module => {
            Entrenamientos = module;
            Entrenamientos.init();
        }).catch(error => {
            console.error("Error cargando entrenamientos.js", error);
        });
    } else if (ruta.endsWith('calendario.html')) {
        import('./calendario.js').then(module => {
            Calendario = module;
            Calendario.initCalendario();
        }).catch(error => {
            console.error("Error cargando calendario.js", error);
        });
    } else if (ruta.endsWith('index.html')) {
        cargarProximosEntrenamientos();
        mostrarFeedbacksPendientes();
    }
});

async function mostrarFeedbacksPendientes() {
    const contenedor = document.getElementById('feedbacks-pendientes');
    if (!contenedor) return;

    try {
        const res = await fetch("http://127.0.0.1:5000/feedbacks_pendientes", {
            headers: {
                Authorization: "Basic " + btoa(
                    `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
                )
            }
        });

        const feedbacks = await res.json();
        contenedor.innerHTML = '';

        if (!Array.isArray(feedbacks)) {
            contenedor.innerHTML = '<p class="text-danger">Error al procesar los feedbacks</p>';
            return;
        }

        if (feedbacks.length === 0) {
            contenedor.innerHTML = '<p class="text-muted">No hay feedbacks pendientes</p>';
            return;
        }

        const lista = document.createElement("ul");
        lista.classList.add("list-group", "mt-3");

        feedbacks.forEach(fb => {
            const li = document.createElement("li");
            li.className = "list-group-item";
            li.innerHTML = `
                <a href="feedback.html?id=${fb.id}" class="text-decoration-none">
                    <strong>${fb.atleta}:</strong> ${fb.comentario.slice(0, 40)}...
                    <br><small>${new Date(fb.fecha).toLocaleString()}</small>
                </a>
            `;
            lista.appendChild(li);
        });

        contenedor.appendChild(lista);
    } catch (err) {
        console.error("Error al obtener feedbacks pendientes:", err);
    }
}

async function cargarProximosEntrenamientos() {
    const contenedor = document.getElementById('proximos-entrenamientos');
    if (!contenedor) return;

    try {
        const res = await fetch('http://127.0.0.1:5000/entrenamientos_proximos', {
            headers: {
                Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
            }
        });

        const entrenos = await res.json();
        contenedor.innerHTML = '';

        if (!Array.isArray(entrenos) || entrenos.length === 0) {
            contenedor.innerHTML = '<p class="text-muted">No hay entrenamientos próximos.</p>';
            return;
        }

        entrenos.forEach(e => {
            const div = document.createElement('div');
            div.className = 'mb-2';
            div.innerHTML = `
                <strong>${e.nombre}</strong><br>
                <small>${new Date(e.fecha).toLocaleDateString()} - ${e.num_atletas} atletas</small>
            `;
            contenedor.appendChild(div);
        });

    } catch (err) {
        console.error("Error cargando entrenamientos:", err);
    }
}
