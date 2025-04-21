const atletasTableBody = document.querySelector('#atletas-table tbody');

// Función para obtener la lista de atletas del backend
async function fetchAtletas() {
    try {
        const response = await fetch('http://127.0.0.1:5000/atletas', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
            }
        });
        if (!response.ok) {
            throw new Error('Error al obtener la lista de atletas');
        }
        const atletas = await response.json();
        displayAtletas(atletas);
    } catch (error) {
        console.error('Error:', error);
        alert('Error al obtener la lista de atletas. Consulta la consola.');
    }
}

// Función para mostrar la lista de atletas en la tabla
function displayAtletas(atletas) {
    atletasTableBody.innerHTML = ''; // Limpiar la tabla
    atletas.forEach(atleta => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${atleta.nombre}</td>
            <td>${atleta.apellidos}</td>
            <td>${atleta.fecha_nacimiento || '---'}</td>
            <td>${atleta.email || '---'}</td>
            <td>${atleta.telefono || '---'}</td>
            <td>${atleta.categoria || 'Sin categoría'}</td>
            <td>
                <a href="calendario.html?atletaId=${atleta.id}" class="btn btn-sm btn-info">Ver Calendario</a>
            </td>
        `;
        atletasTableBody.appendChild(row);
    });
}

function init() {
    console.log('Inicializando Atletas');
    fetchAtletas();
}

export {
    init
};