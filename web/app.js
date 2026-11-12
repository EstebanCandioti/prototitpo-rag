const form = document.querySelector("#form-busqueda");
const pregunta = document.querySelector("#pregunta");
const juegoDetectado = document.querySelector("#juego-detectado");
const ejemplo = document.querySelector("#ejemplo");
const cantidad = document.querySelector("#cantidad");
const umbral = document.querySelector("#umbral");
const valorUmbral = document.querySelector("#valor-umbral");
const resumen = document.querySelector("#resumen");
const resultadosEl = document.querySelector("#resultados");
const respuestaEl = document.querySelector("#respuesta");
const estado = document.querySelector("#estado");
const buscarBtn = document.querySelector("#buscar");
const generarBtn = document.querySelector("#generar");

const ejemplos = {
  "brisca-palo": {
    pregunta: "En Brisca, si tengo una carta del palo de salida, ¿estoy obligado a jugarla?",
  },
  "brisca-penalidad": {
    pregunta: "¿Cuántos puntos se descuentan en Brisca si un jugador muestra una carta por accidente?",
  },
  "escoba-oros": {
    pregunta: "En la Escoba, ¿cuántos puntos se anotan por tener todos los oros?",
  },
  "canasta-minimo": {
    pregunta: "En Canasta, ¿cuál es el valor mínimo de las cartas cuando la puntuación alcanzada está entre 1.500 y 2.995?",
  },
};

let resultados = null;
let busqueda = null;
let version = 0;

async function pedir(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);
  return datos;
}

function post(datos) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  };
}

function limpiarRespuesta(mensaje = "La respuesta se generará con los fragmentos que superen el umbral.") {
  version++;
  respuestaEl.textContent = mensaje;
  estado.textContent = "";
}

function invalidarBusqueda() {
  resultados = null;
  busqueda = null;
  generarBtn.disabled = true;
  juegoDetectado.textContent = "Mencioná el juego en la pregunta; se identificará al buscar.";
  resultadosEl.replaceChildren();
  resumen.textContent = "La consulta cambió. Buscá de nuevo para ver sus fragmentos.";
  limpiarRespuesta();
}

function seleccionados() {
  return (resultados ?? []).filter(r => r.similitud >= Number(umbral.value));
}

function renderizarUmbral() {
  valorUmbral.textContent = Number(umbral.value).toFixed(2);
  umbral.style.setProperty("--progress", `${Number(umbral.value) * 100}%`);
}

function elemento(nombre, clase, texto) {
  const nodo = document.createElement(nombre);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function renderizarResultados() {
  renderizarUmbral();
  resultadosEl.replaceChildren();
  if (resultados === null) return;

  const elegidos = seleccionados();
  const mejor = resultados[0]?.similitud;
  resumen.textContent = resultados.length === 0
    ? "No se encontraron fragmentos para este juego."
    : `${elegidos.length} de ${resultados.length} fragmentos superan el umbral. Mejor similitud: ${mejor.toFixed(3)}.`;

  for (const [i, r] of resultados.entries()) {
    const pasa = r.similitud >= Number(umbral.value);
    const tarjeta = elemento("article", `result-card${pasa ? "" : " rejected"}`);
    const superior = elemento("div", "result-top");
    superior.append(
      elemento("h3", "", `${i + 1}. ${r.seccion}`),
      elemento("span", "score", r.similitud.toFixed(3)),
    );
    tarjeta.append(superior);
    tarjeta.append(elemento("p", "result-meta", pasa ? "Entra en el contexto" : "Debajo del umbral"));

    const origen = elemento("a", "origin", r.origen);
    origen.href = r.origen;
    origen.target = "_blank";
    origen.rel = "noopener noreferrer";
    tarjeta.append(origen);

    const detalle = elemento("details");
    detalle.append(elemento("summary", "", "Ver texto del fragmento"));
    detalle.append(elemento("p", "fragment-text", r.texto));
    tarjeta.append(detalle);
    resultadosEl.append(tarjeta);
  }
}

form.addEventListener("submit", async evento => {
  evento.preventDefault();
  invalidarBusqueda();
  const datos = {
    pregunta: pregunta.value.trim(),
    k: Number(cantidad.value),
  };
  if (!datos.pregunta) {
    estado.textContent = "Escribí una pregunta que mencione el juego.";
    return;
  }

  buscarBtn.disabled = true;
  buscarBtn.textContent = "Buscando…";
  resumen.textContent = "Calculando el embedding y buscando fragmentos…";
  const estaBusqueda = ++version;
  try {
    const respuesta = await pedir("/api/recuperar", post(datos));
    if (estaBusqueda !== version) return;
    resultados = respuesta.resultados;
    busqueda = { ...datos, juego: respuesta.juego };
    juegoDetectado.textContent = `Juego detectado: ${respuesta.juego}`;
    generarBtn.disabled = false;
    renderizarResultados();
  } catch (error) {
    if (estaBusqueda === version) {
      resumen.textContent = "No se pudo completar la búsqueda.";
      estado.textContent = error.message;
    }
  } finally {
    buscarBtn.disabled = false;
    buscarBtn.textContent = "Buscar fragmentos ↗";
  }
});

generarBtn.addEventListener("click", async () => {
  if (resultados === null || !busqueda) return;
  const ids = seleccionados().map(r => r.id);
  const estaRespuesta = ++version;
  generarBtn.disabled = true;
  respuestaEl.textContent = ids.length ? "Generando respuesta…" : "Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.";
  estado.textContent = ids.length ? "El modelo está leyendo los fragmentos seleccionados." : "Ningún fragmento superó el umbral; no se llamó al modelo.";
  if (!ids.length) {
    generarBtn.disabled = false;
    return;
  }

  try {
    const datos = await pedir("/api/responder", post({
      pregunta: busqueda.pregunta,
      ids,
    }));
    if (estaRespuesta !== version) return;
    respuestaEl.textContent = datos.respuesta;
    estado.textContent = `Se enviaron ${ids.length} fragmentos al modelo.`;
  } catch (error) {
    if (estaRespuesta === version) {
      respuestaEl.textContent = "No se pudo generar la respuesta.";
      estado.textContent = error.message;
    }
  } finally {
    generarBtn.disabled = resultados === null;
  }
});

umbral.addEventListener("input", () => {
  renderizarResultados();
  if (resultados !== null) limpiarRespuesta("El umbral cambió. Generá otra respuesta para comparar.");
});

for (const control of [pregunta, cantidad]) {
  control.addEventListener("input", invalidarBusqueda);
}

ejemplo.addEventListener("change", () => {
  const caso = ejemplos[ejemplo.value];
  if (!caso) return;
  pregunta.value = caso.pregunta;
  invalidarBusqueda();
});

async function iniciar() {
  renderizarUmbral();
  try {
    const datos = await pedir("/api/juegos");
    umbral.value = Number(datos.umbralInicial).toFixed(2);
    renderizarUmbral();
    if (datos.juegos.length === 0) {
      resumen.textContent = "No se encontraron juegos en el corpus.";
    }
  } catch (error) {
    resumen.textContent = "No se pudo cargar la configuración.";
    estado.textContent = error.message;
  }
}

iniciar();
