const API_BASE = 'http://127.0.0.1:5000';

async function fetchCsrfToken() {
    try {
        const resp = await fetch(`${API_BASE}/csrf-token`, {
            method: 'GET',
            credentials: 'include', // usa la cookie de sesión recién creada
        });

        if (!resp.ok) {
            console.warn('No se pudo obtener CSRF token. Status:', resp.status);
            return null;
        }

        const data = await resp.json();
        if (data && data.csrf_token) {
            localStorage.setItem('csrfToken', data.csrf_token);
            return data.csrf_token;
        } else {
            console.warn('Respuesta CSRF sin token:', data);
            return null;
        }
    } catch (err) {
        console.error('Error al pedir CSRF token:', err);
        return null;
    }
}

const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        try {
            // 1️⃣ Login contra el backend usando sesión (cookie)
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                credentials: 'include', // 🔴 envía/recibe la cookie de sesión
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            // Si falla el login, mostramos el motivo
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const msg = err.error || `Error en el inicio de sesión (${response.status})`;
                alert(msg);
                return;
            }

            const result = await response.json();
            console.log('Login OK:', result);

            if (result && result.message === 'Inicio de sesión exitoso') {
                const userRol = result.rol;
                const userId = result.user_id;

                // 2️⃣ Guardar sólo lo necesario (nada de password)
                localStorage.setItem('userId', userId);
                localStorage.setItem('userRol', userRol);

                // 3️⃣ Pedir y guardar CSRF token (para futuros POST/PUT/DELETE)
                await fetchCsrfToken();

                alert(result.message);

                // 4️⃣ Redirigir según rol
                // Ojo: como login.html está en /static/, estas rutas son relativas a /static/
                if (userRol === 'admin') {
                    window.location.href = 'admin/index.html';        // /static/admin/index.html
                } else if (userRol === 'entrenador') {
                    window.location.href = 'entrenador/index.html';   // /static/entrenador/index.html
                } else if (userRol === 'atleta') {
                    window.location.href = 'atleta/index.html';       // /static/atleta/index.html
                } else {
                    alert('Rol desconocido. Redirigiendo al inicio.');
                    window.location.href = 'login.html';
                }

            } else {
                alert(result.error || 'Error desconocido en el inicio de sesión');
            }
        } catch (error) {
            console.error('Error al iniciar sesión:', error);
            alert('Error al iniciar sesión. Inténtalo de nuevo.');
        }
    });
}
