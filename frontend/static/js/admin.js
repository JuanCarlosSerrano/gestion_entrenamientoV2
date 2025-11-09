document.addEventListener('DOMContentLoaded', () => {
    const userListContainer = document.getElementById('user-list-container');
    const userFormContainer = document.getElementById('user-form-container');
    const userForm = document.getElementById('user-form-element');
    const userTableBody = document.querySelector('#user-table tbody');
    const createUserBtn = document.getElementById('create-user-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    let editingUserId = null;
    const API_BASE = window.API_BASE || 'http://127.0.0.1:5000';
    window.API_BASE = API_BASE;

    // --------------------------------------------------
    // Helpers
    // --------------------------------------------------

    function getAuthHeader() {
        const email = localStorage.getItem('userEmail') || '';
        const password = localStorage.getItem('userPassword') || '';
        return 'Basic ' + btoa(`${email}:${password}`);
    }

    async function ensureCsrfToken() {
        if (window.CSRF?.ensureToken) {
            return window.CSRF.ensureToken();
        }
        const token = localStorage.getItem('csrfToken');
        if (!token) {
            throw new Error('No hay token CSRF disponible');
        }
        return token;
    }

    // --------------------------------------------------
    // Listar usuarios
    // --------------------------------------------------

    async function fetchUsers() {
        try {
            const response = await fetch('/usuarios', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getAuthHeader()
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Error al obtener la lista de usuarios');
            }

            const users = await response.json();
            displayUsers(users);
        } catch (error) {
            console.error('Error:', error);
            alert('Error al obtener la lista de usuarios. Consulta la consola.');
        }
    }

    function displayUsers(users) {
        userTableBody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.nombre}</td>
                <td>${user.apellidos}</td>
                <td>${user.email}</td>
                <td>${user.rol}</td>
                <td>
                    <button class="btn btn-sm btn-primary edit-btn" data-id="${user.id}">Editar</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${user.id}">Eliminar</button>
                </td>
            `;
            userTableBody.appendChild(row);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = parseInt(btn.dataset.id, 10);
                populateUserForm(userId);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = parseInt(btn.dataset.id, 10);
                deleteUser(userId);
            });
        });
    }

    // --------------------------------------------------
    // Mostrar / ocultar formulario
    // --------------------------------------------------

    function showUserForm() {
        userListContainer.style.display = 'none';
        userFormContainer.style.display = 'block';
    }

    function hideUserForm() {
        userListContainer.style.display = 'block';
        userFormContainer.style.display = 'none';
        userForm.reset();
        editingUserId = null;
    }

    // --------------------------------------------------
    // Rellenar formulario al editar
    // --------------------------------------------------

    async function populateUserForm(userId) {
        showUserForm();
        try {
            const response = await fetch(`/usuarios/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getAuthHeader()
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Error al obtener los datos del usuario');
            }

            const user = await response.json();
            document.getElementById('nombre').value = user.nombre;
            document.getElementById('apellidos').value = user.apellidos;
            document.getElementById('email').value = user.email;
            document.getElementById('rol').value = user.rol;

            editingUserId = userId;
        } catch (error) {
            console.error('Error:', error);
            alert('Error al obtener los datos del usuario. Consulta la consola.');
        }
    }

    // --------------------------------------------------
    // Crear / actualizar usuario
    // --------------------------------------------------

    async function saveUser(event) {
        event.preventDefault();

        const nombre = document.getElementById('nombre').value.trim();
        const apellidos = document.getElementById('apellidos').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rol = document.getElementById('rol').value;

        const userData = { nombre, apellidos, email, rol };
        if (password) {
            userData.password = password;
        }

        console.log('Datos que se envían:', userData, 'editingUserId:', editingUserId);

        try {
            const method = editingUserId ? 'PUT' : 'POST';
            const url = editingUserId ? `/usuarios/${editingUserId}` : '/usuarios';
            const token = await ensureCsrfToken();

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getAuthHeader(),
                    'X-CSRF-Token': token      // 👈 nombre EXACTO que espera el backend
                },
                credentials: 'include',
                body: JSON.stringify(userData)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                console.error('Error en respuesta:', response.status, result);
                throw new Error(result.error || (editingUserId
                    ? 'Error al actualizar el usuario'
                    : 'Error al crear el usuario'));
            }

            alert(result.message || (editingUserId
                ? 'Usuario actualizado correctamente'
                : 'Usuario creado correctamente'));

            fetchUsers();
            hideUserForm();

        } catch (error) {
            console.error('Error en saveUser:', error);
            alert(error.message || (editingUserId
                ? 'Error al actualizar el usuario. Consulta la consola.'
                : 'Error al crear el usuario. Consulta la consola.'));
        }
    }

    // --------------------------------------------------
    // Eliminar usuario
    // --------------------------------------------------

    async function deleteUser(userId) {
        if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) return;

        try {
            const token = await ensureCsrfToken();

            const response = await fetch(`/usuarios/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getAuthHeader(),
                    'X-CSRF-Token': token      // 👈 igual aquí
                },
                credentials: 'include'
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                console.error('Error en respuesta (delete):', response.status, result);
                throw new Error(result.error || 'Error al eliminar el usuario');
            }

            alert(result.message || 'Usuario eliminado correctamente');
            fetchUsers();

        } catch (error) {
            console.error('Error en deleteUser:', error);
            alert(error.message || 'Error al eliminar el usuario. Consulta la consola.');
        }
    }

    // --------------------------------------------------
    // Eventos
    // --------------------------------------------------

    createUserBtn.addEventListener('click', showUserForm);
    cancelBtn.addEventListener('click', hideUserForm);
    userForm.addEventListener('submit', saveUser);

    // --------------------------------------------------
    // Init
    // --------------------------------------------------

    // Solo para desarrollo: credenciales del admin
    localStorage.setItem('userEmail', 'admin@example.com');
    localStorage.setItem('userPassword', 'admin1234');

    fetchUsers();
});
