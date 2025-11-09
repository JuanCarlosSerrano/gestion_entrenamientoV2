document.addEventListener("DOMContentLoaded", async function () {
    const tabla = document
        .getElementById("tabla-pendientes")
        .getElementsByTagName("tbody")[0];

    const API_BASE = window.API_BASE || "http://127.0.0.1:5000";
    window.API_BASE = API_BASE;

    function getAuthHeader() {
        const email = localStorage.getItem("userEmail") || "";
        const password = localStorage.getItem("userPassword") || "";
        return "Basic " + btoa(`${email}:${password}`);
    }

    async function ensureCsrfToken() {
        if (window.CSRF?.ensureToken) {
            return window.CSRF.ensureToken();
        }
        const token = localStorage.getItem("csrfToken");
        if (!token) {
            throw new Error("No hay token CSRF disponible");
        }
        return token;
    }

    // --------------------------------------------------
    // Cargar atletas pendientes
    // --------------------------------------------------
    try {
        const res = await fetch("/atletas_pendientes", {
            method: "GET",
            headers: {
                Authorization: getAuthHeader()
            },
            credentials: "include"
        });

        if (!res.ok) throw new Error("Error al cargar atletas pendientes");

        const atletas = await res.json();

        if (atletas.length === 0) {
            tabla.innerHTML = `<tr><td colspan="8">No hay atletas pendientes de aprobación</td></tr>`;
            return;
        }

        atletas.forEach(atleta => {
            const row = tabla.insertRow();
            row.innerHTML = `
                <td>${atleta.nombre}</td>
                <td>${atleta.apellidos}</td>
                <td>${atleta.email}</td>
                <td>${atleta.fecha_nacimiento || "-"}</td>
                <td>${atleta.telefono || "-"}</td>
                <td><input type="text" class="form-control form-control-sm grupo" placeholder="Grupo"></td>
                <td><input type="text" class="form-control form-control-sm subgrupo" placeholder="Subgrupo"></td>
                <td>
                    <button class="btn btn-sm btn-success aprobar" data-id="${atleta.id}">
                        Aprobar
                    </button>
                </td>
            `;
        });

        // --------------------------------------------------
        // Manejar click en "Aprobar"
        // --------------------------------------------------
        tabla.addEventListener("click", async (e) => {
            if (!e.target.classList.contains("aprobar")) return;

            const btn = e.target;
            const id = btn.dataset.id;
            const row = btn.closest("tr");
            const grupo = row.querySelector(".grupo").value.trim();
            const subgrupo = row.querySelector(".subgrupo").value.trim();

            try {
                const token = await ensureCsrfToken();

                const resAprobar = await fetch(`/atletas/aprobar/${id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": getAuthHeader(),
                        "X-CSRF-Token": token   // 👈 clave para pasar el before_request
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        grupo: grupo || "",
                        subgrupo: subgrupo || ""
                    })
                });

                const resultado = await resAprobar.json().catch(() => ({}));

                if (!resAprobar.ok) {
                    console.error("Error al aprobar atleta:", resAprobar.status, resultado);
                    throw new Error(resultado.error || "Error al aprobar atleta");
                }

                alert(resultado.message || "Atleta aprobado correctamente");
                row.remove();

                // Si se queda vacía la tabla, mostramos mensaje
                if (!tabla.hasChildNodes()) {
                    tabla.innerHTML = `<tr><td colspan="8">No hay atletas pendientes de aprobación</td></tr>`;
                }

            } catch (err) {
                console.error("Error al aprobar atleta:", err);
                alert(err.message || "Error al aprobar atleta. Consulta la consola.");
            }
        });

    } catch (err) {
        console.error("Error al cargar atletas:", err);
        tabla.innerHTML = `<tr><td colspan="8">Error al cargar atletas</td></tr>`;
    }
});
