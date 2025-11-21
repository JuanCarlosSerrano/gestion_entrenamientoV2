const API =
  window.API_BASE ||
  (window.location && window.location.origin
    ? window.location.origin
    : "http://127.0.0.1:5000");

window.API_BASE = API;

const authHeader = () =>
  "Basic " +
  btoa(`${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`);

const getCsrfToken = () =>
  (window.CSRF && typeof window.CSRF.getToken === "function"
    ? window.CSRF.getToken()
    : localStorage.getItem("csrfToken"));

document.addEventListener("DOMContentLoaded", async function () {
  // --------- referencias al DOM ---------
  const contenedor = document.getElementById("entrenamientos-asignados");
  const historial = document.getElementById("entrenamientos-historial");
  const nombreAtleta = document.getElementById("nombre-atleta");
  const fotoPerfil = document.getElementById("foto-perfil");

  const modalFeedback = new bootstrap.Modal(document.getElementById("modalFeedback"));
  const formFeedback = document.getElementById("form-feedback");
  const comentarioInput = document.getElementById("comentario");
  const entrenamientoIdInput = document.getElementById("feedback-entrenamiento-id");
  const enlaceInput = document.getElementById("enlace_entrenamiento");
  const percepcionSelect = document.getElementById("percepcion");
  const tiempoInput = document.getElementById("tiempo_realizado");
  const resultadoInput = document.getElementById("resultado_entrenamiento");

  const formPerfil = document.getElementById("form-perfil");
  const inputNombre = document.getElementById("input-nombre");
  const inputApellidos = document.getElementById("input-apellidos");
  const inputFoto = document.getElementById("input-foto");

  const listaFeedbacks = document.getElementById("feedbacks-enviados-lista");

  const modalTiempos = new bootstrap.Modal(document.getElementById("modalTiempos"));
  const formTiempos = document.getElementById("form-tiempos-bloques");
  const listaTiempos = document.getElementById("lista-tiempos-bloques");
  const modalTiemposLabel = document.getElementById("modalTiemposLabel");
  const inputTiemposEntrenamientoId = document.getElementById("tiempos-entrenamiento-id");

  const zonasPerfilContainer = document.getElementById("zonas-perfil-container");
  const zonasPerfilBody = document.getElementById("zonas-perfil-body");
  const zonasPerfilEmpty = document.getElementById("zonas-perfil-empty");

  const entrenamientosPorId = {};
  let entrenamientoTiemposActual = null;

  // --------- utilidades de formato ---------

  const formatearDistancia = (metros) => {
    if (typeof metros !== "number" || Number.isNaN(metros)) return "-";
    if (metros >= 1000) {
      const km = metros / 1000;
      return `${Number.isInteger(km) ? km : km.toFixed(2)} km`;
    }
    return `${metros} m`;
  };

  const formatearRango = (min, max) => {
    if (min && max && min !== max) return `${min} - ${max}`;
    return min || max || "-";
  };

  const parseTiempoEntrada = (valor) => {
    if (!valor) return null;
    const trimmed = valor.trim();
    if (!trimmed) return null;

    // Formato mm:ss
    const match = trimmed.match(/^(\d{1,3}):([0-5]?\d)$/);
    if (match) {
      const min = parseInt(match[1], 10);
      const seg = parseInt(match[2], 10);
      return min * 60 + seg;
    }

    // Formato decimal en minutos
    const numero = Number(trimmed.replace(",", "."));
    if (!Number.isNaN(numero) && numero > 0) {
      return Math.round(numero * 60);
    }
    return null;
  };

  const renderZonasPerfil = (zonas) => {
    if (!zonasPerfilBody) return;

    if (!zonas || zonas.message) {
      zonasPerfilContainer?.classList.add("d-none");
      if (zonasPerfilEmpty) zonasPerfilEmpty.textContent = "Aún no hay zonas registradas.";
      return;
    }

    const definiciones = [
      { clave: "z1", nombre: "Zona 1 · Recuperación" },
      { clave: "z2", nombre: "Zona 2 · Fondo suave" },
      { clave: "z3", nombre: "Zona 3 · Fondo medio" },
      { clave: "z4", nombre: "Zona 4 · Umbral" },
      { clave: "z5", nombre: "Zona 5 · VAM" },
      { clave: "z6", nombre: "Zona 6 · VO₂max" }
    ];

    const filas = definiciones
      .map(({ clave, nombre }) => {
        const valor = zonas[clave];
        if (!valor) return "";
        return `<tr><td>${nombre}</td><td>${Number(valor).toFixed(2)} min/km</td></tr>`;
      })
      .filter(Boolean)
      .join("");

    if (!filas) {
      zonasPerfilContainer?.classList.add("d-none");
      if (zonasPerfilEmpty) zonasPerfilEmpty.textContent = "Aún no hay zonas registradas.";
      return;
    }

    zonasPerfilBody.innerHTML = filas;
    zonasPerfilContainer?.classList.remove("d-none");
    zonasPerfilEmpty?.classList.add("d-none");
  };

  // --------- render de bloques estilo Garmin ---------

  const STEP_TYPES = [
    { value: "warmup", label: "Calentamiento" },
    { value: "interval", label: "Serie" },
    { value: "rest", label: "Recuperación" },
    { value: "repeat", label: "Bloque repetido" },
    { value: "cooldown", label: "Enfriamiento" },
    { value: "custom", label: "Libre" }
  ];

  const renderPasos = (pasos, isSubpaso = false) => {
    if (!Array.isArray(pasos) || !pasos.length) {
      return isSubpaso ? "" : '<p class="text-muted small mb-0">Sin bloques detallados.</p>';
    }

    const containerClass = isSubpaso ? "builder-step-children" : "detalle-bloques-list";

    return `<div class="${containerClass}">
      ${pasos
        .map((paso) => {
          const tipoClass = `detalle-bloque--${paso.tipo_paso || "custom"}`;
          let descripcionPasoHtml = "";

          if (paso.tipo_paso === "repeat") {
            const subpasosHtml = renderPasos(paso.subpasos || [], true);
            descripcionPasoHtml = `
              <div class="detalle-bloque__texto">
                <strong>${paso.repeticiones || 1}x (</strong>
              </div>
              ${subpasosHtml}
              <div class="detalle-bloque__texto">
                <strong>)</strong>
              </div>
            `;
          } else {
            const objetivo = paso.objetivo_valor ? `${paso.objetivo_valor}${paso.unidad || ""}` : "";
            const recuperacion = paso.recuperacion_valor
              ? `Rec: ${paso.recuperacion_valor}${paso.recuperacion_unidad || "s"}`
              : "";
            const zona = paso.zona ? `Zona ${paso.zona}` : "";
            const intensidad = paso.intensidad || "";
            const descripcion = paso.descripcion || "";

            const detalles = [objetivo, zona, intensidad, recuperacion].filter(Boolean).join(" · ");
            descripcionPasoHtml = `<p class="detalle-bloque__texto">${detalles}</p>`;
            if (descripcion) {
              descripcionPasoHtml += `<p class="text-muted small">${descripcion}</p>`;
            }
          }

          const tipoLabel =
            STEP_TYPES.find((t) => t.value === paso.tipo_paso)?.label || paso.tipo_paso;

          return `
            <div class="detalle-bloque ${tipoClass}">
              <div class="detalle-bloque__header">
                <span class="detalle-bloque__chip">${tipoLabel}</span>
              </div>
              ${descripcionPasoHtml}
            </div>
          `;
        })
        .join("")}
    </div>`;
  };

  const actualizarBloquesEnVista = (entrenamiento) => {
    const contenedorDetalle = document.getElementById(`bloques-detalle-${entrenamiento.id}`);
    if (contenedorDetalle) {
      contenedorDetalle.innerHTML = renderPasos(entrenamiento.pasos || []);
    }
  };

  const abrirModalTiempos = (entrenamiento) => {
    entrenamientoTiemposActual = entrenamiento.id;
    inputTiemposEntrenamientoId.value = entrenamiento.id;
    modalTiemposLabel.textContent = `Registrar tiempos - ${entrenamiento.nombre}`;

    if (!Array.isArray(entrenamiento.bloques) || !entrenamiento.bloques.length) {
      listaTiempos.innerHTML =
        '<p class="text-muted mb-0">Este entrenamiento no tiene bloques definidos.</p>';
    } else {
      listaTiempos.innerHTML = entrenamiento.bloques
        .map((bloque, index) => {
          const estimado = formatearRango(bloque.tiempo_min_texto, bloque.tiempo_max_texto);
          const ritmo = formatearRango(bloque.ritmo_min_texto, bloque.ritmo_max_texto);
          const series = Array.isArray(bloque.series) ? bloque.series : [];

          return `
            <div class="mb-3">
              <label class="form-label d-flex justify-content-between">
                <span>Bloque ${index + 1}: ${bloque.repeticiones || 1} x ${formatearDistancia(
            Number(bloque.distancia_m) || 0
          )}</span>
                <small class="text-muted">${estimado !== "-" ? `Estimado ${estimado}` : ""}</small>
              </label>
              ${
                ritmo !== "-"
                  ? `<div class="text-muted small mb-1">Ritmo guía: ${ritmo} min/km</div>`
                  : ""
              }
              ${
                series.length
                  ? series
                      .map(
                        (serie) => `
                        <div class="input-group input-group-sm mb-2">
                          <span class="input-group-text">Rep ${serie.numero_repeticion}</span>
                          <input
                            type="text"
                            class="form-control"
                            placeholder="${serie.tiempo_objetivo_texto || "mm:ss"}"
                            value="${serie.tiempo_real_texto || ""}"
                            data-serie-id="${serie.serie_id || ""}"
                            data-bloque-id="${bloque.id || ""}"
                            data-repeticion="${serie.numero_repeticion || ""}"
                          />
                          <span class="input-group-text">${
                            serie.tiempo_objetivo_texto || "-"
                          } obj</span>
                        </div>`
                      )
                      .join("")
                  : '<p class="text-muted small mb-0">Este bloque no tiene repeticiones detalladas.</p>'
              }
            </div>
          `;
        })
        .join("");
    }

    modalTiempos.show();
  };

  // ----------------------------------------------------
  // CARGA INICIAL: perfil, zonas, entrenos
  // ----------------------------------------------------

  try {
    const atletaId = localStorage.getItem("userId");

    if (!atletaId) {
      contenedor.innerHTML =
        "<div class='alert alert-warning'>No se ha podido identificar al atleta.</div>";
      return;
    }

    // Perfil
    const perfilRes = await fetch(`${API}/perfil_atleta/${atletaId}`, {
      credentials: "include",
      headers: {
        Authorization: authHeader()
      }
    });
    const perfil = await perfilRes.json();

    if (nombreAtleta) {
      nombreAtleta.textContent = `Bienvenid@, ${perfil.nombre}`;
    }
    if (inputNombre) inputNombre.value = perfil.nombre || "";
    if (inputApellidos) inputApellidos.value = perfil.apellidos || "";

    if (fotoPerfil) {
      if (perfil.foto_url) fotoPerfil.src = perfil.foto_url;
      else fotoPerfil.src = "../img/default-avatar.jpg";
    }

    // Zonas
    try {
      const resZonas = await fetch(`${API}/zonas_atleta/${atletaId}`, {
        credentials: "include",
        headers: {
          Authorization: authHeader()
        }
      });
      if (resZonas.ok) {
        const zonas = await resZonas.json();
        renderZonasPerfil(zonas);
      } else {
        renderZonasPerfil(null);
      }
    } catch (err) {
      console.error("Error al cargar zonas:", err);
      renderZonasPerfil(null);
    }

    // Entrenamientos asignados
    const res = await fetch(`${API}/entrenamientos_asignados/${atletaId}`, {
      credentials: "include",
      headers: {
        Authorization: authHeader()
      }
    });

    if (!res.ok) throw new Error("Error al obtener entrenamientos asignados");
    const entrenamientos = await res.json();

    const visibles = entrenamientos.filter((ent) => {
      if (ent.visible === undefined || ent.visible === null) return true;
      return Number(ent.visible) === 1;
    });

    const hoy = new Date();
    const template = document.getElementById("entrenamiento-card-template");

    if (!visibles.length) {
      contenedor.innerHTML =
        "<div class='alert alert-info'>Aún no hay entrenamientos disponibles. Tu entrenador los publicará cuando estén listos.</div>";
    } else {
      visibles.forEach((ent) => {
        entrenamientosPorId[ent.id] = ent;
        const fechaEntreno = ent.fecha ? new Date(ent.fecha) : null;

        if (template) {
          const clone = template.content.cloneNode(true);
          const article = clone.querySelector("article");
          if (article) article.dataset.entrenamientoId = ent.id ?? "";

          const setText = (sel, txt) => {
            const el = clone.querySelector(sel);
            if (el) el.textContent = txt ?? "";
          };

          setText(".entrenamiento-nombre", ent.nombre ?? "Entrenamiento");
          setText(
            ".entrenamiento-objetivo",
            [ent.objetivo, ent.notas].filter(Boolean).join(" · ") || "—"
          );
          setText(
            ".entrenamiento-fecha",
            ent.fecha ? new Date(ent.fecha).toLocaleDateString("es-ES") : "--/--/----"
          );

          const bloquesContainer = clone.querySelector(".bloques-preview");
          if (bloquesContainer) {
            bloquesContainer.innerHTML = renderPasos(ent.pasos || []);
          }

          // Botón feedback
          const btnFeedback = clone.querySelector(".btn-feedback");
          if (btnFeedback) {
            btnFeedback.addEventListener("click", () => {
              entrenamientoIdInput.value = ent.id ?? "";
              comentarioInput.value = "";
              enlaceInput.value = "";
              percepcionSelect.value = "";
              tiempoInput.value = "";
              resultadoInput.value = "";
              modalFeedback.show();
            });
          }

          // Botón registrar tiempos
          const btnRegistrar = clone.querySelector(".btn-registrar-tiempos");
          if (btnRegistrar) {
            btnRegistrar.addEventListener("click", () => {
              abrirModalTiempos(ent);
            });
          }

          const destino =
            fechaEntreno && fechaEntreno < hoy && historial ? historial : contenedor;
          destino.appendChild(clone);
        }
      });
    }
  } catch (err) {
    console.error("Error al cargar entrenamientos:", err);
    contenedor.innerHTML =
      "<div class='alert alert-danger'>Error al cargar los entrenamientos.</div>";
  }

  // ----------------------------------------------------
  // GUARDAR TIEMPOS BLOQUES
  // ----------------------------------------------------
  if (formTiempos) {
    formTiempos.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!entrenamientoTiemposActual) {
        alert("No se ha seleccionado un entrenamiento.");
        return;
      }

      const inputs = listaTiempos.querySelectorAll("[data-serie-id]");
      const seriesPayload = [];

      inputs.forEach((input) => {
        const valor = input.value.trim();
        if (!valor) return;

        const segundos = parseTiempoEntrada(valor);

        if (segundos === null) {
          input.classList.add("is-invalid");
        } else {
          input.classList.remove("is-invalid");
          seriesPayload.push({
            serie_id: input.dataset.serieId ? Number(input.dataset.serieId) : null,
            bloque_id: input.dataset.bloqueId ? Number(input.dataset.bloqueId) : null,
            numero_repeticion: input.dataset.repeticion
              ? Number(input.dataset.repeticion)
              : null,
            tiempo_real_seg: segundos
          });
        }
      });

      const invalido = Array.from(inputs).some((i) => i.classList.contains("is-invalid"));
      if (invalido) {
        alert("Revisa el formato de los tiempos (usa mm:ss).");
        return;
      }

      const payload = seriesPayload.filter((x) => x.tiempo_real_seg);
      if (!payload.length) {
        alert("Introduce al menos un tiempo válido.");
        return;
      }

      try {
        let csrf = getCsrfToken();
        if (window.CSRF?.ensureToken) {
          csrf = await window.CSRF.ensureToken();
        }

        const res = await fetch(
          `${API}/entrenamientos_asignados/${entrenamientoTiemposActual}/resultados`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader(),
              ...(csrf ? { "X-CSRF-Token": csrf } : {})
            },
            body: JSON.stringify({ series: payload })
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudieron guardar los tiempos");

        entrenamientosPorId[data.id] = data;
        actualizarBloquesEnVista(data);

        modalTiempos.hide();
        alert("Tiempos guardados correctamente");
      } catch (err) {
        console.error("Error al guardar tiempos:", err);
        alert(err.message || "No se pudieron guardar los tiempos");
      }
    });
  }

  // ----------------------------------------------------
  // ENVIAR FEEDBACK
  // ----------------------------------------------------
  if (formFeedback) {
    formFeedback.addEventListener("submit", async function (e) {
      e.preventDefault();

      const comentario = comentarioInput.value.trim();
      const entrenamiento_id = entrenamientoIdInput.value;
      const enlace = enlaceInput.value.trim();
      const percepcion = percepcionSelect.value;
      const tiempo_realizado = tiempoInput.value;
      const resultado = resultadoInput.value.trim();

      if (!comentario || !entrenamiento_id || !percepcion || !tiempo_realizado || !resultado) {
        alert("Completa todos los campos del feedback.");
        return;
      }

      try {
        let csrf = getCsrfToken();
        if (window.CSRF?.ensureToken) {
          csrf = await window.CSRF.ensureToken();
        }
        const res = await fetch(`${API}/feedback`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader(),
            ...(csrf ? { "X-CSRF-Token": csrf } : {})
          },
          body: JSON.stringify({
            entrenamiento_id,
            comentario,
            enlace,
            percepcion,
            tiempo_realizado,
            resultado
          })
        });

        const respuesta = await res.json();

        if (!res.ok) throw new Error(respuesta.error || "Error al enviar feedback");

        alert(respuesta.message || "Feedback enviado correctamente");
        modalFeedback.hide();
        cargarMisFeedbacks();
      } catch (err) {
        console.error("Error al enviar feedback:", err);
        alert(err.message || "Error al enviar feedback");
      }
    });
  }

  // ----------------------------------------------------
  // ACTUALIZAR PERFIL
  // ----------------------------------------------------
  if (formPerfil) {
    formPerfil.addEventListener("submit", async function (e) {
      e.preventDefault();

      const nombre = inputNombre.value.trim();
      const apellidos = inputApellidos.value.trim();
      const foto = inputFoto.files[0];

      const formData = new FormData();
      formData.append("nombre", nombre);
      formData.append("apellidos", apellidos);
      if (foto) formData.append("foto", foto);

      try {
        const res = await fetch(`${API}/actualizar_perfil`, {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: authHeader()
          },
          body: formData
        });

        const respuesta = await res.json();
        if (!res.ok) throw new Error(respuesta.error || "No se pudo actualizar el perfil");

        alert("Perfil actualizado correctamente");
        if (respuesta.foto_url) fotoPerfil.src = respuesta.foto_url;
        if (nombreAtleta) nombreAtleta.textContent = `Bienvenid@, ${nombre}`;
      } catch (err) {
        console.error("Error al actualizar perfil:", err);
        alert("No se pudo actualizar el perfil");
      }
    });
  }

  // ----------------------------------------------------
  // CARGAR FEEDBACKS ENVIADOS
  // ----------------------------------------------------
  async function cargarMisFeedbacks() {
    if (!listaFeedbacks) return;

    try {
      const res = await fetch(`${API}/mis_feedbacks`, {
        credentials: "include",
        headers: { Authorization: authHeader() }
      });

      if (!res.ok) {
        console.warn("Error al obtener mis_feedbacks:", res.status);
        listaFeedbacks.innerHTML =
          '<p class="text-muted">Aún no has enviado feedbacks.</p>';
        return;
      }

      const feedbacks = await res.json();
      listaFeedbacks.innerHTML = "";

      if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
        listaFeedbacks.innerHTML =
          '<p class="text-muted">Aún no has enviado feedbacks.</p>';
        return;
      }

      feedbacks.forEach((fb) => {
        const statusClass = fb.leido ? "chip chip-success" : "chip chip-warning";
        const statusText = fb.leido ? "Revisado" : "Pendiente";

        const card = document.createElement("div");
        card.className = "border rounded p-3 mb-3 bg-white shadow-sm";
        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <strong>${fb.entrenamiento_nombre || "Entrenamiento"}</strong><br>
              <small class="text-muted">${
                fb.fecha_entreno
                  ? new Date(fb.fecha_entreno).toLocaleDateString("es-ES")
                  : ""
              }</small>
            </div>
            <span class="${statusClass}">${statusText}</span>
          </div>
          <div class="mt-2">
            ${
              fb.comentario
                ? `<p class="mb-1"><strong>Comentario:</strong> ${fb.comentario}</p>`
                : ""
            }
            ${
              fb.resultado
                ? `<p class="mb-1"><strong>Resultado:</strong> ${fb.resultado}</p>`
                : ""
            }
            ${
              fb.tiempo_realizado
                ? `<p class="mb-1"><strong>Tiempo:</strong> ${fb.tiempo_realizado}</p>`
                : ""
            }
            ${
              fb.percepcion
                ? `<p class="mb-1"><strong>Percepción:</strong> ${fb.percepcion}</p>`
                : ""
            }
            ${
              fb.enlace
                ? `<p class="mb-1"><strong>Enlace:</strong> <a href="${fb.enlace}" target="_blank" rel="noopener">${fb.enlace}</a></p>`
                : ""
            }
            <small class="text-muted">Enviado: ${
              fb.fecha ? new Date(fb.fecha).toLocaleString("es-ES") : ""
            }</small>
          </div>
          ${
            fb.respuesta
              ? `<div class="alert alert-info mt-3 mb-0"><strong>Respuesta del entrenador:</strong><br>${fb.respuesta}</div>`
              : ""
          }
        `;
        listaFeedbacks.appendChild(card);
      });
    } catch (err) {
      console.error("Error al cargar mis feedbacks:", err);
      listaFeedbacks.innerHTML =
        '<p class="text-danger">No se pudieron cargar tus feedbacks.</p>';
    }
  }

  // llamada inicial
  cargarMisFeedbacks();
});
