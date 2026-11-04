import { crearServidor } from "./web-handler.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { embedding, responder } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";
import { leerCorpus } from "./leer-corpus.mjs";

const carpeta = dirname(fileURLToPath(import.meta.url));
const puerto = Number(process.env.PUERTO_WEB ?? 3000);
const plantilla = await readFile(join(carpeta, "prompt.txt"), "utf8");
const juegos = leerCorpus(await readFile(join(carpeta, "corpus", "reglas_fournier.txt"), "utf8"))
  .map(r => r.juego)
  .sort((a, b) => a.localeCompare(b, "es"));
const umbralInicial = Number(process.env.UMBRAL ?? 0.6);

if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  throw new Error("PUERTO_WEB debe estar entre 1 y 65535");
}

const servidor = crearServidor({ juegos, umbralInicial, plantilla,
  dist: join(carpeta, "frontend", "dist"), embedding, buscar, db, responder });

servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`Entre cartas: http://127.0.0.1:${puerto}`);
});

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => servidor.close(async () => { await db.end(); process.exit(0); }));
}
