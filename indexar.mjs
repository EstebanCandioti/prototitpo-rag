import { readFile } from "node:fs/promises";
import { trocearPorMarca } from "./trocear.mjs";
import { embeddingsEnLote, pedidos } from "./api.mjs";
import { agrupar } from "./lotes.mjs";
import { db, comoVector } from "./db.mjs";
import { MARCA } from "./marca.mjs";
import { leerCorpus } from "./leer-corpus.mjs";

const TAMANO_LOTE = 32;
const texto = await readFile("corpus/reglas_fournier.txt", "utf8");
const juegos = leerCorpus(texto);
const registros = [];

console.time("tiempo total");

for (const { juego, origen, contenido } of juegos) {
  const fragmentos = trocearPorMarca(contenido, MARCA);

  if (fragmentos.length === 0 || fragmentos.some(f => !f.seccion)) {
    throw new Error(`${juego}: hay fragmentos sin sección`);
  }

  console.log(`${juego}: ${fragmentos.length} fragmentos`);

  for (const lote of agrupar(fragmentos, TAMANO_LOTE)) {
    // El embedding recibe el contexto; las columnas conservan
    // los metadatos por separado para filtrar y citar.
    const entradas = lote.map(f =>
      `Juego: ${juego}\nSección: ${f.seccion}\n${f.texto}`
    );
    const vectores = await embeddingsEnLote(entradas);

    for (let i = 0; i < lote.length; i++) {
      registros.push({
        juego,
        origen,
        seccion: lote[i].seccion.replace(/^SECCION:\s*/, ""),
        posicion: registros.length,
        texto: lote[i].texto,
        embedding: comoVector(vectores[i]),
      });
    }
  }
}

// Reemplaza las filas solo después de generar todos los embeddings.
const cliente = await db.connect();

try {
  await cliente.query("BEGIN");
  await cliente.query("TRUNCATE fragmentos RESTART IDENTITY");

  for (const r of registros) {
    await cliente.query(
      `INSERT INTO fragmentos
         (juego, origen, seccion, posicion, texto, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        r.juego,
        r.origen,
        r.seccion,
        r.posicion,
        r.texto,
        r.embedding,
      ],
    );
  }

  await cliente.query("COMMIT");
} catch (error) {
  await cliente.query("ROLLBACK");
  throw error;
} finally {
  cliente.release();
  await db.end();
}

console.timeEnd("tiempo total");
console.log(
  `Pedidos a Ollama: ${pedidos}. Fragmentos guardados: ${registros.length}.`
);