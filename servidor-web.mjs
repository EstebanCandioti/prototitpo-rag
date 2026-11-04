import { crearServidor } from "./web-handler.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { embedding, responder } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";
import { leerCorpus } from "./leer-corpus.mjs";
import { configuracionWeb } from "./configuracion-web.mjs";

const carpeta = dirname(fileURLToPath(import.meta.url));
const { puerto, host, origenPublico, permitirProxyLocalHttps } = configuracionWeb();
const plantilla = await readFile(join(carpeta, "prompt.txt"), "utf8");
const juegos = leerCorpus(await readFile(join(carpeta, "corpus", "reglas_fournier.txt"), "utf8"))
  .map(r => r.juego)
  .sort((a, b) => a.localeCompare(b, "es"));
const umbralInicial = Number(process.env.UMBRAL ?? 0.6);

const servidor = crearServidor({ juegos, umbralInicial, plantilla,
  dist: join(carpeta, "frontend", "dist"), embedding, buscar, db, responder, origenPublico, permitirProxyLocalHttps });

servidor.listen(puerto, host, () => {
  console.log(`Entre cartas: ${origenPublico ?? `http://127.0.0.1:${puerto}`}`);
});

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => servidor.close(async () => { await db.end(); process.exit(0); }));
}
