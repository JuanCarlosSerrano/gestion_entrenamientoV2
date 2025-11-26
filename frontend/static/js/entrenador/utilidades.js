const pad = (value) => String(value).padStart(2, "0");

const formatTiempo = (segundosTotales) => {
  const total = Math.max(0, Math.round(segundosTotales));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (horas > 0) {
    return `${horas}:${pad(minutos)}:${pad(segundos)}`;
  }
  return `${pad(minutos)}:${pad(segundos)}`;
};

const formatPace = (segundosPorKm) => {
  const total = Math.max(0, Math.round(segundosPorKm));
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${pad(minutos)}:${pad(segundos)}`;
};

const formatMarkerLabel = (km) => {
  if (km >= 1) {
    return Number.isInteger(km) ? `Km ${km}` : `Km ${km.toFixed(2)}`;
  }
  return `${Math.round(km * 1000)} m`;
};

const calcularParciales = (distanciaKm, segundosPorKm, splitsKm = null) => {
  const parciales = [];
  let markers = [];
  if (Array.isArray(splitsKm) && splitsKm.length) {
    markers = splitsKm
      .map((valor) => Number(valor))
      .filter((km) => km > 0 && km < distanciaKm)
      .sort((a, b) => a - b);
  }

  if (!markers.length) {
    const kmEnteros = Math.floor(distanciaKm);
    for (let i = 1; i <= kmEnteros; i += 1) {
      markers.push(i);
    }
  }

  if (markers[markers.length - 1] !== distanciaKm) {
    markers.push(distanciaKm);
  }

  markers.forEach((km) => {
    parciales.push({
      etiqueta: formatMarkerLabel(km),
      tiempo: formatTiempo(segundosPorKm * km),
    });
  });

  return parciales;
};

const obtenerDistanciaSeleccionada = () => {
  const preset = document.getElementById("distancia-preset");
  const customWrapper = document.getElementById("distancia-custom-wrapper");
  const customInput = document.getElementById("distancia-custom");
  const customUnidad = document.getElementById("distancia-custom-unidad");
  if (!preset) return null;
  const valor = preset.value;
  if (valor === "custom") {
    if (customWrapper) customWrapper.style.display = "block";
    let customVal = parseFloat(customInput?.value || "0");
    if (!Number.isFinite(customVal) || customVal <= 0) {
      return null;
    }
    const unidad = customUnidad?.value || "km";
    if (unidad === "m") {
      customVal = customVal / 1000;
    }
    return customVal;
  }
  if (customWrapper) customWrapper.style.display = "none";
  return parseFloat(valor);
};

const toggleCustomDistanceVisibility = () => {
  const preset = document.getElementById("distancia-preset");
  const customWrapper = document.getElementById("distancia-custom-wrapper");
  if (!preset || !customWrapper) return;
  customWrapper.style.display = preset.value === "custom" ? "block" : "none";
};

const obtenerParcialesPersonalizados = () => {
  const toggle = document.getElementById("toggle-parciales-personalizados");
  const input = document.getElementById("parciales-personalizados");
  if (!toggle?.checked) return null;
  const valores = (input?.value || "")
    .split(",")
    .map((v) => parseFloat(v.trim().replace(",", ".")))
    .filter((v) => Number.isFinite(v) && v > 0);
  return valores.length ? valores : null;
};

const copiarParciales = () => {
  const filas = Array.from(document.querySelectorAll("#tabla-parciales tr"));
  if (!filas.length) return;
  const texto = filas
    .map((fila) => {
      const cols = Array.from(fila.querySelectorAll("td"));
      return cols.map((col) => col.innerText.trim()).join("\t");
    })
    .join("\n");
  navigator.clipboard.writeText(texto).catch(() => {});
};

export function init() {
  const form = document.getElementById("form-calculadora-ritmo");
  if (!form) return;
  const preset = document.getElementById("distancia-preset");
  const resultados = document.getElementById("resultados-ritmo");
  const parcialesWrapper = document.getElementById("parciales-wrapper");
  const tablaParciales = document.getElementById("tabla-parciales");
  const ritmoPromedio = document.getElementById("ritmo-promedio");
  const velocidadMedia = document.getElementById("velocidad-media");
  const tiempoTotal = document.getElementById("tiempo-total");
  const distanciaDescripcion = document.getElementById("distancia-descripcion");
  const btnReset = document.getElementById("btn-reset-calculadora");
  const btnCopy = document.getElementById("btn-copy-parciales");
  const toggleParciales = document.getElementById("toggle-parciales-personalizados");
  const wrapperParciales = document.getElementById("parciales-custom-wrapper");

  preset?.addEventListener("change", () => {
    toggleCustomDistanceVisibility();
    obtenerDistanciaSeleccionada();
  });
  btnCopy?.addEventListener("click", () => copiarParciales());
  toggleParciales?.addEventListener("change", () => {
    if (!wrapperParciales) return;
    wrapperParciales.style.display = toggleParciales.checked ? "block" : "none";
  });

  wrapperParciales?.querySelectorAll("[data-splits]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const splits = btn.getAttribute("data-splits");
      const input = document.getElementById("parciales-personalizados");
      if (!input) return;
      input.value = splits;
      if (!toggleParciales.checked) {
        toggleParciales.checked = true;
        wrapperParciales.style.display = "block";
      }
    });
  });

  btnReset?.addEventListener("click", () => {
    document.getElementById("distancia-preset").value = "10";
    document.getElementById("distancia-custom").value = "";
    document.getElementById("distancia-custom-wrapper").style.display = "none";
    document.getElementById("tiempo-horas").value = "0";
    document.getElementById("tiempo-minutos").value = "45";
    document.getElementById("tiempo-segundos").value = "0";
    resultados.style.display = "none";
    parcialesWrapper.style.display = "none";
    tablaParciales.innerHTML =
      '<tr><td colspan="2" class="text-muted text-center">Calcula un ritmo para ver los parciales.</td></tr>';
    if (toggleParciales) toggleParciales.checked = false;
    if (wrapperParciales) wrapperParciales.style.display = "none";
    const inputPersonalizados = document.getElementById("parciales-personalizados");
    if (inputPersonalizados) inputPersonalizados.value = "";
  });

  const quickButtons = document.getElementById("parciales-quick-buttons");
  const formatSplitValue = (valor) => {
    const metros = valor * 1000;
    if (Number.isInteger(metros)) {
      if (metros % 1000 === 0) {
        return (metros / 1000).toString();
      }
      return (metros / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }
    return valor.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  };

  const appendSplitValue = (valor) => {
    const input = document.getElementById("parciales-personalizados");
    if (!input) return;
    const toggle = document.getElementById("toggle-parciales-personalizados");
    const wrapper = document.getElementById("parciales-custom-wrapper");
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      if (wrapper) wrapper.style.display = "block";
    }
    const valores = (input.value || "")
      .split(",")
      .map((v) => parseFloat(v.trim().replace(",", ".")))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!valores.includes(valor)) {
      valores.push(valor);
      valores.sort((a, b) => a - b);
      input.value = valores.map(formatSplitValue).join(", ");
    }
  };

  quickButtons?.querySelectorAll("[data-split-value]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = parseFloat(btn.getAttribute("data-split-value"));
      if (Number.isFinite(value)) {
        appendSplitValue(value);
      }
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const distancia = obtenerDistanciaSeleccionada();
    const horas = parseInt(document.getElementById("tiempo-horas").value, 10) || 0;
    const minutos = parseInt(document.getElementById("tiempo-minutos").value, 10) || 0;
    const segundos = parseInt(document.getElementById("tiempo-segundos").value, 10) || 0;
    const totalSegundos = horas * 3600 + minutos * 60 + segundos;

    if (!distancia || distancia <= 0) {
      alert("Introduce una distancia válida.");
      return;
    }
    if (!totalSegundos) {
      alert("Introduce un tiempo válido.");
      return;
    }

    const segundosPorKm = totalSegundos / distancia;
    const velocidad = (distancia / (totalSegundos / 3600)).toFixed(2);

    ritmoPromedio.textContent = `${formatPace(segundosPorKm)} min/km`;
    velocidadMedia.textContent = `${velocidad} km/h`;
    tiempoTotal.textContent = formatTiempo(totalSegundos);
    distanciaDescripcion.textContent = `${distancia.toFixed(3)} km`;

    const splitsPersonalizados = obtenerParcialesPersonalizados();
    const parciales = calcularParciales(distancia, segundosPorKm, splitsPersonalizados);
    if (parciales.length) {
      tablaParciales.innerHTML = parciales
        .map(
          (parcial) => `
          <tr>
            <td>${parcial.etiqueta}</td>
            <td>${parcial.tiempo}</td>
          </tr>
        `
        )
        .join("");
    } else {
      tablaParciales.innerHTML =
        '<tr><td colspan="2" class="text-muted text-center">No se pudieron calcular los parciales.</td></tr>';
    }

    resultados.style.display = "flex";
    parcialesWrapper.style.display = "block";
  });

  toggleCustomDistanceVisibility();
  obtenerDistanciaSeleccionada();
}


/* 👇👇 AÑADE ESTO AL FINAL DEL ARCHIVO 👇👇 */
document.addEventListener("DOMContentLoaded", init);


