// Medición aislada: ejecuta llamadas reales a Gemini con el prompt y corpus actuales.
// No consulta PostgreSQL, no usa Ollama y no cambia la configuración de la aplicación.
// node --env-file=.env medir-costos.mjs [--caso=texto]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { leerCorpus } from './leer-corpus.mjs';
import { trocearPorMarca } from './trocear.mjs';
import { MARCA } from './marca.mjs';
import { construirPlanContexto, seleccionarContexto } from './seleccionar-contexto.mjs';
import { formatearContexto, limpiarRespuesta } from './contexto-respuesta.mjs';
import { construirPrompt, resolverConsulta } from './conversacion.mjs';
import { reformularConsulta } from './reformular-consulta.mjs';

const modelo = process.env.MODELO_CHAT;
if ((process.env.PROVEEDOR_CHAT ?? 'gemini') !== 'gemini' || modelo !== 'gemini-3.5-flash-lite') {
  throw new Error('Estas tarifas son únicamente para gemini-3.5-flash-lite. Revisalas antes de medir otro modelo.');
}
if (!process.env.API_KEY) throw new Error('Falta API_KEY en el entorno del backend.');
const tarifas = { fecha: '2026-11-04', moneda: 'USD', entradaPorMillon: .30, salidaPorMillon: 2.50, entradaCachePorMillon: .03,
  fuente: 'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite' };
const corpus = leerCorpus(await readFile(new URL('./corpus/reglas_fournier.txt', import.meta.url), 'utf8'));
const plantilla = await readFile(new URL('./prompt.txt', import.meta.url), 'utf8');
let id = 0;
const filas = corpus.flatMap(j => trocearPorMarca(j.contenido, MARCA).map(f => ({ ...f, id: ++id, posicion: id - 1,
  juego: j.juego, origen: j.origen, seccion: f.seccion.replace(/^SECCION:\s*/, '') })));
const juegos = corpus.map(j => j.juego);
const candidatosPoker = [[170,.681],[169,.649],[166,.639],[171,.637],[175,.636],[162,.634],[172,.632],[173,.628]];
const contextoTruco = { juego: 'El Truco', pregunta: '¿Cuándo puedo cantar truco en El Truco?',
  respuesta: 'El truco puede declararse en cualquier momento de la mano.' };
const casos = [
  { tipo: 'Puntual: definición de full', juego: 'Poker', pregunta: '¿Qué es un full en Poker?', candidatos: candidatosPoker },
  { tipo: 'Puntual: puntos del truco', juego: 'El Truco', pregunta: '¿Cuántos puntos vale cantar truco en El Truco?', candidatos: [[291,.675]] },
  { tipo: 'Listado: combinaciones de Poker', juego: 'Poker', pregunta: '¿Cuáles son las combinaciones de cartas posibles en Poker?', candidatos: candidatosPoker },
  { tipo: 'Comparación: full o color', juego: 'Poker', pregunta: '¿Qué gana en Poker, full o color?', candidatos: [[170,.7],[171,.69],[169,.65],[166,.63]] },
  { tipo: 'Procedimiento: calcular el envido', juego: 'El Truco', pregunta: '¿Cómo se calcula el envido en El Truco?', candidatos: [[288,.7],[289,.67]] },
  { tipo: 'General: reglas de Texas', juego: 'Texas Hold’em', pregunta: '¿Cómo se juega al Texas Holdem?', candidatos: [[228,.61]] },
  { tipo: 'General: reglas de Truco', juego: 'El Truco', pregunta: '¿Cómo se juega al Truco?', candidatos: [[291,.65]] },
  { tipo: 'Abstención del modelo: combinaciones de Texas', juego: 'Texas Hold’em', pregunta: '¿Qué combinaciones de cartas existen en Texas Holdem?', candidatos: [[229,.68],[232,.64]] },
  { tipo: 'Seguimiento: ¿y cuánto vale?', juego: 'El Truco', pregunta: '¿Y cuánto vale?', candidatos: [[291,.675]], contexto: contextoTruco },
  { tipo: 'Sin candidatos aceptados: primera pregunta', juego: 'El Truco', pregunta: '¿Cuántos puntos vale cantar truco en El Truco?', candidatos: [[291,.4]] },
  { tipo: 'Sin candidatos aceptados: seguimiento', juego: 'El Truco', pregunta: '¿Y cuánto vale?', candidatos: [[291,.4]], contexto: contextoTruco },
];
const filtro = process.argv.find(a => a.startsWith('--caso='))?.slice('--caso='.length);
const elegidos = casos.filter(c => !filtro || c.tipo.includes(filtro));
if (!elegidos.length) throw new Error('No existe ese caso de medición.');
const salida = new URL('./mediciones/costos-2026-11-04.json', import.meta.url);
const informe = { fechaTarifas: tarifas.fecha, modelo, tarifas,
  alcance: 'Consumo real de generación con candidatos reproducidos del corpus. No mide ranking SQL ni activa facturación. Una muestra por caso.',
  excluye: ['Electricidad y hardware de Ollama', 'PostgreSQL y alojamiento', 'Impuestos y conversión de moneda', 'Indexación y embeddings remotos'],
  casos: [] };
await mkdir(new URL('./mediciones/', import.meta.url), { recursive: true });

for (const caso of elegidos) {
  const registro = { tipo: caso.tipo, pregunta: caso.pregunta, llamadas: [], ids: [], caracteresContexto: 0 };
  async function responderMedido(prompt, tarea) {
    // Mismo cuerpo de petición que api.mjs; se conserva usageMetadata para medir.
    const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(45000),
    });
    if (!respuesta.ok) throw new Error(`La API respondió HTTP ${respuesta.status}. Se detiene la medición sin reintentar.`);
    const datos = await respuesta.json();
    const uso = datos.usageMetadata;
    if (!Number.isInteger(uso?.promptTokenCount) || !Number.isInteger(uso?.candidatesTokenCount)) {
      throw new Error('La API no devolvió el consumo esperado; no se calcula un costo ficticio.');
    }
    const entrada = uso.promptTokenCount;
    const salida = uso.candidatesTokenCount;
    const pensamiento = uso.thoughtsTokenCount ?? 0;
    const cache = uso.cachedContentTokenCount ?? 0;
    const costoSinCache = (entrada * tarifas.entradaPorMillon + (salida + pensamiento) * tarifas.salidaPorMillon) / 1e6;
    const costoConCache = ((entrada - cache) * tarifas.entradaPorMillon + cache * tarifas.entradaCachePorMillon + (salida + pensamiento) * tarifas.salidaPorMillon) / 1e6;
    const texto = datos.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
    registro.llamadas.push({ tarea, caracteresPrompt: prompt.length, modeloDevuelto: datos.modelVersion, uso,
      tokensEntrada: entrada, tokensSalida: salida, tokensRazonamiento: pensamiento, tokensCache: cache,
      costoSinCacheUsd: costoSinCache, costoConCacheUsd: costoConCache,
      respuesta: texto, fin: datos.candidates?.[0]?.finishReason });
    if (!texto) throw new Error('La API devolvió consumo pero no una respuesta de texto.');
    return texto;
  }
  try {
    let preguntaResuelta;
    if (caso.contexto) {
      const reformulacion = await reformularConsulta({ pregunta: caso.pregunta, juego: caso.juego, contexto: caso.contexto },
        prompt => responderMedido(prompt, 'interpretacion'), juegos);
      preguntaResuelta = reformulacion.preguntaResuelta;
    }
    registro.preguntaResuelta = preguntaResuelta;
    const resultados = caso.candidatos.map(([id, similitud]) => ({ ...filas.find(f => f.id === id), similitud }));
    const planContexto = construirPlanContexto({ pregunta: preguntaResuelta ?? caso.pregunta, juego: caso.juego, resultados, fragmentos: filas });
    const seleccion = seleccionarContexto({ juego: caso.juego, resultados, planContexto }, .55);
    registro.ids = seleccion.ids;
    registro.alcance = planContexto.alcance.tipo;
    registro.consultaEmbedding = preguntaResuelta ?? resolverConsulta(caso.pregunta, caso.contexto, juegos).consultaBusqueda;
    if (seleccion.ids.length) {
      const fragmentos = formatearContexto(seleccion.fuentes);
      registro.caracteresContexto = fragmentos.length;
      const prompt = construirPrompt(plantilla, { pregunta: caso.pregunta, fragmentos, contexto: caso.contexto, preguntaResuelta });
      registro.respuesta = limpiarRespuesta(await responderMedido(prompt, 'respuesta'));
    } else registro.respuesta = 'Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.';
  } catch (error) {
    registro.error = error.message.includes('API') ? error.message : 'No se pudo completar esta muestra.';
  }
  registro.costoSinCacheUsd = registro.llamadas.reduce((s, l) => s + l.costoSinCacheUsd, 0);
  registro.costoConCacheUsd = registro.llamadas.reduce((s, l) => s + l.costoConCacheUsd, 0);
  registro.porMilConsultasSinCacheUsd = registro.costoSinCacheUsd * 1000;
  informe.casos.push(registro);
  await writeFile(salida, JSON.stringify(informe, null, 2) + '\n');
  console.log(JSON.stringify({ tipo: caso.tipo, fragmentos: registro.ids.length, llamadas: registro.llamadas.length,
    entrada: registro.llamadas.reduce((s,l) => s+l.tokensEntrada, 0), salida: registro.llamadas.reduce((s,l) => s+l.tokensSalida, 0),
    razonamiento: registro.llamadas.reduce((s,l) => s+l.tokensRazonamiento, 0),
    costoUsd: registro.costoSinCacheUsd, porMilUsd: registro.porMilConsultasSinCacheUsd, error: registro.error }));
  if (registro.error) { process.exitCode = 1; break; }
}
