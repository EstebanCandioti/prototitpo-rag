import { crearServidor } from "./web-handler.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { embedding, responder, responderConUso } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";
import { leerCorpus } from "./leer-corpus.mjs";
import { configuracionWeb } from "./configuracion-web.mjs";

import { configuracionAplicacion } from './backend/configuracion.mjs';
import { crearIdentificador } from './backend/aplicacion/identidad.mjs';
import { crearControlPostgres } from './backend/infraestructura/control-postgres.mjs';
import { crearRepositorioFragmentos } from './backend/infraestructura/fragmentos-postgres.mjs';
import { crearRag } from './backend/rag/servicio.mjs';
import { crearAplicacion } from './backend/aplicacion/consultar.mjs';

const carpeta = dirname(fileURLToPath(import.meta.url));
const { puerto, host, origenPublico, permitirProxyLocalHttps } = configuracionWeb();
const plantilla = await readFile(join(carpeta, "prompt.txt"), "utf8");
const juegos = leerCorpus(await readFile(join(carpeta, "corpus", "reglas_fournier.txt"), "utf8"))
  .map(r => r.juego)
  .sort((a, b) => a.localeCompare(b, "es"));
const config = configuracionAplicacion();
// Falla antes de tocar la DB si producción aún no tiene autenticador real.
const identificar = crearIdentificador(config);
const control = crearControlPostgres(db);
await control.preparar();
const rag = crearRag({ juegos, plantilla, embedding, responder, fragmentos: crearRepositorioFragmentos({db,buscar}) });
const aplicacion = crearAplicacion({ rag, control, generar: responderConUso, identificar, config });
if (config.modoIdentidad === 'desarrollo') console.log('AUTH_MODE=desarrollo: identidad compartida de demostración. No es autenticación de producción.');
const servidor = crearServidor({ juegos, dist: join(carpeta, "frontend", "dist"),
  origenPublico, permitirProxyLocalHttps, aplicacion });

servidor.listen(puerto, host, () => {
  console.log(`Entre cartas: ${origenPublico ?? `http://127.0.0.1:${puerto}`}`);
});

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => servidor.close(async () => { await db.end(); process.exit(0); }));
}
