import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leerCorpus } from './leer-corpus.mjs';
import { trocearPorMarca } from './trocear.mjs';
import { MARCA } from './marca.mjs';
import { construirPlanContexto, seleccionarContexto, clasificarConsulta } from './seleccionar-contexto.mjs';
import { formatearContexto, limpiarRespuesta, esAbstencion } from './contexto-respuesta.mjs';

const corpus = leerCorpus(await readFile('corpus/reglas_fournier.txt', 'utf8'));
let id = 0;
const filas = corpus.flatMap(j => trocearPorMarca(j.contenido, MARCA).map(f => ({ ...f, id: ++id, posicion: id - 1,
  juego: j.juego, origen: j.origen, seccion: f.seccion.replace(/^SECCION:\s*/, '') })));
export function casoContexto(juego, pregunta, puntuados) {
  const resultados = puntuados.map(([id, similitud]) => ({ ...filas.find(f => f.id === id), similitud }));
  const planContexto = construirPlanContexto({ pregunta, juego, resultados, fragmentos: filas.filter(f => f.juego === juego) });
  return { juego, resultados, planContexto };
}

test('Poker: los ocho candidatos reales recuperan una sola familia con las diez jugadas', () => {
  const r = casoContexto('Poker', '¿Cuáles son las combinaciones de cartas posibles en Poker?',
    [[170,.681],[169,.649],[166,.639],[171,.637],[175,.636],[162,.634],[172,.632],[173,.628]]);
  const s = seleccionarContexto(r, .55);
  assert.equal(r.planContexto.alcance.tipo, 'lista');
  assert.equal(s.grupos.length, 1); assert.equal(s.fuentes.length, 11);
  assert.deepEqual(s.ids, Array.from({ length: 11 }, (_, i) => 166 + i));
  assert.equal(s.ids.length, new Set(s.ids).size);
  assert.ok(s.fuentes.some(f => f.seccion.endsWith('Escalera de Color')));
  assert.ok(s.fuentes.some(f => f.seccion.endsWith('Dobles parejas')));
  assert.ok(!s.ids.includes(162));
  assert.ok(s.caracteres <= s.limites.caracteres);
});

test('Truco: una coincidencia con el fragmento 291 completa la sección con 290', () => {
  const r = casoContexto('El Truco', '¿Cuántos puntos vale cantar truco en El Truco?', [[291,.675]]);
  const s = seleccionarContexto(r, .55);
  assert.deepEqual(s.ids, [290,291]); assert.deepEqual(s.aceptados, [291]);
  assert.equal(s.fuentes[0].similitud, undefined);
  assert.match(formatearContexto(s.fuentes), /aumentando así su valor a 2 puntos/);
  const original = corpus.find(j => j.juego === 'El Truco').contenido;
  const completa = original.slice(original.indexOf('SECCION: Truco\n'), original.indexOf('\n\nSECCION: El tanteo'));
  assert.ok(formatearContexto(s.fuentes).includes(completa));
});

test('una pregunta puntual sobre full no arrastra todas las jugadas', () => {
  const r = casoContexto('Poker', '¿Qué es un full en Poker?', [[170,.681],[169,.649],[166,.639],[171,.637]]);
  const s = seleccionarContexto(r, .55);
  assert.equal(r.planContexto.alcance.tipo, 'puntual'); assert.deepEqual(s.ids, [170]);
});

test('reglas generales: cubre secciones básicas aunque solo una sea coincidencia inicial', () => {
  const juego = 'Texas Hold’em';
  const descripcion = filas.find(f => f.juego === juego && f.seccion === 'Descripción general');
  const r = casoContexto(juego, '¿Cómo son las reglas básicas de Texas Holdem?', [[descripcion.id,.61]]);
  const s = seleccionarContexto(r, .55);
  assert.equal(r.planContexto.alcance.tipo, 'general');
  for (const seccion of ['Objetivo del juego','Baraja de cartas','Número de jugadores']) assert.ok(s.fuentes.some(f => f.seccion === seccion));
  assert.ok(s.fuentes.some(f => f.texto.includes('dos cartas boca abajo')));
  assert.ok(s.fuentes.every(f => f.juego === juego));
});

test('sin coincidencias por encima del corte no hay contexto; ajustar el corte no modifica la recuperación', () => {
  const r = casoContexto('El Truco', '¿Cuánto vale el truco?', [[291,.675]]);
  const antes = JSON.stringify(r);
  assert.deepEqual(seleccionarContexto(r, .9).ids, []);
  assert.deepEqual(seleccionarContexto(r, .6).ids, [290,291]);
  assert.equal(JSON.stringify(r), antes);
  assert.deepEqual(seleccionarContexto(r, .6, 'fragmentos').ids, [291]);
});

test('las secciones se deduplican, se separan por origen y no incorporan otro juego', () => {
  const r = casoContexto('Poker', '¿Qué combinaciones existen en Poker?', [[170,.7],[171,.69],[175,.68]]);
  const inyectado = { ...filas.find(f => f.juego === 'El Truco'), id: 9001 };
  const plan = construirPlanContexto({ pregunta: '¿Qué combinaciones existen en Poker?', juego: 'Poker', resultados: r.resultados,
    fragmentos: [...filas.filter(f => f.juego === 'Poker'), inyectado,
      { ...r.resultados[0], id: 9002, origen: 'https://otro-origen.example' }] });
  const s = seleccionarContexto({ ...r, planContexto: plan }, .55);
  assert.equal(s.grupos.length, 1); assert.equal(s.ids.length, new Set(s.ids).size);
  assert.ok(!s.ids.includes(9001)); assert.ok(!s.ids.includes(9002));
});

test('el presupuesto omite una sección demasiado larga sin cortarla ni seleccionar solo una parte', () => {
  const r = casoContexto('Poker', '¿Qué combinaciones existen en Poker?', [[170,.7]]);
  r.planContexto.limites.caracteres = 100;
  const s = seleccionarContexto(r, .55);
  assert.equal(s.ids.length, 0); assert.match(s.descartados[0].motivo, /presupuesto/);
});

test('la clasificación diferencia reglas generales, procedimientos y comparaciones', () => {
  for (const [pregunta, tipo] of [
    ['¿Cómo se juega al Poker?', 'general'], ['¿Cuáles son las reglas del Poker?', 'general'],
    ['¿Cómo se calcula el envido en Poker?', 'procedimiento'], ['¿Qué gana, full o color en Poker?', 'comparacion'],
    ['¿Cuántas cartas se reparten en Poker?', 'puntual'],
  ]) assert.equal(clasificarConsulta(pregunta, 'Poker').tipo, tipo, pregunta);
  assert.equal(clasificarConsulta('¿Cómo se juega al Texas Holdem?', 'Texas Hold’em').tipo, 'general');
});

test('comparar cuál jugada gana conserva la familia y el orden establecidos por el documento', () => {
  const r = casoContexto('Poker', '¿Qué gana en Poker, full o color?', [[170,.7],[171,.69],[169,.65],[166,.63]]);
  const s = seleccionarContexto(r, .55);
  assert.deepEqual(s.ids, Array.from({ length: 11 }, (_, i) => 166 + i));
  assert.match(formatearContexto(s.fuentes), /orden de mayor a menor/i);
});

test('comparar definiciones conserva las categorías consultadas y su introducción', () => {
  const r = casoContexto('Poker', '¿Cuál es la diferencia entre full y color en Poker?', [[170,.7],[171,.69],[169,.65],[166,.63]]);
  assert.deepEqual(seleccionarContexto(r, .55).ids, [166,170,171]);
});

test('las reglas generales de los 27 juegos caben en el presupuesto sin perder secciones', () => {
  for (const juego of corpus.map(j => j.juego)) {
    const ancla = filas.find(f => f.juego === juego);
    const r = casoContexto(juego, `¿Cómo se juega a ${juego}?`, [[ancla.id,.65]]);
    const s = seleccionarContexto(r, .55);
    assert.equal(r.planContexto.alcance.tipo, 'general', juego);
    assert.equal(s.descartados.length, 0, juego);
    assert.ok(s.ids.length <= s.limites.fragmentos && s.caracteres <= s.limites.caracteres, juego);
    assert.ok(s.fuentes.every(f => f.juego === juego), juego);
  }
});

test('retirar fuentes intercaladas no elimina el resto de una respuesta válida', () => {
  const limpio = limpiarRespuesta('Truco: 2 puntos.\nFuente: inventada\nRetruco: 3 puntos.\nFuente:\n--- Otra cita ---\n\nVale cuatro: 4 puntos.');
  assert.match(limpio, /Truco: 2/); assert.match(limpio, /Retruco: 3/); assert.match(limpio, /Vale cuatro: 4/);
  assert.doesNotMatch(limpio, /inventada|Otra cita|Fuente/);
  assert.equal(esAbstencion('Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.'), true);
  assert.equal(esAbstencion('No encontré esa respuesta en las reglas disponibles.'), true);
  assert.equal(esAbstencion('No lo encuentro en los documentos.'), true);
  assert.equal(esAbstencion('No lo encuentro en los documentos.\nTruco: dos puntos.'), false);
});
