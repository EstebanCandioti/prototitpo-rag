// Reproduce candidatos conocidos con el corpus local, sin consultar ni modificar PostgreSQL.
// --llm agrega una generación real por caso con el proveedor configurado en .env.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leerCorpus } from './leer-corpus.mjs';
import { trocearPorMarca } from './trocear.mjs';
import { MARCA } from './marca.mjs';
import { construirPlanContexto, seleccionarContexto } from './seleccionar-contexto.mjs';
import { construirPrompt } from './conversacion.mjs';
import { formatearContexto, limpiarRespuesta, esAbstencion } from './contexto-respuesta.mjs';

const corpus = leerCorpus(await readFile(new URL('./corpus/reglas_fournier.txt', import.meta.url), 'utf8'));
let id = 0;
const filas = corpus.flatMap(j => trocearPorMarca(j.contenido, MARCA).map(f => ({ ...f, id: ++id, posicion: id - 1,
  juego: j.juego, origen: j.origen, seccion: f.seccion.replace(/^SECCION:\s*/, '') })));
const seccion = (juego, nombre) => filas.find(f => f.juego === juego && f.seccion === nombre).id;
const casos = [
  { nombre: 'Poker: listado con los ocho resultados reportados', juego: 'Poker',
    pregunta: '¿Cuáles son las combinaciones de cartas posibles en Poker?',
    candidatos: [[170,.681],[169,.649],[166,.639],[171,.637],[175,.636],[162,.634],[172,.632],[173,.628]],
    contieneIds: [167,168,170,174,176], respuesta: [/escalera de color/i, /dobles? parejas?/i, /carta (?:m[aá]s alta|mayor)/i, /full/i] },
  { nombre: 'Poker: pregunta específica sin ampliar a todas las jugadas', juego: 'Poker', pregunta: '¿Qué es un full en Poker?',
    candidatos: [[170,.681],[169,.649],[166,.639],[171,.637]], ids: [170], respuesta: [/tres|tr[ií]o/i, /dos|pareja/i] },
  { nombre: 'Poker: comparación entre dos jugadas', juego: 'Poker', pregunta: '¿Qué gana en Poker, full o color?',
    candidatos: [[170,.7],[171,.69],[169,.65],[166,.63]], contieneIds: [170,171], respuesta: [/full/i, /color/i],
    contextoContiene: /orden de mayor a menor/i },
  { nombre: 'Truco: completar el comienzo de la sección ausente en la búsqueda', juego: 'El Truco',
    pregunta: '¿Cuántos puntos vale cantar truco en El Truco?', candidatos: [[291,.675]], ids: [290,291], respuesta: [/2|dos/i] },
  { nombre: 'Texas: reglas generales desde una sola coincidencia', juego: 'Texas Hold’em', pregunta: '¿Cómo se juega al Texas Holdem?',
    candidatos: [[seccion('Texas Hold’em','Descripción general'),.61]], alcance: 'general', respuesta: [/dos|2/i, /52/, /apuest/i, /combinaci[oó]n/i] },
  { nombre: 'Truco: reglas generales desde una sola coincidencia', juego: 'El Truco', pregunta: '¿Cómo se juega al Truco?',
    candidatos: [[291,.65]], respuesta: [/tres|3/i, /30|treinta/i, /envido/i] },
  { nombre: 'Guiñote: victoria con tute de sotas o reyes', juego: 'El Guiñote', pregunta: '¿Cómo se gana en el Guiñote?',
    candidatos: [[seccion('El Guiñote','Objetivo del juego'),.7]],
    contextoContiene: /Tute de sotas/, respuesta: [/sotas/i, /reyes/i, /101/], respuestaNo: [/tute de caballos/i] },
  { nombre: 'Texas: abstenerse sin usar las combinaciones documentadas para otro juego', juego: 'Texas Hold’em',
    pregunta: '¿Qué combinaciones de cartas existen en Texas Holdem?',
    candidatos: [[seccion('Texas Hold’em','Objetivo del juego'),.68],[seccion('Texas Hold’em','Orden y valor de las cartas'),.64]], abstencion: true },
];
const usarModelo = process.argv.includes('--llm');
const filtro = process.argv.find(a => a.startsWith('--caso='))?.slice('--caso='.length);
if (filtro && !casos.some(c => c.nombre.includes(filtro))) throw new Error('No existe ese caso de evaluación.');
const plantilla = await readFile(new URL('./prompt.txt', import.meta.url), 'utf8');
const proveedor = usarModelo ? await import('./api.mjs') : null;
const informe = [];
for (const caso of casos.filter(c => !filtro || c.nombre.includes(filtro))) {
  const resultados = caso.candidatos.map(([id, similitud]) => ({ ...filas.find(f => f.id === id), similitud }));
  const planContexto = construirPlanContexto({ pregunta: caso.pregunta, juego: caso.juego, resultados, fragmentos: filas });
  const seleccion = seleccionarContexto({ juego: caso.juego, resultados, planContexto }, .55);
  const fragmentos = formatearContexto(seleccion.fuentes);
  const registro = { caso: caso.nombre, pregunta: caso.pregunta, alcance: planContexto.alcance.tipo,
    candidatos: resultados.map(f => f.id), ids: seleccion.ids, caracteres: fragmentos.length, correcto: true };
  try {
    if (caso.alcance) assert.equal(planContexto.alcance.tipo, caso.alcance);
    if (caso.ids) assert.deepEqual(seleccion.ids, caso.ids);
    for (const id of caso.contieneIds ?? []) assert.ok(seleccion.ids.includes(id), `Falta #${id}`);
    if (caso.contextoContiene) assert.match(fragmentos, caso.contextoContiene);
    assert.ok(seleccion.fuentes.every(f => f.juego === caso.juego));
    assert.ok(seleccion.caracteres <= seleccion.limites.caracteres);
    assert.deepEqual(seleccionarContexto({ resultados, planContexto }, .99).ids, []);
    if (proveedor) {
      const inicio = performance.now();
      registro.respuesta = limpiarRespuesta(await proveedor.responder(construirPrompt(plantilla, { pregunta: caso.pregunta, fragmentos })));
      registro.duracionMs = Math.round(performance.now() - inicio);
      assert.equal(esAbstencion(registro.respuesta), Boolean(caso.abstencion));
      for (const esperado of caso.respuesta ?? []) assert.match(registro.respuesta, esperado);
      for (const prohibido of caso.respuestaNo ?? []) assert.doesNotMatch(registro.respuesta, prohibido);
    }
  } catch (error) {
    registro.correcto = false;
    // No guardar objetos del proveedor ni variables de entorno en el informe.
    registro.error = error.code === 'ERR_ASSERTION' ? error.message : 'Falló la llamada al proveedor.';
  }
  informe.push(registro);
}
console.log(JSON.stringify({ modo: usarModelo ? 'Generación real con candidatos reproducidos; sin recuperación vectorial real.'
  : 'Selección offline con candidatos reproducidos; sin llamadas a servicios.', casos: informe }, null, 2));
if (informe.some(c => !c.correcto)) process.exitCode = 1;
