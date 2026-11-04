import { test } from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crearServidor } from './web-handler.mjs';
import { leerCorpus } from './leer-corpus.mjs';
import { metadatoJuego } from './metadatos-juegos.mjs';
import { construirPrompt } from './conversacion.mjs';

const corpus = leerCorpus(await readFile('corpus/reglas_fournier.txt', 'utf8'));
const plantilla = await readFile('prompt.txt', 'utf8');
const filas = [
  { id: 1, juego: 'El Truco', seccion: 'Envido', origen: 'https://example.org/truco', texto: 'Regla del envido.', similitud: .72 },
  { id: 2, juego: 'El Truco', seccion: 'Reparto', origen: 'https://example.org/truco', texto: 'Regla del reparto.', similitud: .53 },
  { id: 3, juego: 'La Brisca', seccion: 'Reparto', origen: 'https://example.org/brisca', texto: 'Otra regla.', similitud: .9 },
];
async function iniciar(t, cambios = {}) {
  const llamadas = { embedding: 0, textosEmbedding: [], buscar: [], sql: [], prompts: [] };
  const servidor = crearServidor({
    juegos: corpus.map(r => r.juego), umbralInicial: .55, plantilla, dist: fileURLToPath(new URL('./frontend/dist/', import.meta.url)),
    embedding: async texto => { llamadas.embedding++; llamadas.textosEmbedding.push(texto); return [1, 0]; },
    buscar: async (v, juego, k) => { llamadas.buscar.push({ juego, k }); return filas.filter(f => f.juego === juego).slice(0, k); },
    db: { query: async (sql, [juego, ids]) => {
      llamadas.sql.push({ sql, juego, ids }); return { rows: filas.filter(f => f.juego === juego && ids.includes(f.id)) };
    } },
    responder: async prompt => { llamadas.prompts.push(prompt); return 'Respuesta de prueba.\nFuente: inventada'; },
    ...cambios,
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); }));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  async function post(ruta, datos, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = request(`${base}/api/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, res => {
        let texto = ''; res.setEncoding('utf8'); res.on('data', parte => texto += parte);
        res.on('end', () => resolve({ status: res.statusCode, datos: JSON.parse(texto) }));
      });
      req.on('error', reject); req.end(JSON.stringify(datos));
    });
  }
  return { llamadas, post, base };
}

test('configuración, detección, selección SQL y fuentes del juego correcto', async t => {
  const { post, base, llamadas } = await iniciar(t);
  assert.equal((await (await fetch(`${base}/api/juegos`)).json()).umbralInicial, .55);
  const r = await post('recuperar', { pregunta: 'En el truco, ¿cómo es el envido?', k: 2 });
  assert.equal(r.status, 200); assert.equal(r.datos.juego, 'El Truco');
  assert.equal(r.datos.metadatos.baraja, 'espanola');
  assert.deepEqual(llamadas.buscar, [{ juego: 'El Truco', k: 2 }]);
  assert.equal(llamadas.prompts.length, 0);
  const a = await post('responder', { pregunta: 'En el truco, ¿cómo es el envido?', ids: [1] });
  assert.equal(a.status, 200); assert.doesNotMatch(a.datos.respuesta, /inventada/); assert.deepEqual(a.datos.fuentes.map(f => f.id), [1]);
  assert.ok(a.datos.fuentes.every(f => f.juego === 'El Truco'));
  assert.deepEqual(llamadas.sql[0].ids, [1]); assert.match(llamadas.sql[0].sql, /WHERE juego = \$1/);
  assert.match(llamadas.prompts[0], /Regla del envido/);
  assert.doesNotMatch(llamadas.prompts[0], /Regla del reparto|Otra regla/);
  assert.equal(llamadas.embedding, 1);
});
test('detección temprana devuelve baraja sin embedding, SQL ni LLM; mantiene validación y Origin', async t => {
  const { post, llamadas } = await iniciar(t);
  for (const [pregunta, juego, baraja] of [
    ['¿Cómo se juega al Truco?', 'El Truco', 'espanola'],
    ['¿Cuántas cartas en Poker?', 'Poker', 'inglesa-francesa'],
    ['¿Cómo jugar Continental?', 'Continental', 'general'],
  ]) {
    const r = await post('detectar', { pregunta });
    assert.equal(r.status, 200); assert.equal(r.datos.juego, juego); assert.equal(r.datos.metadatos.baraja, baraja);
  }
  for (const pregunta of ['¿Qué puedo cantar?', '¿Truco o Poker?']) {
    assert.equal((await post('detectar', { pregunta })).status, 422);
  }
  assert.equal((await post('detectar', { pregunta: '' })).status, 400);
  assert.equal((await post('detectar', { pregunta: '¿Truco?' }, { Origin: 'http://evil.example' })).status, 403);
  assert.deepEqual(llamadas, { embedding: 0, textosEmbedding: [], buscar: [], sql: [], prompts: [] });
});
test('sin juego, varios juegos, selección ajena, duplicada o vacía', async t => {
  const { post, llamadas } = await iniciar(t);
  for (const pregunta of ['¿Cómo se juega?', '¿Truco o Brisca?']) {
    assert.equal((await post('recuperar', { pregunta, k: 2 })).status, 422);
  }
  assert.equal(llamadas.embedding, 0);
  for (const ids of [[3], [1, 1], [999], ['1']]) {
    assert.equal((await post('responder', { pregunta: '¿Cómo se juega al Truco?', ids })).status, 400);
  }
  const vacio = await post('responder', { pregunta: '¿Cómo se juega al Truco?', ids: [] });
  assert.equal(vacio.datos.modeloInvocado, false); assert.equal(vacio.datos.sinRespuesta, true);
  assert.deepEqual(vacio.datos.fuentes, []); assert.equal(llamadas.prompts.length, 0);
});
test('abstención del modelo no conserva fuentes', async t => {
  const { post } = await iniciar(t, { responder: async () => 'No lo encuentro en los documentos.' });
  const r = await post('responder', { pregunta: '¿Qué dice Truco?', ids: [1] });
  assert.equal(r.datos.sinRespuesta, true); assert.deepEqual(r.datos.fuentes, []);
});
test('Origin acepta mismo origen y el proxy conservando Host; rechaza terceros', async t => {
  const { post, base } = await iniciar(t);
  const datos = { pregunta: '¿Qué dice Truco?', ids: [] };
  assert.equal((await post('responder', datos, { Origin: base })).status, 200);
  assert.equal((await post('responder', datos, { Origin: 'http://127.0.0.1:5173', Host: '127.0.0.1:5173' })).status, 200);
  for (const Origin of ['http://evil.example', 'null', 'invalid', 'https://127.0.0.1:5173']) {
    assert.equal((await post('responder', datos, { Origin })).status, 403);
  }
});
test('Codespaces acepta únicamente el origen HTTPS configurado, sin confiar en encabezados reenviados', async t => {
  const origenPublico = 'https://demo-entre-cartas-3000.app.github.dev';
  const { post } = await iniciar(t, { origenPublico });
  const datos = { pregunta: '¿Cómo se juega al Truco?', ids: [] };
  assert.equal((await post('responder', datos, { Origin: origenPublico })).status, 200);
  for (const origen of ['https://otro-3000.app.github.dev', 'https://demo-entre-cartas-5173.app.github.dev', 'http://demo-entre-cartas-3000.app.github.dev', 'https://evil.example', origenPublico + '/ruta']) {
    assert.equal((await post('responder', datos, { Origin: origen, 'X-Forwarded-Host': 'demo-entre-cartas-3000.app.github.dev', 'X-Forwarded-Proto': 'https' })).status, 403);
  }
});
test('mensajes específicos cuando PostgreSQL u Ollama no están disponibles', async t => {
  const db = await iniciar(t, { buscar: async () => { throw Object.assign(new Error('DB apagada'), { code: 'ECONNREFUSED' }); } });
  const ollama = await iniciar(t, { embedding: async () => { throw new Error('No contesta nadie. ¿Está abierto Ollama?'); } });
  for (const [servicio, nombre] of [[db, 'PostgreSQL'], [ollama, 'Ollama']]) {
    const r = await servicio.post('recuperar', { pregunta: '¿Qué dice Truco?', k: 2 });
    assert.equal(r.status, 500); assert.match(r.datos.error, new RegExp(`${nombre} no está disponible`));
  }
});
test('metadatos revisados y fallback de variantes', () => {
  for (const { juego } of corpus) assert.ok(metadatoJuego(juego).nota);
  assert.equal(metadatoJuego('Texas Hold’em').baraja, 'inglesa-francesa');
  for (const juego of ['Continental', 'Remigio', 'La Butifarra', 'La Manilla', 'Desconocido']) {
    assert.equal(metadatoJuego(juego).baraja, 'general');
  }
});

test('seguimiento sin nombre: un embedding contextual y una generación con el último intercambio', async t => {
  const { post, llamadas } = await iniciar(t);
  const contexto = { juego: 'El Truco', pregunta: 'En el truco, ¿cuánto vale el retruco?', respuesta: 'El retruco aceptado vale tres puntos.' };
  const pregunta = '¿Y si no lo acepto?';
  assert.equal((await post('detectar', { pregunta, contexto })).datos.juego, 'El Truco');
  assert.equal(llamadas.embedding, 0); assert.equal(llamadas.prompts.length, 0);
  const r = await post('recuperar', { pregunta, contexto, k: 2 });
  assert.equal(r.status, 200);
  assert.match(r.datos.consultaBusqueda, /Juego: El Truco\nPregunta anterior:.*retruco/);
  assert.match(r.datos.consultaBusqueda, /Pregunta actual: ¿Y si no lo acepto\?/);
  assert.doesNotMatch(llamadas.textosEmbedding[0], /aceptado vale tres puntos/);
  const a = await post('responder', { pregunta, contexto, ids: [1] });
  assert.equal(a.status, 200); assert.equal(llamadas.embedding, 1); assert.equal(llamadas.prompts.length, 1);
  const prompt = llamadas.prompts[0];
  assert.match(prompt, /preguntaAnterior.*cuánto vale el retruco/);
  assert.match(prompt, /respuestaAnterior.*aceptado vale tres puntos/);
  assert.match(prompt, /PREGUNTA:\s*¿Y si no lo acepto\?/);
  assert.match(prompt, /fundamentá las reglas en los FRAGMENTOS, no en la respuesta anterior/);
  assert.doesNotMatch(prompt, /Regla del reparto|Otra regla|\{\{contexto\}\}/);
  assert.deepEqual(a.datos.fuentes.map(f => f.id), [1]);
});

test('mencionar otro juego descarta el historial y mantiene SQL y fuentes del nuevo juego', async t => {
  const { post, llamadas } = await iniciar(t);
  const contexto = { juego: 'El Truco', pregunta: '¿Qué dice el truco?', respuesta: 'RECUERDO_EXCLUSIVO_DEL_TRUCO' };
  const pregunta = '¿Cómo se juega a la Brisca?';
  assert.equal((await post('detectar', { pregunta, contexto })).datos.juego, 'La Brisca');
  await post('recuperar', { pregunta, contexto, k: 2 });
  assert.deepEqual(llamadas.textosEmbedding, [pregunta]);
  const a = await post('responder', { pregunta, contexto, ids: [3] });
  assert.equal(a.status, 200); assert.ok(a.datos.fuentes.every(f => f.juego === 'La Brisca'));
  assert.doesNotMatch(llamadas.prompts[0], /RECUERDO_EXCLUSIVO_DEL_TRUCO|Regla del envido/);
  assert.equal((await post('responder', { pregunta, contexto, ids: [1] })).status, 400);
});

test('repetir el juego conserva el tema del canto en la búsqueda y en la generación', async t => {
  const { post, llamadas } = await iniciar(t);
  const contexto = {
    juego: 'El Truco', pregunta: '¿Cuándo se puede cantar el truco?',
    respuesta: 'Se puede cantar truco en cualquier momento de la mano.',
  };
  const pregunta = '¿Cuánto vale el truco?';
  const r = await post('recuperar', { pregunta, contexto, k: 2 });
  assert.equal(r.status, 200);
  assert.equal(llamadas.embedding, 1);
  assert.match(llamadas.textosEmbedding[0], /Pregunta anterior: ¿Cuándo se puede cantar el truco\?/);
  assert.match(llamadas.textosEmbedding[0], /Pregunta actual: ¿Cuánto vale el truco\?/);
  const a = await post('responder', { pregunta, contexto, ids: [1] });
  assert.equal(a.status, 200); assert.equal(llamadas.prompts.length, 1);
  assert.match(llamadas.prompts[0], /aunque vuelva a mencionar el nombre del juego/);
  assert.match(llamadas.prompts[0], /solo si la duda sigue sin resolverse después de considerar ese contexto/);
  assert.match(llamadas.prompts[0], /preguntaAnterior.*Cuándo se puede cantar el truco/);
  assert.match(llamadas.prompts[0], /PREGUNTA:\s*¿Cuánto vale el truco\?/);
  assert.deepEqual(a.datos.fuentes.map(f => f.id), [1]);
});

test('contexto validado, múltiples juegos y ausencia de selección no invocan servicios indebidamente', async t => {
  const { post, llamadas } = await iniciar(t);
  for (const contexto of [[], 'texto', {}, { juego: 'Inexistente' },
    { juego: 'El Truco', pregunta: '¿Y ahora?' },
    { juego: 'El Truco', pregunta: 'x'.repeat(1001), respuesta: 'Respuesta' },
    { juego: 'El Truco', pregunta: 'Pregunta', respuesta: 'x'.repeat(4001) }]) {
    assert.equal((await post('detectar', { pregunta: '¿Y ahora?', contexto })).status, 400);
  }
  const contexto = { juego: 'El Truco' };
  assert.equal((await post('detectar', { pregunta: '¿Truco o Brisca?', contexto })).status, 422);
  assert.equal((await post('detectar', { pregunta: '¿Y ahora?' })).status, 422);
  assert.equal((await post('detectar', { pregunta: '¿Y ahora?', contexto })).datos.juego, 'El Truco');
  const a = await post('responder', { pregunta: '¿Y ahora?', contexto, ids: [] });
  assert.equal(a.datos.modeloInvocado, false); assert.deepEqual(a.datos.fuentes, []);
  assert.equal(llamadas.embedding, 0); assert.equal(llamadas.sql.length, 0); assert.equal(llamadas.prompts.length, 0);
});

test('la consola arma el prompt sin historial y los valores se sustituyen literalmente una sola vez', () => {
  const prompt = construirPrompt(plantilla, { pregunta: '¿Truco?', fragmentos: 'Texto literal $& {{pregunta}}' });
  assert.match(prompt, /Sin intercambio anterior\./);
  assert.ok(prompt.includes('Texto literal $& {{pregunta}}'));
  assert.match(prompt, /PREGUNTA:\s*¿Truco\?/);
  assert.ok(!prompt.includes('{{contexto}}'));
});

test('reformular omite el LLM en la primera consulta, con solo juego activo y al cambiar de juego', async t => {
  const { post, llamadas } = await iniciar(t);
  for (const datos of [
    { pregunta: '¿Cuándo se canta truco?' },
    { pregunta: '¿Cuándo se canta truco?', contexto: { juego: 'El Truco' } },
    { pregunta: '¿Qué dice la Brisca?', contexto: { juego: 'El Truco', pregunta: '¿Truco?', respuesta: 'Respuesta anterior.' } },
  ]) {
    const r = await post('reformular', datos);
    assert.equal(r.status, 200); assert.equal(r.datos.modeloInvocado, false);
    assert.equal(r.datos.preguntaResuelta, datos.pregunta);
  }
  assert.equal(llamadas.prompts.length, 0); assert.equal(llamadas.embedding, 0);
  await post('recuperar', { pregunta: '¿Cuándo se canta truco?', k: 8 });
  await post('responder', { pregunta: '¿Cuándo se canta truco?', ids: [1] });
  assert.equal(llamadas.prompts.length, 1);
});

test('seguimiento usa dos llamadas: interpretar, buscar con pregunta explícita y responder solo con IDs aceptados', async t => {
  const prompts = [];
  const { post, llamadas } = await iniciar(t, { responder: async prompt => {
    prompts.push(prompt);
    return prompt.startsWith('TAREA: REFORMULAR')
      ? JSON.stringify({ pregunta: '¿Cuántos puntos vale el canto de truco en El Truco?' })
      : 'El canto de truco vale dos puntos si se acepta.\nFuente: El Truco';
  } });
  const contexto = { juego: 'El Truco', pregunta: 'cuando puedo cantar truco en el truco?', respuesta: 'El truco puede declararse en cualquier momento de la mano.' };
  const pregunta = 'y cuanto vale?';
  const reformulada = await post('reformular', { pregunta, contexto });
  assert.equal(reformulada.status, 200); assert.equal(reformulada.datos.modeloInvocado, true);
  assert.equal(llamadas.embedding, 0); assert.equal(prompts.length, 1);
  assert.match(prompts[0], /respuestaAnterior.*cualquier momento/);
  const preguntaResuelta = reformulada.datos.preguntaResuelta;
  const r = await post('recuperar', { pregunta, contexto, preguntaResuelta, k: 8 });
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas.textosEmbedding, [preguntaResuelta]);
  assert.equal(r.datos.consultaBusqueda, preguntaResuelta);
  assert.equal(r.datos.preguntaResuelta, preguntaResuelta);
  assert.equal(prompts.length, 1);
  const a = await post('responder', { pregunta, contexto, preguntaResuelta, ids: [1] });
  assert.equal(a.status, 200); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /PREGUNTA REFORMULADA:\s*¿Cuántos puntos vale el canto/);
  assert.match(prompts[1], /PREGUNTA:\s*y cuanto vale\?/);
  assert.doesNotMatch(prompts[1], /El truco puede declararse en cualquier momento|Regla del reparto|Otra regla/);
  assert.deepEqual(a.datos.fuentes.map(f => f.id), [1]);
  // Regenerar con otro corte no reformula ni repite el embedding.
  await post('responder', { pregunta, contexto, preguntaResuelta, ids: [1, 2] });
  assert.equal(prompts.filter(p => p.startsWith('TAREA: REFORMULAR')).length, 1);
  assert.equal(llamadas.embedding, 1);
});

test('un seguimiento sin fragmentos aceptados conserva solo la llamada de interpretación', async t => {
  const prompts = [];
  const { post, llamadas } = await iniciar(t, { responder: async prompt => {
    prompts.push(prompt); return JSON.stringify({ pregunta: '¿Cuánto vale cantar truco en El Truco?' });
  } });
  const contexto = { juego: 'El Truco', pregunta: '¿Cuándo canto truco?', respuesta: 'Respuesta anterior.' };
  const pregunta = '¿Y cuánto vale?';
  const reformulada = await post('reformular', { pregunta, contexto });
  const a = await post('responder', { pregunta, contexto, preguntaResuelta: reformulada.datos.preguntaResuelta, ids: [] });
  assert.equal(a.datos.modeloInvocado, false); assert.equal(a.datos.sinRespuesta, true);
  assert.deepEqual(a.datos.fuentes, []); assert.equal(prompts.length, 1); assert.equal(llamadas.sql.length, 0);
});

test('reformulaciones inválidas fallan claramente sin buscar ni generar respuestas', async t => {
  const contexto = { juego: 'El Truco', pregunta: '¿Truco?', respuesta: 'Respuesta anterior.' };
  for (const salida of ['No entiendo.', '{}', '{"pregunta":""}', JSON.stringify({ pregunta: 'x'.repeat(1001) }),
    '{"pregunta":"¿Cómo se juega a la Brisca?"}', '{"pregunta":"¿Truco o Brisca?"}']) {
    const { post, llamadas } = await iniciar(t, { responder: async () => salida });
    const r = await post('reformular', { pregunta: '¿Y cuánto vale?', contexto });
    assert.equal(r.status, 502); assert.match(r.datos.error, /No se pudo interpretar/);
    assert.equal(llamadas.embedding, 0); assert.equal(llamadas.sql.length, 0);
  }
  const { post, llamadas } = await iniciar(t);
  for (const preguntaResuelta of ['', 42, 'x'.repeat(1001), '¿Qué dice la Brisca?', '¿Truco o Brisca?']) {
    for (const ruta of ['recuperar', 'responder']) {
      assert.equal((await post(ruta, { pregunta: '¿Truco?', contexto, preguntaResuelta, k: 8, ids: [1] })).status, 400);
    }
  }
  assert.equal(llamadas.embedding, 0); assert.equal(llamadas.sql.length, 0); assert.equal(llamadas.prompts.length, 0);
  assert.equal((await post('reformular', { pregunta: '¿Y cuánto vale?', contexto }, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('reformular', { pregunta: '¿Truco o Brisca?', contexto })).status, 422);
});

test('reformulación sin nombre recibe el juego validado; errores del proveedor no disparan recuperación', async t => {
  const contexto = { juego: 'El Truco', pregunta: '¿Cuándo canto truco?', respuesta: 'Respuesta anterior.' };
  const valido = await iniciar(t, { responder: async () => '```json\n{"pregunta":"¿Cuántos puntos vale el canto?"}\n```' });
  const r = await valido.post('reformular', { pregunta: '¿Y cuánto vale?', contexto });
  assert.equal(r.status, 200); assert.match(r.datos.preguntaResuelta, /^En El Truco:/);
  const fallo = await iniciar(t, { responder: async () => { throw new Error('Proveedor no disponible'); } });
  assert.equal((await fallo.post('reformular', { pregunta: '¿Y cuánto vale?', contexto })).status, 500);
  assert.equal(fallo.llamadas.embedding, 0); assert.equal(fallo.llamadas.sql.length, 0);
});

test('recuperación ampliada completa la familia de Poker y envía únicamente los IDs seleccionados por el usuario', async t => {
  const { trocearPorMarca } = await import('./trocear.mjs');
  const { MARCA } = await import('./marca.mjs');
  const { seleccionarContexto } = await import('./seleccionar-contexto.mjs');
  let id = 0;
  const catalogo = corpus.flatMap(j => trocearPorMarca(j.contenido, MARCA).map(f => ({ ...f, id: ++id, posicion: id - 1,
    juego: j.juego, origen: j.origen, seccion: f.seccion.replace(/^SECCION:\s*/, '') })));
  const candidatos = [[170,.681],[169,.649],[166,.639],[171,.637],[175,.636],[162,.634],[172,.632],[173,.628]]
    .map(([id, similitud]) => ({ ...catalogo.find(f => f.id === id), similitud }));
  const consultas = [];
  const { post, llamadas } = await iniciar(t, {
    buscar: async () => candidatos,
    db: { query: async (sql, [juego, ids]) => {
      consultas.push({ sql, juego, ids });
      return { rows: catalogo.filter(f => f.juego === juego && (!ids || ids.includes(f.id))) };
    } },
  });
  const pregunta = '¿Qué combinaciones de cartas existen en Poker?';
  const r = await post('recuperar', { pregunta, k: 8, ampliar: true });
  assert.equal(r.status, 200); assert.equal(r.datos.resultados.length, 8);
  const seleccion = seleccionarContexto(r.datos, .55);
  assert.equal(seleccion.ids.length, 11); assert.equal(seleccion.grupos.length, 1);
  const respuesta = await post('responder', { pregunta, ids: seleccion.ids });
  assert.equal(respuesta.status, 200); assert.deepEqual(respuesta.datos.fuentes.map(f => f.id), seleccion.ids);
  assert.equal(llamadas.embedding, 1); assert.equal(llamadas.prompts.length, 1);
  assert.match(llamadas.prompts[0], /Escalera de Color/); assert.match(llamadas.prompts[0], /Dobles parejas/);
  assert.doesNotMatch(llamadas.prompts[0], /SECCION: Baraja de cartas/);
  assert.deepEqual(consultas[1].ids, seleccion.ids); assert.equal(consultas[1].juego, 'Poker');
  assert.equal(respuesta.datos.respuestaOriginal, 'Respuesta de prueba.\nFuente: inventada');
  assert.ok(respuesta.datos.caracteresContexto > 0); assert.ok(respuesta.datos.duracionMs >= 0);
  const sinContexto = await post('responder', { pregunta, ids: seleccionarContexto(r.datos, .95).ids });
  assert.equal(sinContexto.datos.modeloInvocado, false); assert.equal(llamadas.prompts.length, 1);
});

test('las fuentes intercaladas no recortan contenido posterior y los límites se validan antes del LLM', async t => {
  const normal = await iniciar(t, { responder: async () => 'Truco: dos puntos.\nFuente: inventada\nRetruco: tres puntos.\nFuente: otra' });
  const r = await normal.post('responder', { pregunta: '¿Truco?', ids: [1] });
  assert.equal(r.status, 200); assert.match(r.datos.respuesta, /Retruco: tres puntos/); assert.doesNotMatch(r.datos.respuesta, /inventada|Fuente:/);
  const largo = await iniciar(t, { db: { query: async () => ({ rows: [{ ...filas[0], texto: 'x'.repeat(24001) }] }) } });
  assert.equal((await largo.post('responder', { pregunta: '¿Truco?', ids: [1] })).status, 400);
  assert.equal(largo.llamadas.prompts.length, 0);
  assert.equal((await largo.post('responder', { pregunta: '¿Truco?', ids: Array.from({length:65},(_,i)=>i+1) })).status, 400);
});

test('un error PostgreSQL al completar secciones se muestra sin generar ni modificar datos', async t => {
  const { post, llamadas } = await iniciar(t, { db: { query: async () => { throw Object.assign(new Error('Base apagada'), {code:'ECONNREFUSED'}); } } });
  const r = await post('recuperar', { pregunta: '¿Qué jugadas existen en Truco?', k: 8, ampliar: true });
  assert.equal(r.status, 500); assert.match(r.datos.error, /PostgreSQL no está disponible/);
  assert.equal(llamadas.embedding, 1); assert.equal(llamadas.prompts.length, 0);
});
