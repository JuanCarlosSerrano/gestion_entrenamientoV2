
const authHeader = () => {
  const email = localStorage.getItem("userEmail");
  const pass = localStorage.getItem("userPassword");
  if (!email || !pass) return null;
  return "Basic " + btoa(`${email}:${pass}`);
};

let zonasHelper = null;

const form = document.getElementById("form-calculadora-ritmo");
const preset = document.getElementById("distancia-preset");
const customWrapper = document.getElementById("distancia-custom-wrapper");
const customInput = document.getElementById("distancia-custom");
const customUnidad = document.getElementById("distancia-custom-unidad");
const horasInput = document.getElementById("tiempo-horas");
const minutosInput = document.getElementById("tiempo-minutos");
const segundosInput = document.getElementById("tiempo-segundos");
const resultados = document.getElementById("resultados-ritmo");
const ritmoPromedio = document.getElementById("ritmo-promedio");
const velocidadMedia = document.getElementById("velocidad-media");
const tiempoTotal = document.getElementById("tiempo-total");
const distanciaDescripcion = document.getElementById("distancia-descripcion");
const parcialesWrapper = document.getElementById("parciales-wrapper");
const tablaParciales = document.getElementById("tabla-parciales");
const btnReset = document.getElementById("btn-reset-calculadora");
const btnCopy = document.getElementById("btn-copy-parciales");

const toggleCustomDistance = () => {
  if (!preset || !customWrapper) return;
  customWrapper.style.display = preset.value === "custom" ? "block" : "none";
};

const obtenerDistancia = () => {
  if (preset.value !== "custom") {
    return Number(preset.value);
  }
  const valor = Number(customInput.value || "0");
  if (!valor || valor <= 0) return null;
  return customUnidad.value === "m" ? valor / 1000 : valor;
};

const formatearTiempo = (segundos) => {
  const min = Math.floor(segundos / 60);
  const seg = Math.round(segundos % 60);
  return `${min}:${String(seg).padStart(2, "0")}`;
};

const calcularParciales = (distanciaKm, ritmoSegundos) => {
  const parciales = [];
  const enteros = Math.floor(distanciaKm);
  for (let km = 1; km <= enteros; km += 1) {
    parciales.push({ punto: `${km} km`, tiempo: formatearTiempo(ritmoSegundos * km) });
  }
  if (distanciaKm > enteros) {
    parciales.push({
      punto: `${distanciaKm.toFixed(2)} km`,
      tiempo: formatearTiempo(ritmoSegundos * distanciaKm)
    });
  }
  return parciales;
};

const limpiarResultados = () => {
  resultados.style.display = "none";
  parcialesWrapper.style.display = "none";
  tablaParciales.innerHTML =
    '<tr><td colspan="2" class="text-muted text-center">Calcula un ritmo para ver los parciales.</td></tr>';
};

const manejarSubmit = (event) => {
  event.preventDefault();
  const distanciaKm = obtenerDistancia();
  const horas = Number(horasInput.value || "0");
  const minutos = Number(minutosInput.value || "0");
  const segundos = Number(segundosInput.value || "0");
  const totalSegundos = horas * 3600 + minutos * 60 + segundos;

  if (!distanciaKm || distanciaKm <= 0) {
    alert("Introduce una distancia válida.");
    return;
  }
  if (!totalSegundos) {
    alert("Introduce un tiempo objetivo.");
    return;
  }

  const ritmoSegundos = totalSegundos / distanciaKm;
  const velocidad = distanciaKm / (totalSegundos / 3600);

  ritmoPromedio.textContent = `${formatearTiempo(ritmoSegundos)} min/km`;
  velocidadMedia.textContent = `${velocidad.toFixed(2)} km/h`;
  tiempoTotal.textContent = formatearTiempo(totalSegundos);
  distanciaDescripcion.textContent = `${distanciaKm.toFixed(2)} km`;
  resultados.style.display = "flex";

  const parciales = calcularParciales(distanciaKm, ritmoSegundos);
  tablaParciales.innerHTML = parciales
    .map(
      (p) => `
      <tr>
        <td>${p.punto}</td>
        <td>${p.tiempo}</td>
      </tr>
    `
    )
    .join("");
  parcialesWrapper.style.display = "block";
};

const copiarParciales = () => {
  const texto = Array.from(tablaParciales.querySelectorAll("tr"))
    .map((fila) => Array.from(fila.children).map((celda) => celda.innerText).join("\t"))
    .join("\n");
  navigator.clipboard.writeText(texto).catch(() => {});
};

document.addEventListener("DOMContentLoaded", () => {
  if (!form) return;
  initVdot();
  zonasHelper = initZonasUtilidades();
  toggleCustomDistance();
  preset?.addEventListener("change", toggleCustomDistance);
  form.addEventListener("submit", manejarSubmit);
  btnReset?.addEventListener("click", () => {
    preset.value = "10";
    toggleCustomDistance();
    customInput.value = "";
    horasInput.value = "0";
    minutosInput.value = "45";
    segundosInput.value = "0";
    limpiarResultados();
  });
  btnCopy?.addEventListener("click", copiarParciales);
});


const KM_PER_MI = 1.60934;

const formatPace = (segundosPorKm) => formatearTiempo(segundosPorKm);

const formatPaceMi = (segundosPorKm) => {
  if (!Number.isFinite(segundosPorKm)) return "—";
  return formatearTiempo(segundosPorKm * KM_PER_MI);
};


const vdotZones = [
  { key: "E", nombre: "Suave", min: 0.65, max: 0.78, desc: "Rodaje suave / recuperación" },
  { key: "M", nombre: "Maratón", min: 0.80, max: 0.84, desc: "Ritmo maratón" },
  { key: "T", nombre: "Umbral", min: 0.88, max: 0.92, desc: "Umbral / tempo" },
  { key: "I", nombre: "Intervalos", min: 0.95, max: 1.00, desc: "Intervalos VO2" },
  { key: "R", nombre: "Repeticiones", min: 1.05, max: 1.15, desc: "Repeticiones" }
];

const vdotSeriesConfig = {
  largas: [
    { key: "T", nombre: "Umbral", min: 0.88, max: 0.92 },
    { key: "I", nombre: "Intervalos", min: 0.95, max: 1.00 },
    { key: "R", nombre: "Repeticiones", min: 1.05, max: 1.15 }
  ],
  cortas: [
    { key: "I", nombre: "Intervalos", min: 0.95, max: 1.00 },
    { key: "R", nombre: "Repeticiones", min: 1.05, max: 1.15 },
    { key: "FR", nombre: "Fast Reps", min: 1.18, max: 1.30 }
  ]
};

const vdotSpeedFromVo2 = (vo2) => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - vo2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const v = (-b + Math.sqrt(disc)) / (2 * a);
  return v > 0 ? v : null;
};

const vdotPaceFromFraction = (vdot, fraction) => {
  if (!vdot || !fraction) return null;
  const vo2 = vdot * fraction;
  const speed = vdotSpeedFromVo2(vo2);
  if (!speed) return null;
  const minPerKm = 1000 / speed;
  return minPerKm * 60;
};

const calcularVdot = (distanciaKm, totalSegundos) => {
  if (!distanciaKm || !totalSegundos) return null;
  const distanciaM = distanciaKm * 1000;
  const tiempoMin = totalSegundos / 60;
  const velocidad = distanciaM / tiempoMin;
  const vo2 = -4.60 + 0.182258 * velocidad + 0.000104 * velocidad * velocidad;
  const frac = 0.8 + 0.1894393 * Math.exp(-0.012778 * tiempoMin) + 0.2989558 * Math.exp(-0.1932605 * tiempoMin);
  if (!frac) return null;
  return vo2 / frac;
};

const formatPaceRange = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `${formatearTiempo(min)}–${formatearTiempo(max)}`;
};

const formatPaceRangeMi = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const min = Math.min(a, b) * KM_PER_MI;
  const max = Math.max(a, b) * KM_PER_MI;
  return `${formatearTiempo(min)}–${formatearTiempo(max)}`;
};



const vdotEquivalencias = [
  { key: "200", label: "200 m", km: 0.2 },
  { key: "400", label: "400 m", km: 0.4 },
  { key: "600", label: "600 m", km: 0.6 },
  { key: "800", label: "800 m", km: 0.8 },
  { key: "1500", label: "1500 m", km: 1.5 },
  { key: "3000", label: "3000 m", km: 3 },
  { key: "5k", label: "5 km", km: 5 },
  { key: "10k", label: "10 km", km: 10 },
  { key: "21k", label: "Media maratón (21,097 km)", km: 21.097 },
  { key: "42k", label: "Maratón (42,195 km)", km: 42.195 }
];

const vdotTiempoDesdeDistancia = (vdot, distanciaKm) => {
  if (!vdot || !distanciaKm) return null;
  const distM = distanciaKm * 1000;
  let low = 2;
  let high = 400;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const v = distM / mid;
    const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
    const frac = 0.8 + 0.1894393 * Math.exp(-0.012778 * mid) + 0.2989558 * Math.exp(-0.1932605 * mid);
    const vdotCalc = vo2 / frac;
    if (vdotCalc > vdot) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high * 60;
};


const formatFechaISO = (valor) => {
  if (!valor) return "—";
  try {
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return valor;
    return d.toLocaleDateString("es-ES");
  } catch (err) {
    return valor;
  }
};

const renderHistorialVdot = (tbody, items) => {
  if (!tbody) return;
  if (!Array.isArray(items) || !items.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Sin historial.</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map((item) => {
      const distKm = item.vdot_distancia_m ? (Number(item.vdot_distancia_m) / 1000).toFixed(2) + " km" : "—";
      const tiempo = item.vdot_tiempo_seg ? formatearTiempo(item.vdot_tiempo_seg) : "—";
      const fecha = item.vdot_fecha || item.created_at || "";
      return `
        <tr>
          <td>${formatFechaISO(fecha)}</td>
          <td>${distKm}</td>
          <td>${tiempo}</td>
          <td>${Number(item.vdot_val).toFixed(1)}</td>
        </tr>`;
    })
    .join("");
};

const cargarHistorialVdot = async (atletaId) => {
  const tbody = document.getElementById("vdot-tabla-historial");
  if (!tbody || !atletaId) return;
  try {
    const res = await fetch(`${window.API_BASE}/atletas/${atletaId}/vdot/historial`, {
      credentials: "include",
      headers: { ...(authHeader() ? { Authorization: authHeader() } : {}) }
    });
    if (!res.ok) throw new Error("No se pudo cargar historial");
    const data = await res.json();
    renderHistorialVdot(tbody, data);
  } catch (err) {
    renderHistorialVdot(tbody, []);
  }
};
const initVdot = () => {
  const formVdot = document.getElementById("form-vdot");
  if (!formVdot) return;
  const distanciaSelect = document.getElementById("vdot-distancia");
  const customWrapperVdot = document.getElementById("vdot-distancia-custom-wrapper");
  const customInputVdot = document.getElementById("vdot-distancia-custom");
  const horasVdot = document.getElementById("vdot-horas");
  const minutosVdot = document.getElementById("vdot-minutos");
  const segundosVdot = document.getElementById("vdot-segundos");
  const resultadosVdot = document.getElementById("vdot-resultados");
  const vdotValor = document.getElementById("vdot-valor");
  const vdotFecha = document.getElementById("vdot-fecha");
  const tablaRitmos = document.getElementById("vdot-tabla-training-ritmos");
  const btnResetVdot = document.getElementById("vdot-reset");
  const btnGuardarVdot = document.getElementById("vdot-guardar");
  const atletaSelectVdot = document.getElementById("vdot-atleta");


  let lastPayload = null;

  const cargarAtletasVdot = async () => {
    if (!atletaSelectVdot) return;
    try {
      const res = await fetch(`${window.API_BASE}/estadisticas/entrenador/atletas`, {
        credentials: "include",
        headers: { ...(authHeader() ? { Authorization: authHeader() } : {}) }
      });
      if (!res.ok) throw new Error("No se pudieron cargar atletas");
      const data = await res.json();
      atletaSelectVdot.innerHTML = '<option value="">Selecciona un atleta</option>';
      data.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = `${a.nombre} ${a.apellidos || ""}`.trim();
        atletaSelectVdot.appendChild(opt);
      });
    } catch (err) {
      console.warn("Error cargando atletas VDOT:", err);
    }
  };

  const cargarVdotGuardado = async (atletaId) => {
    if (!atletaId || !vdotFecha) return;
    try {
      const res = await fetch(`${window.API_BASE}/atletas/${atletaId}/vdot`, {
        credentials: "include",
        headers: { ...(authHeader() ? { Authorization: authHeader() } : {}) }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.vdot_val && vdotFecha) {
        vdotFecha.textContent = data.vdot_fecha ? `Guardado: ${data.vdot_fecha}` : "Guardado";
      }
    } catch (err) {
      console.warn("No se pudo cargar VDOT guardado", err);
    }
  };

  const toggleCustomVdot = () => {
    if (!customWrapperVdot || !distanciaSelect) return;
    customWrapperVdot.style.display = distanciaSelect.value === "custom" ? "block" : "none";
  };

  const obtenerDistanciaVdot = () => {
    if (!distanciaSelect) return null;
    if (distanciaSelect.value !== "custom") return Number(distanciaSelect.value);
    const val = Number(customInputVdot?.value || 0);
    return Number.isFinite(val) && val > 0 ? val : null;
  };

  formVdot.addEventListener("submit", (event) => {
    event.preventDefault();
    const distanciaKm = obtenerDistanciaVdot();
    const horas = Number(horasVdot?.value || 0);
    const minutos = Number(minutosVdot?.value || 0);
    const segundos = Number(segundosVdot?.value || 0);
    const totalSeg = horas * 3600 + minutos * 60 + segundos;

    if (!distanciaKm || distanciaKm <= 0) {
      alert("Introduce una distancia válida.");
      return;
    }
    if (!totalSeg) {
      alert("Introduce un tiempo válido.");
      return;
    }

    const vdot = calcularVdot(distanciaKm, totalSeg);
    if (!vdot) {
      alert("No se pudo calcular el VDOT.");
      return;
    }

    vdotValor.textContent = vdot.toFixed(1);
    vdotFecha.textContent = `Calculado: ${new Date().toLocaleDateString("es-ES")}`;

    if (zonasHelper && zonasHelper.prepararZonasDesdeVdot) {
      zonasHelper.prepararZonasDesdeVdot();
    }


    const tablaRitmos = document.getElementById("vdot-tabla-training-ritmos");
    if (tablaRitmos) {
      const filasRitmos = vdotZones
        .map((z) => {
          const paceMin = vdotPaceFromFraction(vdot, z.min);
          const paceMax = vdotPaceFromFraction(vdot, z.max);
          return `
            <tr>
              <td>${z.key} · ${z.nombre}</td>
              <td>${formatPaceRange(paceMin, paceMax)}</td>
              <td>${formatPaceRangeMi(paceMin, paceMax)}</td>
            </tr>`;
        })
        .join("");
      tablaRitmos.innerHTML = filasRitmos || '<tr><td colspan="3" class="text-muted text-center">Sin datos.</td></tr>';
    }

    const tablaRace = document.getElementById("vdot-tabla-race");
    if (tablaRace) {
      const raceList = vdotEquivalencias.filter((d) => d.km >= 1.5);
      const filasRace = raceList
        .map((d) => {
          const tiempoSeg = vdotTiempoDesdeDistancia(vdot, d.km);
          const paceKm = tiempoSeg ? tiempoSeg / d.km : null;
          const paceMi = paceKm ? paceKm * KM_PER_MI : null;
          return `
            <tr>
              <td>${d.label}</td>
              <td>${tiempoSeg ? formatearTiempo(tiempoSeg) : '—'}</td>
              <td>${paceKm ? formatPace(paceKm) : '—'}</td>
              <td>${paceMi ? formatPace(paceMi) : '—'}</td>
            </tr>`;
        })
        .join("");
      tablaRace.innerHTML = filasRace || '<tr><td colspan="4" class="text-muted text-center">Sin datos.</td></tr>';
    }

    const obtenerPaceMedio = (zona) => vdotPaceFromFraction(vdot, (zona.min + zona.max) / 2);
    const tiempoSerie = (paceSegKm, distKm) => (paceSegKm ? formatearTiempo(paceSegKm * distKm) : '—');

    const tabla1200 = document.getElementById("vdot-tabla-training-1200");
    if (tabla1200) {
      const filas1200 = vdotSeriesConfig.largas
        .map((z) => {
          const pace = obtenerPaceMedio(z);
          return `
            <tr>
              <td>${z.nombre}</td>
              <td>${tiempoSerie(pace, 1.2)}</td>
              <td>${tiempoSerie(pace, 0.8)}</td>
              <td>${tiempoSerie(pace, 0.6)}</td>
            </tr>`;
        })
        .join("");
      tabla1200.innerHTML = filas1200 || '<tr><td colspan="4" class="text-muted text-center">Sin datos.</td></tr>';
    }

    const tabla400 = document.getElementById("vdot-tabla-training-400");
    if (tabla400) {
      const filas400 = vdotSeriesConfig.cortas
        .map((z) => {
          const pace = obtenerPaceMedio(z);
          return `
            <tr>
              <td>${z.nombre}</td>
              <td>${tiempoSerie(pace, 0.4)}</td>
              <td>${tiempoSerie(pace, 0.3)}</td>
              <td>${tiempoSerie(pace, 0.2)}</td>
            </tr>`;
        })
        .join("");
      tabla400.innerHTML = filas400 || '<tr><td colspan="4" class="text-muted text-center">Sin datos.</td></tr>';
    }

    const tablaEq = document.getElementById("vdot-tabla-equivalencias");
    if (tablaEq) {
      const eqList = vdotEquivalencias.filter((d) => d.km > 0.8);
      const filasEq = eqList
        .map((d) => {
          const tiempoSeg = vdotTiempoDesdeDistancia(vdot, d.km);
          const pace = tiempoSeg ? tiempoSeg / d.km : null;
          return `
            <tr>
              <td>${d.label}</td>
              <td>${tiempoSeg ? formatearTiempo(tiempoSeg) : '—'}</td>
              <td>${pace ? formatearTiempo(pace) : '—'}</td>
            </tr>`;
        })
        .join("");
      tablaEq.innerHTML = filasEq || '<tr><td colspan="3" class="text-muted text-center">Sin datos.</td></tr>';
    }

    resultadosVdot.style.display = "block";

    lastPayload = {
      vdot_val: Number(vdot.toFixed(1)),
      vdot_distancia_m: distanciaKm * 1000,
      vdot_tiempo_seg: totalSeg,
      vdot_fecha: new Date().toISOString().slice(0, 10)
    };
  });

  btnResetVdot?.addEventListener("click", () => {
    if (distanciaSelect) distanciaSelect.value = "10";
    if (customInputVdot) customInputVdot.value = "";
    if (horasVdot) horasVdot.value = "0";
    if (minutosVdot) minutosVdot.value = "40";
    if (segundosVdot) segundosVdot.value = "0";
    if (tablaRitmos) {
      tablaRitmos.innerHTML = '<tr><td colspan="3" class="text-muted text-center">Calcula un VDOT para ver los ritmos.</td></tr>';
    }
    const tablaRace = document.getElementById("vdot-tabla-race");
    if (tablaRace) {
      tablaRace.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Calcula un VDOT para ver los tiempos.</td></tr>';
    }
    const tabla1200 = document.getElementById("vdot-tabla-training-1200");
    if (tabla1200) {
      tabla1200.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Calcula un VDOT para ver las series.</td></tr>';
    }
    const tabla400 = document.getElementById("vdot-tabla-training-400");
    if (tabla400) {
      tabla400.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Calcula un VDOT para ver las series.</td></tr>';
    }
    const tablaEq = document.getElementById("vdot-tabla-equivalencias");
    if (tablaEq) {
      tablaEq.innerHTML = '<tr><td colspan="3" class="text-muted text-center">Calcula un VDOT para ver equivalencias.</td></tr>';
    }
    if (resultadosVdot) resultadosVdot.style.display = "none";
    lastPayload = null;
    toggleCustomVdot();
  });

  btnGuardarVdot?.addEventListener("click", async () => {
    if (!lastPayload) return;
    const atletaId = atletaSelectVdot?.value;
    if (!atletaId) {
      alert("Selecciona un atleta.");
      return;
    }
    try {
      const csrf = window.CSRF && window.CSRF.ensureToken ? await window.CSRF.ensureToken() : null;
      const res = await fetch(`${window.API_BASE}/atletas/${atletaId}/vdot`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader() ? { Authorization: authHeader() } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {})
        },
        body: JSON.stringify(lastPayload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      cargarHistorialVdot(atletaId);
      alert("VDOT guardado en el perfil del atleta.");
    } catch (err) {
      alert(err.message || "No se pudo guardar el VDOT");
    }
  });

  atletaSelectVdot?.addEventListener("change", () => {
    if (atletaSelectVdot.value) {
      cargarVdotGuardado(atletaSelectVdot.value);
      cargarHistorialVdot(atletaSelectVdot.value);
      if (btnGuardarVdot) btnGuardarVdot.disabled = !lastPayload;
    }
  });

  cargarAtletasVdot();
  toggleCustomVdot();
};


const initZonasUtilidades = () => {
  const atletaSelect = document.getElementById("zonas-atleta");
  const fcMaxInput = document.getElementById("zonas-fc-max");
  const btnGuardar = document.getElementById("zonas-guardar");
  const tabla = document.getElementById("zonas-tabla");

  let lastPayload = null;

  const cargarAtletas = async () => {
    if (!atletaSelect) return;
    try {
      const res = await fetch(`${window.API_BASE}/estadisticas/entrenador/atletas`, {
        credentials: "include",
        headers: { ...(authHeader() ? { Authorization: authHeader() } : {}) }
      });
      if (!res.ok) throw new Error("No se pudieron cargar atletas");
      const data = await res.json();
      atletaSelect.innerHTML = '<option value="">Selecciona un atleta</option>';
      data.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = `${a.nombre} ${a.apellidos || ""}`.trim();
        atletaSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn("Error cargando atletas zonas:", err);
    }
  };

  const calcularFcZonas = (fcMax) => {
    if (!fcMax) return {};
    return {
      fc_z1: Math.round(fcMax * 0.60),
      fc_z2: Math.round(fcMax * 0.70),
      fc_z3: Math.round(fcMax * 0.80),
      fc_z4: Math.round(fcMax * 0.90),
      fc_z5: Math.round(fcMax * 0.95),
      fc_z6: Math.round(fcMax * 1.00)
    };
  };

  const renderZonas = (zonas, fcZonas) => {
    if (!tabla) return;
    const filas = zonas.map((val, i) => {
      const fc = fcZonas[`fc_z${i + 1}`] || "—";
      const ritmo = val ? formatPace(val * 60) : "—";
      return `<tr><td>Z${i + 1}</td><td>${ritmo}</td><td>${fc}</td></tr>`;
    }).join("");
    tabla.innerHTML = filas || '<tr><td colspan="3" class="text-muted text-center">Sin datos.</td></tr>';
  };

  const prepararZonasDesdeVdot = () => {
    const vdotVal = Number(document.getElementById("vdot-valor")?.textContent || 0);
    if (!vdotVal) {
      lastPayload = null;
      if (tabla) {
        tabla.innerHTML = '<tr><td colspan="3" class="text-muted text-center">Calcula un VDOT para ver las zonas.</td></tr>';
      }
      if (btnGuardar) btnGuardar.disabled = true;
      return;
    }
    const fcMax = Number(fcMaxInput?.value || 0) || null;
    const fracs = [0.65, 0.72, 0.80, 0.90, 0.975, 1.10];
    const zonas = fracs.map((f) => {
      const paceSec = vdotPaceFromFraction(vdotVal, f);
      return paceSec ? Number((paceSec / 60).toFixed(2)) : null;
    });
    if (zonas.some((z) => !z)) return;
    const paceSecVam = vdotPaceFromFraction(vdotVal, 1.0);
    const vam = paceSecVam ? (1000 / paceSecVam) : null;
    if (!vam) return;
    const fcZonas = calcularFcZonas(fcMax);
    renderZonas(zonas, fcZonas);
    lastPayload = {
      atleta_id: atletaSelect?.value ? Number(atletaSelect.value) : null,
      vam,
      z1: zonas[0], z2: zonas[1], z3: zonas[2], z4: zonas[3], z5: zonas[4], z6: zonas[5],
      metodo: "vdot",
      ...fcZonas
    };
    if (btnGuardar) btnGuardar.disabled = !lastPayload.atleta_id;
  };

  atletaSelect?.addEventListener("change", () => {
    if (btnGuardar) btnGuardar.disabled = !(lastPayload && atletaSelect.value);
  });

  fcMaxInput?.addEventListener("input", prepararZonasDesdeVdot);

  btnGuardar?.addEventListener("click", async () => {
    if (!lastPayload || !lastPayload.atleta_id) return;
    try {
      const csrf = window.CSRF && window.CSRF.ensureToken ? await window.CSRF.ensureToken() : null;
      const res = await fetch(`${window.API_BASE}/guardar_zonas`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader() ? { Authorization: authHeader() } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {})
        },
        body: JSON.stringify(lastPayload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudieron guardar las zonas");
      alert("Zonas guardadas desde VDOT.");
      btnGuardar.disabled = true;
    } catch (err) {
      alert(err.message || "No se pudieron guardar las zonas");
    }
  });

  cargarAtletas();

  return { prepararZonasDesdeVdot };
};
