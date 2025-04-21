const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        console.log('1. Datos del formulario (login):', data);

        try {
            const response = await fetch('http://127.0.0.1:5000/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            console.log('2. Respuesta del servidor (login):', response);

            if (!response.ok) {
                console.error('3. Error en la respuesta del servidor (login):', response.status, response.statusText);
                throw new Error(`Error en el inicio de sesión. Código de estado: ${response.status}`);
            }

            const result = await response.json();

            console.log('4. Resultado JSON (login):', result);

            if (result && result.message === 'Inicio de sesión exitoso') {
                localStorage.setItem('userEmail', data.email);
                localStorage.setItem('userPassword', data.password);
                localStorage.setItem('userId', result.user_id);  // ✅ El único ID que usas ahora
                localStorage.setItem('userRol', result.rol);
            
                alert(result.message);
                
                // Redirige según el rol del usuario
                const userRol = result.rol; // Obtener el rol de la respuesta
                console.log('10. Rol del usuario (login):', userRol);

                if (userRol === 'admin') {
                    window.location.href = 'admin/index.html';
                } else if (userRol === 'entrenador') {
                    window.location.href = 'entrenador/index.html';
                } else if (userRol === 'atleta') {
                    window.location.href = 'atleta/index.html';
                } else {
                    // Rol desconocido (manejar el error)
                    alert('Rol de usuario desconocido. Redirigiendo a la página principal.');
                    window.location.href = 'index.html';
                }

            } else {
                console.error('11. Error en el resultado JSON (login):', result);
                alert(result.error);
            }
        } catch (error) {
            console.error('12. Error al iniciar sesión:', error);
            alert('Error al iniciar sesión. Inténtalo de nuevo.');
        }
    });
}