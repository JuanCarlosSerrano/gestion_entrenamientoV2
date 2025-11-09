const entrenamientosTableBody = document.querySelector('#entrenamientos-table tbody');
const entrenamientosListContainer = document.getElementById('entrenamientos-list-container');

// Crear contenedor de tarjetas
const gridContainer = document.createElement('div');
gridContainer.className = 'tarjeta-grid';
entrenamientosListContainer.appendChild(gridContainer);

// Función para obtener la lista de entrenamientos del backend
async function fetchEntrenamientos() {
    try {
        const response = await fetch('http://127.0.0.1:5000/entrenamientos', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
            }
        });
        if (!response.ok) {
            throw new Error('Error al obtener la lista de entrenamientos');
        }
        const entrenamientos = await response.json();
        displayEntrenamientos(entrenamientos);
    } catch (error) {
        console.error('Error:', error);
        alert('Error al obtener la lista de entrenamientos. Consulta la consola.');
    }
}

// Función para mostrar entrenamientos en tarjetas responsivas
function displayEntrenamientos(entrenamientos) {
    gridContainer.innerHTML = ''; // Limpiar tarjetas previas
    entrenamientos.forEach(entrenamiento => {
        const card = document.createElement('div');
        card.className = 'tarjeta-card';
        card.innerHTML = `
            <div class="entrenamiento-nombre">${entrenamiento.nombre}</div>
            <div class="entrenamiento-info"><strong>Duración:</strong> ${entrenamiento.duracion_valor || '-'} ${entrenamiento.duracion_tipo || ''}</div>
            <div class="entrenamiento-info"><strong>Calentamiento:</strong> ${entrenamiento.calentamiento_valor || '-'} ${entrenamiento.calentamiento_tipo || ''}</div>
            <div class="entrenamiento-info"><strong>Bloque Principal:</strong> ${entrenamiento.bloque_principal || '-'}</div>
            <div class="entrenamiento-info"><strong>Enfriamiento:</strong> ${entrenamiento.enfriamiento_valor || '-'} ${entrenamiento.enfriamiento_tipo || ''}</div>
            <div class="entrenamiento-actions">
                <button class="btn btn-sm btn-primary editar-btn" data-id="${entrenamiento.id}">Editar</button>
                <button class="btn btn-sm btn-danger eliminar-btn" data-id="${entrenamiento.id}">Eliminar</button>
            </div>
        `;
        gridContainer.appendChild(card);
    });
}

function init() {
    console.log('Inicializando Entrenamientos');
    fetchEntrenamientos();
}

export {
    init
};
