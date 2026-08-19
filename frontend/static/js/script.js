const API_BASE =
    window.API_BASE ||
    (window.location && window.location.origin ? window.location.origin : 'http://127.0.0.1:5000');
window.API_BASE = API_BASE;

if (window.CSRF?.ensureToken) {
    window.CSRF.ensureToken().catch((err) =>
        console.warn('No se pudo renovar CSRF al cargar la página:', err)
    );
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
                if (window.CSRF?.ensureToken) {
                    try {
                        await window.CSRF.ensureToken(true);
                    } catch (err) {
                        console.error('Error renovando CSRF token:', err);
                    }
                }

                if (Number(result.force_password_change || 0) === 1) {
                    alert('Debes cambiar la contraseña temporal antes de continuar.');
                    window.location.href = 'cambiar_password.html';
                    return;
                }

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

async function handleLogout() {
    const loginUrl = `${window.location.origin}/static/login.html`;
    try {
        let token = null;
        if (window.CSRF?.ensureToken) {
            token = await window.CSRF.ensureToken(true);
        } else {
            token = localStorage.getItem('csrfToken');
        }

        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                ...(token ? { 'X-CSRF-Token': token } : {})
            }
        });
    } catch (err) {
        console.error('Error durante el logout:', err);
    } finally {
        ['userId', 'userRol', 'userEmail', 'userPassword', 'csrfToken'].forEach(key => localStorage.removeItem(key));
        window.location.href = loginUrl;
    }
}

function attachLogoutHandler() {
    const logoutButton = document.getElementById('btn-logout');
    if (!logoutButton) return;

    logoutButton.addEventListener('click', (event) => {
        event.preventDefault();
        handleLogout();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLogoutHandler);
} else {
    attachLogoutHandler();
}
