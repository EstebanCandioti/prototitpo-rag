import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Nunca inicializar ni reindexar la base de trabajo original desde estos comandos.
export function validarEntornoDemo(env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { /* mensaje común */ }
  if (env.CODESPACES !== 'true' || !url || url.hostname !== 'postgres' || url.pathname !== '/rag_demo' ||
      env.URL_EMBEDDINGS !== 'http://ollama:11434/v1' || env.MODELO_EMBEDDINGS !== 'bge-m3' || env.DIMENSIONES !== '1024') {
    throw new Error('Este comando solo prepara la base rag_demo y Ollama del Codespace. La base local no se modifica.');
  }
}

export async function firmaIndice(digest, archivos) {
  const hash = createHash('sha256').update(JSON.stringify({ modelo: 'bge-m3', dimensiones: 1024, digest }));
  for (const archivo of archivos) hash.update(await readFile(archivo));
  return hash.digest('hex');
}

function ejecutar(programa, args) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(programa, args, { cwd: raiz, env: process.env, stdio: 'inherit' });
    hijo.on('error', reject);
    hijo.on('exit', codigo => codigo === 0 ? resolve() : reject(new Error(`Falló ${programa} (salida ${codigo}). Revisá el mensaje anterior.`)));
  });
}

async function modelos() {
  const url = new URL('/api/tags', process.env.URL_EMBEDDINGS);
  for (let intento = 0; intento < 60; intento++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return (await res.json()).models ?? [];
    } catch { /* esperar el arranque del contenedor */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Ollama no terminó de iniciar. Revisá el contenedor ollama.');
}

async function prepararModelo() {
  let instalado = (await modelos()).find(m => m.name === 'bge-m3:latest' || m.name === 'bge-m3');
  if (!instalado) {
    console.log('Descargando bge-m3 en el servidor de GitHub (solo la primera vez)…');
    const res = await fetch(new URL('/api/pull', process.env.URL_EMBEDDINGS), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'bge-m3', stream: true }),
    });
    if (!res.ok || !res.body) throw new Error('No se pudo descargar bge-m3. Revisá Ollama y la conexión del Codespace.');
    const decoder = new TextDecoder();
    let pendiente = '', anterior = '';
    for await (const bloque of res.body) {
      pendiente += decoder.decode(bloque, { stream: true });
      const lineas = pendiente.split('\n'); pendiente = lineas.pop();
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        const datos = JSON.parse(linea);
        if (datos.error) throw new Error('Ollama informó un error al descargar el modelo.');
        const progreso = datos.total ? `${datos.status}: ${Math.floor((datos.completed ?? 0) / datos.total * 10) * 10}%` : datos.status;
        if (progreso && progreso !== anterior) { console.log(progreso); anterior = progreso; }
      }
    }
    instalado = (await modelos()).find(m => m.name === 'bge-m3:latest' || m.name === 'bge-m3');
  }
  if (!instalado?.digest) throw new Error('Ollama no registra bge-m3 después de la descarga.');
  return instalado.digest;
}

async function prepararIndice() {
  const digest = await prepararModelo();
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const firma = await firmaIndice(digest, ['corpus/reglas_fournier.txt', 'trocear.mjs', 'leer-corpus.mjs', 'marca.mjs', 'indexar.mjs']
      .map(f => resolve(raiz, f)));
    await pool.query('CREATE TABLE IF NOT EXISTS rag_demo_estado (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), firma TEXT NOT NULL, fragmentos INTEGER NOT NULL)');
    const { rows: tablas } = await pool.query("SELECT to_regclass('public.fragmentos') AS tabla");
    if (!tablas[0].tabla) {
      // Este esquema se ejecuta exclusivamente al crear la base nueva de demo.
      const esquema = (await readFile(resolve(raiz, 'esquema.sql'), 'utf8')).replace(/DROP TABLE IF EXISTS fragmentos;/, '');
      await pool.query(esquema);
    }
    const { rows: estado } = await pool.query('SELECT firma, fragmentos FROM rag_demo_estado WHERE id = TRUE');
    const { rows: cantidad } = await pool.query('SELECT COUNT(*)::int AS total FROM fragmentos');
    if (estado[0]?.firma === firma && estado[0].fragmentos === cantidad[0].total && cantidad[0].total > 0) {
      console.log(`Índice de demostración listo: ${cantidad[0].total} fragmentos. Se reutilizan los embeddings.`);
      return;
    }
    console.log('Preparando el índice del Codespace con Ollama. No se hacen llamadas al proveedor de chat.');
    await ejecutar(process.execPath, ['indexar.mjs']);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM fragmentos');
    if (!rows[0].total) throw new Error('La indexación terminó sin fragmentos.');
    await pool.query('INSERT INTO rag_demo_estado (id, firma, fragmentos) VALUES (TRUE, $1, $2) ON CONFLICT (id) DO UPDATE SET firma = EXCLUDED.firma, fragmentos = EXCLUDED.fragmentos', [firma, rows[0].total]);
    console.log(`Índice listo: ${rows[0].total} fragmentos. En los próximos arranques se reutiliza.`);
  } finally { await pool.end(); }
}

async function verificar() {
  const { embedding } = await import('../api.mjs');
  const { buscar } = await import('../buscar.mjs');
  const { db } = await import('../db.mjs');
  const { construirPlanContexto, seleccionarContexto } = await import('../seleccionar-contexto.mjs');
  try {
    console.log(`Clave de chat: ${process.env.API_KEY ? 'configurada' : 'falta configurar el secreto API_KEY'}.`);
    for (const [pregunta, juego] of [['¿Cuántos puntos vale cantar truco en El Truco?', 'El Truco'], ['¿Qué combinaciones de cartas existen en Poker?', 'Poker']]) {
      const inicio = performance.now();
      const vector = await embedding(pregunta);
      const resultados = await buscar(vector, juego, 8);
      const { rows } = await db.query('SELECT id, juego, origen, seccion, posicion, texto FROM fragmentos WHERE juego = $1 ORDER BY posicion', [juego]);
      const planContexto = construirPlanContexto({ pregunta, juego, resultados, fragmentos: rows });
      const seleccion = seleccionarContexto({ juego, resultados, planContexto }, .55);
      console.log(JSON.stringify({ pregunta, dimensiones: vector.length, candidatos: resultados.map(f => ({ id: f.id, similitud: f.similitud, seccion: f.seccion })), idsSeleccionados: seleccion.ids, milisegundos: Math.round(performance.now() - inicio) }));
      if (!seleccion.ids.length) throw new Error('La prueba no obtuvo contexto sobre el corte 0.55. Revisá el diagnóstico antes de presentar.');
    }
    console.log('PostgreSQL, pgvector, Ollama y recuperación comprobados. Esta verificación no invoca el proveedor de chat.');
  } finally { await db.end(); }
}

async function main() {
  validarEntornoDemo(process.env);
  const accion = process.argv[2];
  if (accion === 'preparar') {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await ejecutar(npm, ['ci']);
    await ejecutar(npm, ['--prefix', 'frontend', 'ci', '--no-bin-links']);
    await ejecutar(npm, ['run', 'build']);
    await prepararIndice();
    console.log('Preparación completa. Ejecutá npm run codespaces:iniciar y abrí el puerto 3000 desde Ports.');
  } else if (accion === 'iniciar') {
    await prepararIndice();
    // Al reanudar el Codespace el índice persiste, pero Ollama debe volver a
    // cargar el modelo en RAM. Hacerlo aquí evita trasladar esa espera al usuario.
    console.log('Cargando bge-m3 en memoria antes de abrir la aplicación…');
    const { embedding } = await import('../api.mjs');
    const inicio = performance.now();
    await embedding('¿Qué reglas del juego querés consultar?');
    console.log(`Modelo listo en ${Math.round(performance.now() - inicio)} ms. No se invocó el proveedor de chat.`);
    if (!process.env.API_KEY) console.log('Falta el secreto API_KEY: la búsqueda funciona, pero el proveedor de chat necesita su clave para responder.');
    await ejecutar(process.execPath, ['servidor-web.mjs']);
  } else if (accion === 'verificar') await verificar();
  else throw new Error('Usá preparar, iniciar o verificar.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.code ? `No se completó la preparación (${error.code}). Revisá los servicios.` : error.message); process.exitCode = 1; });
}
