document.addEventListener('DOMContentLoaded', () => {
    const userListContainer = document.getElementById('user-list-container');
    const userFormContainer = document.getElementById('user-form-container');
    const userForm = document.getElementById('user-form-element');
    const userTableBody = document.querySelector('#user-table tbody');
    const createUserBtn = document.getElementById('create-user-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    let editingUserId = null; // Variable para rastrear el ID del usuario que se está editando

    // Función para obtener la lista de usuarios del backend
    async function fetchUsers() {
        try {
            const response = await fetch('http://127.0.0.1:5000/usuarios', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                }
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

    // Función para mostrar la lista de usuarios en la tabla
    function displayUsers(users) {
        userTableBody.innerHTML = ''; // Limpiar la tabla antes de mostrar los usuarios
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

        // Agregar event listeners a los botones de editar y eliminar
        const editButtons = document.querySelectorAll('.edit-btn');
        editButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = parseInt(btn.dataset.id);
                populateUserForm(userId);
            });
        });

        const deleteButtons = document.querySelectorAll('.delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = parseInt(btn.dataset.id);
                deleteUser(userId);
            });
        });
    }

    // Función para mostrar el formulario y ocultar la lista de usuarios
    function showUserForm() {
        userListContainer.style.display = 'none';
        userFormContainer.style.display = 'block';
    }

    // Función para ocultar el formulario y mostrar la lista de usuarios
    function hideUserForm() {
        userListContainer.style.display = 'block';
        userFormContainer.style.display = 'none';
        userForm.reset(); // Limpiar el formulario
        editingUserId = null; // Restablecer el ID de edición
    }

    // Función para llenar el formulario con los datos de un usuario para editar
    async function populateUserForm(userId) {
        showUserForm();
        try {
            const response = await fetch(`http://127.0.0.1:5000/usuarios/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                }
            });
            if (!response.ok) {
                throw new Error('Error al obtener los datos del usuario');
            }
            const user = await response.json();
            document.getElementById('nombre').value = user.nombre;
            document.getElementById('apellidos').value = user.apellidos;
            document.getElementById('email').value = user.email;
            document.getElementById('rol').value = user.rol;
            editingUserId = userId; // Establecer el ID del usuario que se está editando
        } catch (error) {
            console.error('Error:', error);
            alert('Error al obtener los datos del usuario. Consulta la consola.');
        }
    }

    // Función para crear o actualizar un usuario
    async function saveUser(event) {
        event.preventDefault();

        const nombre = document.getElementById('nombre').value;
        const apellidos = document.getElementById('apellidos').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value; // Puede estar vacío
        const rol = document.getElementById('rol').value;

        const userData = { nombre, apellidos, email, rol };
        if (password) {
            userData.password = password;
        }

        try {
            const method = editingUserId ? 'PUT' : 'POST';
            const url = editingUserId ? `http://127.0.0.1:5000/usuarios/${editingUserId}` : 'http://127.0.0.1:5000/usuarios';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                },
                body: JSON.stringify(userData),
            });

            if (!response.ok) {
                throw new Error(editingUserId ? 'Error al actualizar el usuario' : 'Error al crear el usuario');
            }

            const result = await response.json();
            alert(result.message);
            fetchUsers(); // Recargar la lista de usuarios
            hideUserForm(); // Ocultar el formulario
        } catch (error) {
            console.error('Error:', error);
            alert(editingUserId ? 'Error al actualizar el usuario. Consulta la consola.' : 'Error al crear el usuario. Consulta la consola.');
        }
    }

    // Función para eliminar un usuario
    async function deleteUser(userId) {
        if (confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
            try {
                const response = await fetch(`http://127.0.0.1:5000/usuarios/${userId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + btoa(`${localStorage.getItem('userEmail')}:${localStorage.getItem('userPassword')}`)
                    }
                });
                if (!response.ok) {
                    throw new Error('Error al eliminar el usuario');
                }
                const result = await response.json();
                alert(result.message);
                fetchUsers(); // Recargar la lista de usuarios
            } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar el usuario. Consulta la consola.');
            }
        }
    }

    // Event listeners
    createUserBtn.addEventListener('click', () => {
        showUserForm();
    });

    cancelBtn.addEventListener('click', () => {
        hideUserForm();
    });

    userForm.addEventListener('submit', saveUser);

    // Obtener la lista de usuarios al cargar la página
    fetchUsers();

    // Guardar email y password en localStorage para autenticación (solo para desarrollo, ¡no en producción!)
    localStorage.setItem('userEmail', 'admin@example.com'); // Cambiar por el email real
    localStorage.setItem('userPassword', 'admin_password'); // Cambiar por la contraseña real
});