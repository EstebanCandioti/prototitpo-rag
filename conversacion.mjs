import { detectarJuego } from './detectar-juego.mjs';

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
  // Se reutiliza la detección original, incluso para nombres con tildes y alias.
  const mencionados = juegos.filter(juego => {
    try { return detectarJuego(pregunta, [juego]) === juego; } catch { return false; }
  });
  let juego;
  try {
    juego = mencionados.length || !contexto ? detectarJuego(pregunta, juegos) : contexto.juego;
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
