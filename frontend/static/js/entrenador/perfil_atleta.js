
const formatMetodoZonas = (metodo) => {
  if (!metodo) return "—";
  const m = String(metodo).toLowerCase();
  if (m === "vdot") return "VDOT";
  if (m === "vam") return "VAM";
  return m.toUpperCase();
};

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const atletaId = urlParams.get("atletaId");
    const modoNuevo = urlParams.get("modo") === "nuevo";
  
    const nombreHeader = document.getElementById("nombre-atleta");
    const fotoPerfil = document.getElementById("foto-atleta");
    const zonasContainer = document.getElementById("zonas-result");
    const btnGuardarZonas = document.getElementById("guardar-zonas");
    const btnEditarZonas = document.getElementById("btn-editar-zonas");
    const formZonasManual = document.getElementById("form-zonas-manual");
    const btnGuardarManual = document.getElementById("btn-guardar-manual");
    const btnCancelarManual = document.getElementById("btn-cancelar-manual");
    const zonaInputs = {
      z1: document.getElementById("input-z1"),
      z2: document.getElementById("input-z2"),
      z3: document.getElementById("input-z3"),
      z4: document.getElementById("input-z4"),
      z5: document.getElementById("input-z5"),
      z6: document.getElementById("input-z6"),
    };
    const tablaZonas = document.getElementById("tabla-zonas");
const tablaZonasFc = document.getElementById("tabla-zonas-fc");
const fcMaxInput = document.getElementById("fc-max");
  const cardPerfil = document.getElementById("card-perfil-existente");
  const cardAlta = document.getElementById("card-alta-atleta");
  const formAlta = document.getElementById("form-alta-atleta");
  const seccionZonas = document.getElementById("seccion-zonas");
  const formZonas = document.getElementById("form-zonas");
  const formDatos = document.getElementById("form-datos-atleta");
  const alertDatos = document.getElementById("alert-datos");

  const inputNombre = document.getElementById("input-nombre");
  const inputApellidos = document.getElementById("input-apellidos");
  const inputEmail = document.getElementById("input-email");
  const inputTelefono = document.getElementById("input-telefono");
  const inputFecha = document.getElementById("input-fecha");
  const inputCategoria = document.getElementById("input-categoria");
  const inputGrupo = document.getElementById("input-grupo");
  const inputSubgrupo = document.getElementById("input-subgrupo");

  const ensureCsrfToken = async () => {
    if (window.CSRF && typeof window.CSRF.ensureToken === "function") {
      return window.CSRF.ensureToken();
    }
    return localStorage.getItem("csrfToken");
  };

  if (modoNuevo) {
    if (cardPerfil) cardPerfil.classList.add("d-none");
    if (cardAlta) cardAlta.classList.remove("d-none");
    if (seccionZonas) seccionZonas.classList.add("d-none");
    if (zonasContainer) zonasContainer.classList.add("d-none");
    if (formZonas) formZonas.classList.add("d-none");
    nombreHeader.textContent = "Alta de atleta";
    inicializarFormularioAlta(formAlta);
    return;
  }
  
    if (!atletaId) {
      console.error("No se proporcionó atletaId en la URL");
      return;
    }
  
    // Cargar datos del atleta
    try {
      const res = await fetch(`${window.API_BASE}/perfil_atleta/${atletaId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        console.error("No se pudo cargar el atleta:", data?.error || res.statusText);
        return;
      }
      const atleta = data;
  
      nombreHeader.textContent = `${atleta.nombre} ${atleta.apellidos}`;
      if (atleta.foto_url) {
        fotoPerfil.src = atleta.foto_url;
      }

      if (inputNombre) inputNombre.value = atleta.nombre || "";
      if (inputApellidos) inputApellidos.value = atleta.apellidos || "";
      if (inputEmail) inputEmail.value = atleta.email || "";
      if (inputTelefono) inputTelefono.value = atleta.telefono || "";
      if (inputFecha) inputFecha.value = atleta.fecha_nacimiento || "";
      if (inputCategoria) inputCategoria.value = atleta.categoria || "";
      if (inputGrupo) inputGrupo.value = atleta.grupo || "";
      if (inputSubgrupo) inputSubgrupo.value = atleta.subgrupo || "";
    } catch (err) {
      console.error("Error al cargar perfil del atleta:", err);
    }
  
    const formatMMSS = (valor) => {
      const total = Number(valor);
      if (Number.isNaN(total)) return "-";
      const min = Math.floor(total);
      const seg = Math.round((total - min) * 60);
      return `${min}:${seg.toString().padStart(2, "0")}`;
    };

    const parseMMSS = (val) => {
      if (!val) return null;
      const s = String(val).replace(/[^0-9]/g, "");
      if (!s) return null;
      // si es 440 => 4:40, 345 => 3:45, 45 => 0:45
      const seg = s.slice(-2);
      const min = s.slice(0, -2) || "0";
      const total = parseFloat(min) + parseFloat(seg) / 60;
      return Number(total.toFixed(2));
    };

    const pintarZonasFc = (zonas) => {
      if (!tablaZonasFc) return;
      tablaZonasFc.innerHTML = "";
      if (!zonas) return;
      for (let i = 1; i <= 6; i += 1) {
        const key = `fc_z${i}`;
        if (zonas[key] == null) continue;
        const fila = document.createElement("tr");
        fila.innerHTML = `<td>Z${i}</td><td>${Math.round(Number(zonas[key]))} bpm</td>`;
        tablaZonasFc.appendChild(fila);
      }
    };

const pintarZonas = (zonas) => {
      const metodoEl = document.getElementById("zonas-metodo-actual");
      if (metodoEl) metodoEl.textContent = formatMetodoZonas(zonas?.metodo);
      const zonasDef = [
        "Zona 1 - Recuperación",
        "Zona 2 - Fondo suave",
        "Zona 3 - Fondo medio",
        "Zona 4 - Umbral",
        "Zona 5 - VAM",
        "Zona 6 - VO2max",
      ];

      tablaZonas.innerHTML = "";
      zonasDef.forEach((zona, i) => {
        const valor = zonas[`z${i + 1}`];
        if (valor) {
          const fila = document.createElement("tr");
          fila.innerHTML = `<td>${zona}</td><td>${formatMMSS(valor)}</td>`;
          tablaZonas.appendChild(fila);
        }
      });
    };

    const rellenarManual = (zonas) => {
      Object.entries(zonaInputs).forEach(([key, input]) => {
        if (input && zonas && zonas[key]) {
          input.value = formatMMSS(zonas[key]);
        } else if (input) {
          input.value = "";
        }
      });
    };


    const cargarHistorialZonas = async () => {
      const tbody = document.getElementById("tabla-zonas-historial");
      if (!tbody || !atletaId) return;
      try {
        const res = await fetch(`${window.API_BASE}/zonas_atleta/${atletaId}/historial`, {
          credentials: "include",
          headers: { ...(authHeader() ? { Authorization: authHeader() } : {}) }
        });
        if (!res.ok) throw new Error("No se pudo cargar historial");
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) {
          tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">Sin historial.</td></tr>';
          return;
        }
        const filas = data.map((item) => {
          const desde = item.fecha_inicio || "—";
          const hasta = item.fecha_fin || "Actual";
          const metodo = formatMetodoZonas(item.metodo);
          const z = [item.z1, item.z2, item.z3, item.z4, item.z5, item.z6].map((v) => (v ? formatMMSS(v) : "—"));
          return `
            <tr>
              <td>${desde}</td>
              <td>${hasta}</td>
              <td>${metodo}</td>
              <td>${z[0]}</td>
              <td>${z[1]}</td>
              <td>${z[2]}</td>
              <td>${z[3]}</td>
              <td>${z[4]}</td>
              <td>${z[5]}</td>
            </tr>`;
        }).join("");
        tbody.innerHTML = filas;
      } catch (err) {
        console.error("Error cargando historial zonas:", err);
        tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">No se pudo cargar el historial.</td></tr>';
      }
    };

    // Cargar zonas guardadas
    let zonasGuardadas = null;
    try {
      const resZonas = await fetch(`${window.API_BASE}/zonas_atleta/${atletaId}`, {
        credentials: "include",
      });

      if (!resZonas.ok) {
        console.warn("Zonas no disponibles:", await resZonas.text());
      } else {
        const zonas = await resZonas.json().catch(() => null);
        if (zonas) {
          zonasGuardadas = zonas;
          zonasContainer.classList.remove("d-none");
          tablaZonas.innerHTML = "";

          pintarZonas(zonas);
          pintarZonasFc(zonas);
          rellenarManual(zonas);
        }
      }
    } catch (err) {
      console.error("Error al obtener zonas:", err);
    }
    await cargarHistorialZonas();

    // Calcular zonas desde formulario
    document.getElementById("form-zonas").addEventListener("submit", (e) => {
      e.preventDefault();
  
      const minutos = parseInt(document.getElementById("minutos").value);
      const segundos = parseInt(document.getElementById("segundos").value);
      const fcMax = fcMaxInput ? parseInt(fcMaxInput.value, 10) : null;
      const totalMinutos = minutos + segundos / 60;
  
      if (isNaN(totalMinutos) || totalMinutos <= 0) {
        alert("Introduce un tiempo válido.");
        return;
      }
  
      const vam = 2000 / (totalMinutos * 60); // m/s
      const zonas = [
        { nombre: "Zona 1 - Recuperación", factor: 0.6 },
        { nombre: "Zona 2 - Fondo suave", factor: 0.7 },
        { nombre: "Zona 3 - Fondo medio", factor: 0.8 },
        { nombre: "Zona 4 - Umbral", factor: 0.9 },
        { nombre: "Zona 5 - VAM", factor: 1.0 },
        { nombre: "Zona 6 - VO2max", factor: 1.1 },
      ];
  
      tablaZonas.innerHTML = "";
  
      zonas.forEach((zona) => {
        const v = vam * zona.factor;
        const ritmo = 1000 / v / 60;
        const min = Math.floor(ritmo);
        const seg = Math.round((ritmo - min) * 60);
        const fila = document.createElement("tr");
        fila.innerHTML = `<td>${zona.nombre}</td><td>${min}:${seg.toString().padStart(2, "0")}</td>`;
        tablaZonas.appendChild(fila);
      });
  
      zonasContainer.classList.remove("d-none");
      btnGuardarZonas.disabled = false;
      btnGuardarZonas.dataset.vam = vam.toFixed(2);
      if (tablaZonasFc) {
        tablaZonasFc.innerHTML = "";
        if (Number.isFinite(fcMax) && fcMax > 0) {
          const fcFactors = [0.6, 0.7, 0.8, 0.9, 0.95, 1.0];
          fcFactors.forEach((factor, idx) => {
            const fcVal = Math.round(fcMax * factor);
            const fila = document.createElement("tr");
            fila.innerHTML = `<td>Z${idx + 1}</td><td>${fcVal} bpm</td>`;
            tablaZonasFc.appendChild(fila);
          });
        }
      }
      rellenarManual(null);
    });

    // Guardar datos personales
    if (formDatos) {
      formDatos.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (alertDatos) {
          alertDatos.classList.add("d-none");
          alertDatos.textContent = "";
        }

        const payload = {
          nombre: inputNombre?.value || "",
          apellidos: inputApellidos?.value || "",
          email: inputEmail?.value || "",
          telefono: inputTelefono?.value || "",
          fecha_nacimiento: inputFecha?.value || "",
          categoria: inputCategoria?.value || "",
          grupo: inputGrupo?.value || "",
          subgrupo: inputSubgrupo?.value || "",
        };

        try {
          const csrf = await ensureCsrfToken();
          const res = await fetch(`${window.API_BASE}/perfil_atleta/${atletaId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            },
            credentials: "include",
            body: JSON.stringify(payload),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data.error || "No se pudo actualizar el perfil";
            throw new Error(msg);
          }

          if (alertDatos) {
            alertDatos.className = "alert alert-success";
            alertDatos.textContent = "Datos personales actualizados";
            alertDatos.classList.remove("d-none");
          }
        } catch (err) {
          console.error("Error guardando datos del atleta", err);
          if (alertDatos) {
            alertDatos.className = "alert alert-danger";
            alertDatos.textContent = err.message || "No se pudo actualizar el perfil";
            alertDatos.classList.remove("d-none");
          } else {
            alert(err.message || "No se pudo actualizar el perfil");
          }
        }
      });
    }


    // Guardar zonas en la base de datos
    btnGuardarZonas.addEventListener("click", async () => {
      const vam = btnGuardarZonas.dataset.vam;
      if (!vam) return;

      const filas = tablaZonas.querySelectorAll("tr");
      const zonasPayload = {
        atleta_id: atletaId,
        vam: parseFloat(vam),
        z1: null, z2: null, z3: null, z4: null, z5: null, z6: null
      };
      if (fcMaxInput && fcMaxInput.value) {
        const fcMax = parseFloat(fcMaxInput.value);
        if (!Number.isNaN(fcMax)) {
          zonasPayload.fc_z1 = Math.round(fcMax * 0.60);
          zonasPayload.fc_z2 = Math.round(fcMax * 0.70);
          zonasPayload.fc_z3 = Math.round(fcMax * 0.80);
          zonasPayload.fc_z4 = Math.round(fcMax * 0.90);
          zonasPayload.fc_z5 = Math.round(fcMax * 0.95);
          zonasPayload.fc_z6 = Math.round(fcMax * 1.00);
        }
      }

      filas.forEach((fila, i) => {
        const ritmo = fila.children[1].textContent; // ej: "4:10"
        const [min, seg] = ritmo.split(":").map(Number);
        const ritmoDecimal = parseFloat((min + seg / 60).toFixed(2));
        zonasPayload[`z${i + 1}`] = ritmoDecimal;
      });
  
      try {
        const res = await fetch(`${window.API_BASE}/guardar_zonas`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": window.CSRF?.token || localStorage.getItem("csrfToken") || "",
          },
          body: JSON.stringify(zonasPayload),
        });

        const data = await res.json().catch(() => null);
        if (res.ok) {
          alert(data?.message || "Zonas guardadas correctamente");
          pintarZonas(zonasPayload);
          rellenarManual(zonasPayload, zonasPayload.vam);
        } else {
          alert(data?.error || "Error al guardar zonas");
        }
      } catch (err) {
        console.error("Error al guardar zonas:", err);
        alert("No se pudo guardar zonas");
      }
    });

    const toggleManual = (show) => {
      if (!formZonasManual) return;
      formZonasManual.classList.toggle("d-none", !show);
    };

    btnEditarZonas?.addEventListener("click", () => {
      toggleManual(true);
      rellenarManual(zonasGuardadas);
    });

    btnCancelarManual?.addEventListener("click", () => {
      toggleManual(false);
    });

    btnGuardarManual?.addEventListener("click", async () => {
      const payload = {
        atleta_id: atletaId,
        vam: parseFloat(inputVam?.value || "0"),
        z1: parseMMSS(zonaInputs.z1?.value),
        z2: parseMMSS(zonaInputs.z2?.value),
        z3: parseMMSS(zonaInputs.z3?.value),
        z4: parseMMSS(zonaInputs.z4?.value),
        z5: parseMMSS(zonaInputs.z5?.value),
        z6: parseMMSS(zonaInputs.z6?.value),
      };
      if (fcMaxInput && fcMaxInput.value) {
        const fcMax = parseFloat(fcMaxInput.value);
        if (!Number.isNaN(fcMax)) {
          payload.fc_z1 = Math.round(fcMax * 0.60);
          payload.fc_z2 = Math.round(fcMax * 0.70);
          payload.fc_z3 = Math.round(fcMax * 0.80);
          payload.fc_z4 = Math.round(fcMax * 0.90);
          payload.fc_z5 = Math.round(fcMax * 0.95);
          payload.fc_z6 = Math.round(fcMax * 1.00);
        }
      }

      if (!payload.vam || !payload.z1 || !payload.z2 || !payload.z3 || !payload.z4 || !payload.z5 || !payload.z6) {
        alert("Completa VAM y todas las zonas.");
        return;
      }

      let token = localStorage.getItem("csrfToken") || "";
      if (window.CSRF?.ensureToken) {
        try {
          token = await window.CSRF.ensureToken(true);
        } catch (err) {
          console.error("No se pudo obtener CSRF:", err);
        }
      }

      try {
        const res = await fetch(`${window.API_BASE}/guardar_zonas`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          alert(data?.error || "No se pudieron guardar las zonas");
          return;
        }
        alert(data?.message || "Zonas guardadas correctamente");
        zonasGuardadas = payload;
        pintarZonas(payload);
        toggleManual(false);
      } catch (err) {
        console.error("Error guardando zonas manuales:", err);
        alert("Error al guardar zonas manualmente");
      }
    });
  });

function inicializarFormularioAlta(form) {
  if (!form) return;
  form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nombre = document.getElementById("alta-nombre").value.trim();
      const apellidos = document.getElementById("alta-apellidos").value.trim();
      const email = document.getElementById("alta-email").value.trim();
      const telefono = document.getElementById("alta-telefono").value.trim();
      const fecha = document.getElementById("alta-fecha").value;
      const categoria = document.getElementById("alta-categoria").value;
      const grupo = document.getElementById("alta-grupo").value.trim();
      const subgrupo = document.getElementById("alta-subgrupo").value.trim();
      const password = document.getElementById("alta-password").value;
      const confirmPassword = document.getElementById("alta-password-confirm").value;

      if (!nombre || !apellidos || !email || !categoria || !password) {
        alert("Completa al menos nombre, apellidos, email, categoría y la contraseña.");
        return;
      }
      if (password !== confirmPassword) {
        alert("Las contraseñas no coinciden.");
        return;
      }

      const payload = {
        nombre,
        apellidos,
        email,
        password,
        telefono: telefono || null,
        fecha_nacimiento: fecha || null,
        categoria,
        grupo: grupo || null,
        subgrupo: subgrupo || null
      };

      let token = localStorage.getItem("csrfToken") || "";
      if (window.CSRF?.ensureToken) {
        try {
          token = await window.CSRF.ensureToken(true);
        } catch (err) {
          console.error("No se pudo obtener CSRF:", err);
        }
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(`${window.API_BASE}/entrenadores/atletas`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-CSRF-Token": token } : {})
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          alert(data?.error || "No se pudo crear el atleta");
          return;
        }
        const nuevoId = data?.id;
        alert(data?.message || "Atleta creado correctamente");
        if (nuevoId) {
          window.location.href = `perfil_atleta.html?atletaId=${nuevoId}`;
        } else {
          window.location.href = "atletas.html";
        }
      } catch (err) {
        console.error("Error al crear atleta:", err);
        alert("No se pudo crear el atleta");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
