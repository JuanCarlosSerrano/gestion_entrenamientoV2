const API_BASE = window.API_BASE || window.location.origin;
const redirects = {
  admin: 'admin/index.html',
  entrenador: 'entrenador/index.html',
  atleta: 'atleta/index.html',
};

document.getElementById('passwordChangeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = document.getElementById('current_password').value;
  const newPassword = document.getElementById('new_password').value;
  const confirmPassword = document.getElementById('confirm_password').value;
  if (newPassword !== confirmPassword) {
    alert('La confirmación de contraseña no coincide.');
    return;
  }
  const csrf = await window.CSRF.ensureToken(true).catch(() => null);
  if (!csrf) {
    alert('No se pudo obtener token CSRF. Recarga la página.');
    return;
  }
  const response = await fetch(`${API_BASE}/usuarios/password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || 'No se pudo cambiar la contraseña.');
    return;
  }
  alert('Contraseña actualizada correctamente.');
  window.location.href = redirects[localStorage.getItem('userRol')] || 'login.html';
});
