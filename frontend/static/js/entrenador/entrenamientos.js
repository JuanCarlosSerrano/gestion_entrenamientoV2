export function init() {
        const entrenamientosTableBody = document.querySelector('#entrenamientos-table tbody');
        const entrenamientoFormContainer = document.getElementById('entrenamiento-form-container');
        const entrenamientoForm = document.getElementById('entrenamiento-form-element');
        const createEntrenamientoBtn = document.getElementById('create-entrenamiento-btn');
        const cancelEntrenamientoBtn = document.getElementById('cancel-entrenamiento-btn');

        if (!entrenamientosTableBody || !entrenamientoForm || !createEntrenamientoBtn) {
            console.warn("entrenamientos.js: No estamos en entrenamientos.html, saliendo.");
            return;
        }

        let editingEntrenamientoId = null;

        async function fetchEntrenamientos() {
            try {
                const response = await fetch('http://127.0.0.1:5000/entrenamientos', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                    }
                });
                if (!response.ok) throw new Error('Error al obtener la lista de entrenamientos');
                const entrenamientos = await response.json();
                displayEntrenamientos(entrenamientos);
            } catch (error) {
                console.error('fetchEntrenamientos - Error:', error);
                alert('Error al obtener entrenamientos');
            }
        }

        function displayEntrenamientos(entrenamientos) {
            entrenamientosTableBody.innerHTML = '';
            entrenamientos.forEach(entrenamiento => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${entrenamiento.nombre}</td>
                    <td>${entrenamiento.duracion_valor} ${entrenamiento.duracion_tipo || ''}</td>
                    <td>${entrenamiento.calentamiento_tipo}: ${entrenamiento.calentamiento_valor || '---'}</td>
                    <td>${entrenamiento.bloque_principal}</td>
                    <td>${entrenamiento.enfriamiento_tipo}: ${entrenamiento.enfriamiento_valor || '---'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary edit-entrenamiento-btn" data-id="${entrenamiento.id}">Editar</button>
                        <button class="btn btn-sm btn-danger delete-entrenamiento-btn" data-id="${entrenamiento.id}">Eliminar</button>
                    </td>
                `;
                entrenamientosTableBody.appendChild(row);
            });

            document.querySelectorAll('.edit-entrenamiento-btn').forEach(btn => {
                btn.addEventListener('click', () => populateEntrenamientoForm(btn.dataset.id));
            });

            document.querySelectorAll('.delete-entrenamiento-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteEntrenamiento(btn.dataset.id));
            });
        }

        function showEntrenamientoForm() {
            document.getElementById('entrenamientos-list-container').style.display = 'none';
            entrenamientoFormContainer.style.display = 'block';
        }

        function hideEntrenamientoForm() {
            document.getElementById('entrenamientos-list-container').style.display = 'block';
            entrenamientoFormContainer.style.display = 'none';
            entrenamientoForm.reset();
            editingEntrenamientoId = null;
        }

        async function populateEntrenamientoForm(entrenamientoId) {
            showEntrenamientoForm();
            try {
                const response = await fetch(`http://127.0.0.1:5000/entrenamientos/${entrenamientoId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                    }
                });
                if (!response.ok) throw new Error('Error al obtener datos del entrenamiento');
                const e = await response.json();
                document.getElementById('nombre').value = e.nombre;
                document.getElementById('duracion_valor').value = e.duracion_valor || '';
                document.getElementById('duracion_tipo').value = e.duracion_tipo || '';
                document.getElementById('calentamiento_tipo').value = e.calentamiento_tipo || '';
                document.getElementById('calentamiento_valor').value = e.calentamiento_valor || '';
                document.getElementById('bloque_activacion').value = e.bloque_activacion || '';
                document.getElementById('bloque_principal').value = e.bloque_principal || '';
                document.getElementById('enfriamiento_tipo').value = e.enfriamiento_tipo || '';
                document.getElementById('enfriamiento_valor').value = e.enfriamiento_valor || '';
                editingEntrenamientoId = entrenamientoId;
            } catch (error) {
                console.error('populateEntrenamientoForm - Error:', error);
                alert('Error al cargar el entrenamiento');
            }
        }

        async function saveEntrenamiento(event) {
            event.preventDefault();
            const data = {
                nombre: document.getElementById('nombre').value,
                duracion_valor: document.getElementById('duracion_valor').value,
                duracion_tipo: document.getElementById('duracion_tipo').value,
                calentamiento_tipo: document.getElementById('calentamiento_tipo').value,
                calentamiento_valor: document.getElementById('calentamiento_valor').value,
                bloque_activacion: document.getElementById('bloque_activacion').value,
                bloque_principal: document.getElementById('bloque_principal').value,
                enfriamiento_tipo: document.getElementById('enfriamiento_tipo').value,
                enfriamiento_valor: document.getElementById('enfriamiento_valor').value
            };

            try {
                const method = editingEntrenamientoId ? 'PUT' : 'POST';
                const url = editingEntrenamientoId
                    ? `http://127.0.0.1:5000/entrenamientos/${editingEntrenamientoId}`
                    : 'http://127.0.0.1:5000/entrenamientos';

                const response = await fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error('Error al guardar el entrenamiento');
                const result = await response.json();
                alert(result.message);
                fetchEntrenamientos();
                hideEntrenamientoForm();
            } catch (error) {
                console.error('saveEntrenamiento - Error:', error);
                alert('Error al guardar entrenamiento');
            }
        }

        async function deleteEntrenamiento(id) {
            if (!confirm('¿Seguro que quieres eliminar este entrenamiento?')) return;
            try {
                const response = await fetch(`http://127.0.0.1:5000/entrenamientos/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                    }
                });
                if (!response.ok) throw new Error('Error al eliminar');
                const result = await response.json();
                alert(result.message);
                fetchEntrenamientos();
            } catch (error) {
                console.error('deleteEntrenamiento - Error:', error);
                alert('Error al eliminar entrenamiento');
            }
        }

        // Event listeners
        createEntrenamientoBtn.addEventListener('click', showEntrenamientoForm);
        cancelEntrenamientoBtn.addEventListener('click', hideEntrenamientoForm);
        entrenamientoForm.addEventListener('submit', saveEntrenamiento);

        fetchEntrenamientos();
    
}
