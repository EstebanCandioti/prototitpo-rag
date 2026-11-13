import { detectarJuego, normalizarNombreJuego } from './detectar-juego.mjs';

function mencionaJuego(texto, juego) {
  try { return detectarJuego(texto, [juego]) === juego; }
  catch { return false; }
}

function focoExplicito(pregunta, juego, respuestaAnterior) {
  const texto = normalizarNombreJuego(pregunta);
  const nombre = normalizarNombreJuego(juego).replace(/^(el|la|los) /, '');
  const patron = new RegExp(`(?:^| )(en|sobre|para|reglas de|como se juega(?: a| al)?|pasemos a|hablemos de|ahora(?: sobre)?|que dice) (?:el |la |los )?${nombre}(?= |$)`, 'g');
  for (const coincidencia of texto.matchAll(patron)) {
    const previo = texto.slice(0, coincidencia.index).trim();
    // «como en el Tute» cita una comparación, no cambia el juego consultado.
    if (coincidencia[1] === 'en' && /(?:^| )(?:como|igual que|tal como)$/.test(previo)) continue;
    const resto = texto.slice(coincidencia.index + coincidencia[0].length).trimStart();
    if (coincidencia[1] === 'en' && resto.startsWith('de ') &&
        respuestaAnterior && mencionaJuego(respuestaAnterior, juego)) continue;
    return true;
  }
  return false;
}

function contextoInvalido() {
  return Object.assign(new Error('El contexto de conversación no es válido. Iniciá una nueva conversación.'), { estado: 400 });
}

export function validarContexto(contexto, juegos) {
  if (contexto === undefined || contexto === null) return undefined;
  if (typeof contexto !== 'object' || Array.isArray(contexto) || !juegos.includes(contexto.juego)) throw contextoInvalido();
  const { juego, pregunta, respuesta } = contexto;
  if (pregunta === undefined && respuesta === undefined) return { juego };
  if (typeof pregunta !== 'string' || !pregunta.trim() || pregunta.length > 1000 ||
      typeof respuesta !== 'string' || !respuesta.trim() || respuesta.length > 4000) throw contextoInvalido();
  return { juego, pregunta: pregunta.trim(), respuesta: respuesta.trim() };
}

export function resolverConsulta(pregunta, contexto, juegos) {
  const mencionados = juegos.filter(juego => mencionaJuego(pregunta, juego));
  let juego;
  try {
    if (!contexto) juego = detectarJuego(pregunta, juegos);
    else {
      const focos = mencionados.filter(nombre => focoExplicito(pregunta, nombre, contexto.respuesta));
      if (focos.length === 1) juego = focos[0];
      else if (focos.length > 1 || mencionados.length > 1) juego = detectarJuego(pregunta, juegos);
      else if (!mencionados.length || mencionados[0] === contexto.juego) juego = contexto.juego;
      else juego = contexto.respuesta && mencionaJuego(contexto.respuesta, mencionados[0])
        ? contexto.juego : mencionados[0];
    }
  } catch (error) {
    error.estado = 422;
    throw error;
  }
  const anterior = contexto?.juego === juego ? contexto : undefined;
  // No se incorpora una respuesta generada al embedding ni se reformula con otro LLM.
  // Repetir el nombre del mismo juego no elimina el tema del intercambio anterior.
  const consultaBusqueda = mencionados.length && !anterior?.pregunta ? pregunta : [
    `Juego: ${juego}`,
    ...(anterior?.pregunta ? [`Pregunta anterior: ${anterior.pregunta}`] : []),
    `Pregunta actual: ${pregunta}`,
  ].join('\n');
  return { juego, contexto: anterior, consultaBusqueda };
}

export function construirPrompt(plantilla, { pregunta, fragmentos, contexto, preguntaResuelta }) {
  // Tras reformular, el generador recibe la pregunta explícita; no necesita la respuesta anterior.
  if (preguntaResuelta) contexto = undefined;
  const historial = contexto?.pregunta
    ? JSON.stringify({ juego: contexto.juego, preguntaAnterior: contexto.pregunta, respuestaAnterior: contexto.respuesta })
    : 'Sin intercambio anterior.';
  const valores = { pregunta, fragmentos, contexto: historial,
    preguntaResuelta: preguntaResuelta ?? 'Sin reformulación. Respondé a la pregunta actual.' };
  // Una sola sustitución: el contenido no se interpreta como otra marca de plantilla.
  return plantilla.replace(/\{\{(pregunta|fragmentos|contexto|preguntaResuelta)\}\}/g, (_, nombre) => valores[nombre]);
}
