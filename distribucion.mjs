import { embeddingsEnLote } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";

const preguntas = [
  {
    juego: "La Canasta",
    respuestaEnCorpus: true,
    pregunta: "En Canasta, ¿cuál es el valor mínimo de las cartas cuando la puntuación alcanzada está entre 1.500 y 2.995?",
  },
  {
    juego: "La Escoba",
    respuestaEnCorpus: true,
    pregunta: "En la Escoba, ¿cuántos puntos se anotan por tener todos los oros?",
  },
  {
    juego: "La Brisca",
    respuestaEnCorpus: true,
    pregunta: "En Brisca, si tengo una carta del palo de salida, ¿estoy obligado a jugarla?",
  },
  {
    juego: "La Canasta",
    respuestaEnCorpus: true,
    pregunta: "En Canasta, mi compañero ya bajó cartas por primera vez. ¿Tengo que alcanzar yo también el mínimo inicial?",
  },
  {
    juego: "La Brisca",
    respuestaEnCorpus: false,
    pregunta: "En Brisca, ¿cuántos segundos tiene cada jugador para decidir su jugada?",
  },
  {
    juego: "La Brisca",
    respuestaEnCorpus: false,
    pregunta: "¿Cuántos puntos se descuentan en Brisca si un jugador muestra una carta por accidente?",
  },
];

const vectores = await embeddingsEnLote(
  preguntas.map(p => p.pregunta)
);

const filas = [];
for (const [i, p] of preguntas.entries()) {
  const [mejor] = await buscar(vectores[i], p.juego, 1);
  filas.push({ ...p, similitud: mejor?.similitud ?? 0 });
}
await db.end();

filas.sort((a, b) => b.similitud - a.similitud);

for (const f of filas) {
  const etiqueta = f.respuestaEnCorpus ? "[está]   " : "[NO está]";
  console.log(
    `${f.similitud.toFixed(3)}  ${etiqueta}  ${f.juego}: ${f.pregunta}`
  );
}