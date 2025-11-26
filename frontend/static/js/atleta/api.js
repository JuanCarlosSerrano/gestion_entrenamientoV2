export const API =
  window.API_BASE ||
  (window.location && window.location.origin
    ? window.location.origin
    : "http://127.0.0.1:5000");

export const authHeader = () =>
  "Basic " +
  btoa(
    `${localStorage.getItem("userEmail") ?? ""}:${
      localStorage.getItem("userPassword") ?? ""
    }`
  );

export const getAtletaId = () => localStorage.getItem("userId");

export const defaultHeaders = () => ({
  Authorization: authHeader()
});

export const getCsrfToken = async () => {
  if (window.CSRF?.ensureToken) {
    try {
      return await window.CSRF.ensureToken();
    } catch (err) {
      console.warn("No se pudo renovar CSRF automáticamente:", err);
    }
  }
  return localStorage.getItem("csrfToken");
};

export const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      ...defaultHeaders(),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Error HTTP ${response.status}`);
  }
  return response.json();
};
