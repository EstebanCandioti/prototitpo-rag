import { readFile } from "node:fs/promises";
import { trocearPorMarca } from "./trocear.mjs";
import { MARCA } from "./marca.mjs";
import { leerCorpus } from "./leer-corpus.mjs";

const texto = await readFile("corpus/reglas_fournier.txt", "utf8");
const juegos = leerCorpus(texto);
let total = 0;
let sinSeccion = 0;

for (const { juego, contenido } of juegos) {
  const fragmentos = trocearPorMarca(contenido, MARCA);
  const nulos = fragmentos.filter(f => !f.seccion).length;

  total += fragmentos.length;
  sinSeccion += nulos;
  console.log(`${juego}: ${fragmentos.length} fragmentos; sin sección: ${nulos}`);
}

console.log(
  `TOTAL: ${juegos.length} juegos, ${total} fragmentos, ${sinSeccion} sin sección`
);