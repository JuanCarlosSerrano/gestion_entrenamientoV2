document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const atletaId = urlParams.get("atletaId");
    const modoNuevo = urlParams.get("modo") === "nuevo";
  
    const nombreHeader = document.getElementById("nombre-atleta");
    const fotoPerfil = document.getElementById("foto-atleta");
    const zonasContainer = document.getElementById("zonas-result");
    const btnGuardarZonas = document.getElementById("guardar-zonas");
    const tablaZonas = document.getElementById("tabla-zonas");
  const cardPerfil = document.getElementById("card-perfil-existente");
  const cardAlta = document.getElementById("card-alta-atleta");
  const formAlta = document.getElementById("form-alta-atleta");
  const seccionZonas = document.getElementById("seccion-zonas");
  const formZonas = document.getElementById("form-zonas");

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
  
      document.getElementById("dato-nombre").textContent = atleta.nombre;
      document.getElementById("dato-apellidos").textContent = atleta.apellidos;
      document.getElementById("dato-email").textContent = atleta.email;
      document.getElementById("dato-telefono").textContent = atleta.telefono || "-";
      document.getElementById("dato-fecha_nacimiento").textContent = atleta.fecha_nacimiento || "-";
      document.getElementById("dato-categoria").textContent = atleta.categoria || "-";
      document.getElementById("dato-grupo").textContent = atleta.grupo || "-";
      document.getElementById("dato-subgrupo").textContent = atleta.subgrupo || "-";
    } catch (err) {
      console.error("Error al cargar perfil del atleta:", err);
    }
  
    const pintarZonas = (zonas) => {
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
          fila.innerHTML = `<td>${zona}</td><td>${Number(valor).toFixed(2)}</td>`;
          tablaZonas.appendChild(fila);
        }
      });
    };
  
    // Cargar zonas guardadas
    try {
      const resZonas = await fetch(`${window.API_BASE}/zonas_atleta/${atletaId}`, {
        credentials: "include",
      });

      if (!resZonas.ok) {
        console.warn("Zonas no disponibles:", await resZonas.text());
      } else {
        const zonas = await resZonas.json().catch(() => null);
        if (zonas) {
          zonasContainer.classList.remove("d-none");
          tablaZonas.innerHTML = "";

          pintarZonas(zonas);
        }
      }
    } catch (err) {
      console.error("Error al obtener zonas:", err);
    }
    // Calcular zonas desde formulario
    document.getElementById("form-zonas").addEventListener("submit", (e) => {
      e.preventDefault();
  
      const minutos = parseInt(document.getElementById("minutos").value);
      const segundos = parseInt(document.getElementById("segundos").value);
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
    });
  

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
        } else {
          alert(data?.error || "Error al guardar zonas");
        }
      } catch (err) {
        console.error("Error al guardar zonas:", err);
        alert("No se pudo guardar zonas");
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
