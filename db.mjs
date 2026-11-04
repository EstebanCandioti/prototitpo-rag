import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el .env. ¿Corriste node con --env-file=.env?");
}

// Un "pool" es un grupo de conexiones abiertas a la base que se reusan.
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// pgvector recibe los vectores escritos como texto: "[0.12,-0.03,...]".
// JSON.stringify de un arreglo de números da exactamente ese formato.
export function comoVector(numeros) {
  return JSON.stringify(numeros);
}