import { metadatoJuego } from '../../metadatos-juegos.mjs';
import { validarContexto, resolverConsulta, construirPrompt } from '../../conversacion.mjs';
import { reformularConsulta, validarPreguntaResuelta } from '../../reformular-consulta.mjs';
import { construirPlanContexto, limitesContexto } from '../../seleccionar-contexto.mjs';
import { formatearContexto, limpiarRespuesta, esAbstencion } from '../../contexto-respuesta.mjs';
import { errorAplicacion } from '../errores.mjs';

export const sinRespuesta = 'Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.';
export function validarPregunta(datos) {
  const pregunta = typeof datos?.pregunta === 'string' ? datos.pregunta.trim() : '';
  if (!pregunta || pregunta.length > 1000) throw errorAplicacion(400, 'PREGUNTA_INVALIDA', 'Escribí una pregunta de hasta 1000 caracteres');
  return pregunta;
}
export function crearRag({ juegos, plantilla, embedding, fragmentos, responder }) {
  function resolver(datos) {
    const pregunta = validarPregunta(datos);
    const contexto = validarContexto(datos.contexto, juegos);
    const consulta = { pregunta, ...resolverConsulta(pregunta, contexto, juegos) };
    if (datos.preguntaResuelta !== undefined) {
      consulta.preguntaResuelta = validarPreguntaResuelta(datos.preguntaResuelta, consulta.juego, juegos);
      consulta.consultaBusqueda = consulta.preguntaResuelta;
    }
    return consulta;
  }
  async function recuperar(datos) {
    const { pregunta, juego, consultaBusqueda, preguntaResuelta } = resolver(datos);
    const k = Number(datos.k);
    if (!Number.isInteger(k) || k < 1 || k > limitesContexto.candidatos) {
      throw errorAplicacion(400, 'CANDIDATOS_INVALIDOS', `La cantidad de candidatos debe estar entre 1 y ${limitesContexto.candidatos}`);
    }
    const inicio = performance.now();
    const vector = await embedding(consultaBusqueda);
    const conVector = performance.now();
    const resultados = (await fragmentos.buscar(vector, juego, k)).filter(f => f.juego === juego);
    const conCandidatos = performance.now();
    let planContexto;
    if (datos.ampliar === true && resultados.length) {
      const rows = await fragmentos.secciones(juego);
      const origenes = new Set(resultados.map(f => f.origen));
      planContexto = construirPlanContexto({ pregunta: preguntaResuelta ?? pregunta, juego, resultados,
        fragmentos: rows.filter(f => f.juego === juego && origenes.has(f.origen)) });
    }
    return { juego, metadatos: metadatoJuego(juego), consultaBusqueda, preguntaResuelta, resultados, planContexto,
      tiempos: { embedding: Math.round(conVector - inicio), busqueda: Math.round(conCandidatos - conVector), secciones: Math.round(performance.now() - conCandidatos) } };
  }
  async function responderSeleccion(datos, generar = responder) {
    const { pregunta, juego, contexto, preguntaResuelta } = resolver(datos);
    const ids = datos.ids;
    if (!Array.isArray(ids) || ids.length > limitesContexto.fragmentos || ids.some(id => !Number.isInteger(id) || id < 1)) {
      throw errorAplicacion(400, 'SELECCION_INVALIDA', 'La selección de fragmentos no es válida');
    }
    if (!ids.length) return { respuesta: sinRespuesta, modeloInvocado: false, sinRespuesta: true, fuentes: [] };
    const rows = await fragmentos.porIds(juego, ids);
    const porId = new Map(rows.filter(f => f.juego === juego).map(r => [r.id, r]));
    if (new Set(ids).size !== ids.length || ids.some(id => !porId.has(id))) {
      throw errorAplicacion(400, 'SELECCION_AJENA', 'La selección no corresponde al juego indicado');
    }
    const seleccion = ids.map(id => porId.get(id));
    if (seleccion.reduce((n, f) => n + f.texto.length, 0) > limitesContexto.caracteres) {
      throw errorAplicacion(400, 'CONTEXTO_EXTENSO', 'El contexto seleccionado supera el límite de texto. Ajustá la selección en Modo de pruebas.');
    }
    const texto = formatearContexto(seleccion);
    const prompt = construirPrompt(plantilla, { pregunta, fragmentos: texto, contexto, preguntaResuelta });
    const inicio = performance.now();
    const respuestaOriginal = await generar(prompt);
    const respuesta = limpiarRespuesta(respuestaOriginal);
    if (!respuesta) throw new Error('El proveedor devolvió una respuesta vacía');
    const abstencion = esAbstencion(respuesta);
    return { respuesta: abstencion ? sinRespuesta : respuesta, respuestaOriginal,
      duracionMs: Math.round(performance.now() - inicio), caracteresContexto: texto.length,
      modeloInvocado: true, sinRespuesta: abstencion, fuentes: abstencion ? [] : seleccion };
  }
  return { resolver, recuperar, responderSeleccion,
    detectar: datos => { const { juego } = resolver(datos); return { juego, metadatos: metadatoJuego(juego) }; },
    reformular: (datos, generar = responder) => reformularConsulta(resolver(datos), generar, juegos),
  };
}
