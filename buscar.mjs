import { db, comoVector } from "./db.mjs";

export async function buscar(vectorPregunta, juego, k = 3) {
  if (!juego) throw new Error("Falta elegir un juego");

  const { rows } = await db.query(
    `SELECT id, juego, origen, seccion, posicion, texto,
            1 - (embedding <=> $1) AS similitud
       FROM fragmentos
      WHERE juego = $2
      ORDER BY embedding <=> $1
      LIMIT $3`,
    [comoVector(vectorPregunta), juego, k],
  );

  return rows;
}