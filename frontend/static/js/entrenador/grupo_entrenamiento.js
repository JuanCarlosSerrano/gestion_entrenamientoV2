document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("form-asignar-grupo");
  const categoriaSelect = document.getElementById("categoria");
  const fechaInput = document.getElementById("fecha");
  const entrenamientoSelect = document.getElementById("select-entrenamiento");

  const campos = {
    nombre: document.getElementById("nombre"),
    duracion_valor: document.getElementById("duracion_valor"),
    duracion_tipo: document.getElementById("duracion_tipo"),
    calentamiento_tipo: document.getElementById("calentamiento_tipo"),
    calentamiento_valor: document.getElementById("calentamiento_valor"),
    bloque_activacion: document.getElementById("bloque_activacion"),
    bloque_principal: document.getElementById("bloque_principal"),
    enfriamiento_tipo: document.getElementById("enfriamiento_tipo"),
    enfriamiento_valor: document.getElementById("enfriamiento_valor")
  };

  let entrenamientos = [];

  try {
    const res = await fetch("http://127.0.0.1:5000/entrenamientos", {
      headers: {
        Authorization:
          "Basic " +
          btoa(
            `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
          )
      }
    });
    entrenamientos = await res.json();
    entrenamientoSelect.innerHTML = entrenamientos
      .map((e) => `<option value="${e.id}">${e.nombre}</option>`)
      .join("");

    entrenamientoSelect.addEventListener("change", () => {
      const selected = entrenamientos.find(
        (e) => e.id == entrenamientoSelect.value
      );
      if (selected) {
        Object.keys(campos).forEach((key) => {
          if (campos[key]) campos[key].value = selected[key] || "";
        });
      }
    });

    entrenamientoSelect.dispatchEvent(new Event("change"));
  } catch (err) {
    console.error("Error al cargar entrenamientos tipo:", err);
    alert("No se pudieron cargar los entrenamientos tipo");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const categoria = categoriaSelect.value;
    const fecha = fechaInput.value;

    const entrenamiento = {
      nombre: campos.nombre?.value,
      duracion_valor: campos.duracion_valor?.value,
      duracion_tipo: campos.duracion_tipo?.value,
      calentamiento_tipo: campos.calentamiento_tipo?.value,
      calentamiento_valor: campos.calentamiento_valor?.value,
      bloque_activacion: campos.bloque_activacion?.value,
      bloque_principal: campos.bloque_principal?.value,
      enfriamiento_tipo: campos.enfriamiento_tipo?.value,
      enfriamiento_valor: campos.enfriamiento_valor?.value,
      fecha: fecha,
      categoria: categoria
    };

    try {
      const res = await fetch("http://127.0.0.1:5000/asignar_grupo_entrenamiento", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            btoa(
              `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
            )
        },
        body: JSON.stringify(entrenamiento)
      });

      const resultado = await res.json();
      alert(resultado.message || "Entrenamiento asignado a grupo correctamente");
    } catch (err) {
      console.error("Error al asignar entrenamiento a grupo:", err);
      alert("Error al asignar el entrenamiento");
    }
  });
});
