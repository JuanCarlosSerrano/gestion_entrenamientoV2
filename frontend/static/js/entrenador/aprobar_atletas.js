document.addEventListener("DOMContentLoaded", async function () {
    const tabla = document.getElementById("tabla-pendientes").getElementsByTagName("tbody")[0];
  
    try {
      const res = await fetch("http://127.0.0.1:5000/atletas_pendientes", {
        headers: {
          Authorization: "Basic " + btoa(
            `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
          )
        }
      });
  
      if (!res.ok) throw new Error("Error al cargar atletas pendientes");
  
      const atletas = await res.json();
  
      if (atletas.length === 0) {
        tabla.innerHTML = `<tr><td colspan="7">No hay atletas pendientes de aprobación</td></tr>`;
        return;
      }
  
      atletas.forEach(atleta => {
        const row = tabla.insertRow();
        row.innerHTML = `
          <td>${atleta.nombre}</td>
          <td>${atleta.apellidos}</td>
          <td>${atleta.email}</td>
          <td>${atleta.fecha_nacimiento || '-'}</td>
          <td>${atleta.telefono || '-'}</td>
          <td><input type="text" class="form-control form-control-sm grupo" placeholder="Grupo"></td>
          <td><input type="text" class="form-control form-control-sm subgrupo" placeholder="Subgrupo"></td>
          <td><button class="btn btn-sm btn-success aprobar" data-id="${atleta.id}">Aprobar</button></td>
        `;
      });
  
      tabla.addEventListener("click", async (e) => {
        if (e.target.classList.contains("aprobar")) {
          const btn = e.target;
          const id = btn.dataset.id;
          const row = btn.closest("tr");
          const grupo = row.querySelector(".grupo").value;
          const subgrupo = row.querySelector(".subgrupo").value;
  
          try {
            const res = await fetch(`http://127.0.0.1:5000/atletas/aprobar/${id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Basic " + btoa(
                  `${localStorage.getItem("userEmail")}:${localStorage.getItem("userPassword")}`
                )
              },
              body: JSON.stringify({ grupo, subgrupo })
            });

            const resultado = await res.json();
            alert(resultado.message || "Atleta aprobado correctamente");
            row.remove();
          } catch (err) {
            console.error("Error al aprobar atleta:", err);
            alert("Error al aprobar atleta");
          }
        }
      });
    } catch (err) {
      console.error("Error al cargar atletas:", err);
      tabla.innerHTML = `<tr><td colspan="7">Error al cargar atletas</td></tr>`;
    }
  });
  