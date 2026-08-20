// Rellena el nombre/iniciales del admin en la barra lateral, igual que
// setupTrainerIdentity() hace en las páginas del entrenador. Se separa
// de admin.js porque index.html no necesita el resto de esa lógica
// (gestión de usuarios), solo esto.
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('sidebar-admin-name');
  const initialsEl = document.getElementById('sidebar-admin-initials');
  const welcomeEl = document.getElementById('admin-welcome-name');
  const storedName = localStorage.getItem('userName') || localStorage.getItem('userEmail') || 'Administrador';
  const displayName = storedName.includes('@') ? storedName.split('@')[0] : storedName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  if (nameEl) nameEl.textContent = displayName;
  if (initialsEl) initialsEl.textContent = initials || 'A';
  if (welcomeEl) welcomeEl.textContent = displayName;
});
