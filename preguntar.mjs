import { readFile } from "node:fs/promises";
import { embedding, responder } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";
import { leerCorpus } from "./leer-corpus.mjs";
import { detectarJuego } from "./detectar-juego.mjs";
import { construirPrompt } from "./conversacion.mjs";

const PLANTILLA = await readFile("prompt.txt", "utf8");
const UMBRAL = Number(process.env.UMBRAL ?? 0);
if (!process.env.UMBRAL) console.log("(sin UMBRAL en el .env: no se descarta ningún fragmento)");

const argumentos = process.argv.slice(2).filter(a => a !== "--sin-modelo");
if (argumentos.length < 1 || argumentos.length > 2) {
  console.log(
    'Uso: node --env-file=.env preguntar.mjs "En la Canasta, tu pregunta" [--sin-modelo]'
  );
  process.exit(1);
}
const pregunta = argumentos.at(-1);
const juegos = leerCorpus(await readFile("corpus/reglas_fournier.txt", "utf8"))
  .map(r => r.juego);
let juego;
try {
  // Se conserva la forma anterior de dos argumentos para pruebas existentes.
  juego = argumentos.length === 2
    ? argumentos[0]
    : detectarJuego(pregunta, juegos);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const vectorPregunta = await embedding(pregunta);
const resultados = await buscar(vectorPregunta, juego, 2);
await db.end();

if (resultados.length === 0) {
  console.log(`No hay fragmentos indexados para el juego "${juego}".`);
  process.exit(1);
}

// la etiqueta con la que se cita cada fragmento: archivo y sección
const etiqueta = r => `${r.juego} · ${r.seccion} · ${r.origen}`;

console.log("\nFRAGMENTOS RECUPERADOS");
for (const r of resultados) {
  const marca = r.similitud >= UMBRAL ? "  " : "✗ ";
  console.log(`  ${marca}${r.similitud.toFixed(3)}  ${etiqueta(r)}`);
}

const utiles = resultados.filter(r => r.similitud >= UMBRAL);
if (utiles.length === 0) {
  console.log("\nRESPUESTA");
  console.log("No lo encuentro en los documentos.");
  console.log(`(ningún fragmento llegó al umbral de ${UMBRAL}: no se llamó al modelo)`);
  process.exit(0);
}

const fragmentos = utiles
  .map(r => `--- ${etiqueta(r)} ---\n${r.texto}`)
  .join("\n\n");
const prompt = construirPrompt(PLANTILLA, { fragmentos, pregunta });

// con --sin-modelo solo muestra la búsqueda, sin gastar la llamada al modelo
if (process.argv.includes("--sin-modelo")) process.exit(0);

console.log("\nRESPUESTA");
console.log(await responder(prompt));
