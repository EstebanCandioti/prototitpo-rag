import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { leerCorpus } from "./leer-corpus.mjs";
import { detectarJuego } from "./detectar-juego.mjs";

const juegos = leerCorpus(await readFile("corpus/reglas_fournier.txt", "utf8"))
  .map(r => r.juego);

for (const [pregunta, esperado] of [
  ["En el truco, ¿cómo funciona el envido?", "El Truco"],
  ["¿Puedo asistir al palo en Brisca?", "La Brisca"],
  ["¿Cuántos puntos se dan en la escoba?", "La Escoba"],
  ["¿Cómo se juega al Truc?", "El Truc"],
  ["¿Qué es el all-in en Texas Hold'em?", "Texas Hold’em"],
]) {
  assert.equal(detectarJuego(pregunta, juegos), esperado);
}

assert.throws(() => detectarJuego("¿Cómo se hace una milanesa?", juegos));
assert.throws(() => detectarJuego("¿En qué se diferencia Truc de Truco?", juegos));
console.log("Detección correcta: 5 juegos, consulta sin juego y consulta ambigua.");
