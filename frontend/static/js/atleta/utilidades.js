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
