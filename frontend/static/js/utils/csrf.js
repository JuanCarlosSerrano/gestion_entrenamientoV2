(function (global) {
  const resolveOrigin = () => {
    if (!global.location || !global.location.origin || global.location.origin === 'null') {
      return null;
    }
    return global.location.origin.replace(/\/+$/, '');
  };

  const DEFAULT_API_BASE = resolveOrigin() || 'http://127.0.0.1:5000';

  if (!global.API_BASE) {
    global.API_BASE = DEFAULT_API_BASE;
  } else if (global.API_BASE.endsWith('/')) {
    global.API_BASE = global.API_BASE.replace(/\/+$/, '');
  }

  const API_BASE = global.API_BASE;

  function getStoredToken() {
    return localStorage.getItem('csrfToken');
  }

  async function ensureToken(force = false) {
    if (!force) {
      const existing = getStoredToken();
      if (existing) {
        return existing;
      }
    }

    const response = await fetch(`${API_BASE}/csrf-token`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('No se pudo obtener el token CSRF');
    }

    const data = await response.json();
    if (!data?.csrf_token) {
      throw new Error('Respuesta CSRF inválida');
    }

    localStorage.setItem('csrfToken', data.csrf_token);
    return data.csrf_token;
  }

  global.CSRF = {
    ensureToken: ensureToken,
    getToken: getStoredToken,
  };
})(window);
