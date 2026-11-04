import { embedding } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { coseno } from "./similitud.mjs";
import { db } from "./db.mjs";

// La misma cuenta, hecha dos veces: por Postgres y por tu coseno de la clase 6.
const juego = process.argv[2];
const pregunta = process.argv[3];

if (!juego || !pregunta) {
  console.log(
    'Uso: node --env-file=.env verificar-sql.mjs "La Canasta" "tu pregunta"'
  );
  process.exit(1);
}

const v = await embedding(pregunta);
for (const r of await buscar(v, juego, 3)) {
  // le pedimos a la base el vector guardado; llega como texto "[0.1,...]"
  const { rows } = await db.query("SELECT embedding FROM fragmentos WHERE id = $1", [r.id]);
  const guardado = JSON.parse(rows[0].embedding);
  console.log(`id ${r.id}   Postgres: ${r.similitud.toFixed(6)}   tu coseno: ${coseno(v, guardado).toFixed(6)}`);
}
await db.end();