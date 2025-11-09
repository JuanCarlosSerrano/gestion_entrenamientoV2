document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const atletaId = urlParams.get("id");
  
    const nombreHeader = document.getElementById("nombre-atleta");
    const fotoPerfil = document.getElementById("foto-atleta");
    const zonasContainer = document.getElementById("zonas-result");
    const btnGuardarZonas = document.getElementById("guardar-zonas");
    const tablaZonas = document.getElementById("tabla-zonas");
  
    // Cargar datos del atleta
    try {
      const res = await fetch(`http://127.0.0.1:5000/perfil_atleta/${atletaId}`, {
        headers: {
          Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`),
        },
      });
      const atleta = await res.json();
  
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
  
    // Cargar zonas guardadas
    try {
      const resZonas = await fetch(`http://127.0.0.1:5000/zonas_atleta/${atletaId}`, {
        headers: {
          Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`),
        }
      });
  
      if (resZonas.ok) {
        const zonas = await resZonas.json();
        zonasContainer.classList.remove("d-none");
        tablaZonas.innerHTML = "";
  
        const zonasDef = [
          "Zona 1 - Recuperación",
          "Zona 2 - Fondo suave",
          "Zona 3 - Fondo medio",
          "Zona 4 - Umbral",
          "Zona 5 - VAM",
          "Zona 6 - VO2max"
        ];
  
        zonasDef.forEach((zona, i) => {
          const valor = zonas[`z${i + 1}`];
          if (valor) {
            const fila = document.createElement("tr");
            fila.innerHTML = `<td>${zona}</td><td>${valor.toFixed(2)}</td>`;
            tablaZonas.appendChild(fila);
          }
        });
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
        const res = await fetch("http://127.0.0.1:5000/guardar_zonas", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`)
          },
          body: JSON.stringify(zonasPayload)
        });
  
        const data = await res.json();
        if (res.ok) {
          alert("Zonas guardadas correctamente");
        } else {
          alert(data.error || "Error al guardar zonas");
        }
      } catch (err) {
        console.error("Error al guardar zonas:", err);
        alert("No se pudo guardar zonas");
      }
    });
  });
  