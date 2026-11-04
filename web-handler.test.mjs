import { test } from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crearServidor } from './web-handler.mjs';
import { leerCorpus } from './leer-corpus.mjs';
import { metadatoJuego } from './metadatos-juegos.mjs';

const corpus = leerCorpus(await readFile('corpus/reglas_fournier.txt', 'utf8'));
const plantilla = await readFile('prompt.txt', 'utf8');
const filas = [
  { id: 1, juego: 'El Truco', seccion: 'Envido', origen: 'https://example.org/truco', texto: 'Regla del envido.', similitud: .72 },
  { id: 2, juego: 'El Truco', seccion: 'Reparto', origen: 'https://example.org/truco', texto: 'Regla del reparto.', similitud: .53 },
  { id: 3, juego: 'La Brisca', seccion: 'Reparto', origen: 'https://example.org/brisca', texto: 'Otra regla.', similitud: .9 },
];
async function iniciar(t, cambios = {}) {
  const llamadas = { embedding: 0, buscar: [], sql: [], prompts: [] };
  const servidor = crearServidor({
    juegos: corpus.map(r => r.juego), umbralInicial: .55, plantilla, dist: fileURLToPath(new URL('./frontend/dist/', import.meta.url)),
    embedding: async () => { llamadas.embedding++; return [1, 0]; },
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
  assert.deepEqual(llamadas, { embedding: 0, buscar: [], sql: [], prompts: [] });
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
