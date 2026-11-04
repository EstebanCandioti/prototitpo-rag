// Identifica un nombre de juego escrito en la pregunta. Esto solo decide
// qué metadato filtrar; la recuperación de reglas sigue siendo vectorial.
export function detectarJuego(pregunta, juegos) {
  const normalizar = texto => texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const consulta = ` ${normalizar(pregunta)} `;
  const encontrados = juegos.filter(juego => {
    const nombre = normalizar(juego);
    const sinArticulo = nombre.replace(/^(el|la|los) /, "");
    return consulta.includes(` ${nombre} `) || consulta.includes(` ${sinArticulo} `);
  });

  if (encontrados.length === 1) return encontrados[0];
  if (encontrados.length > 1) {
    throw new Error(`La pregunta menciona varios juegos: ${encontrados.join(", ")}. Consultá uno por vez.`);
  }
  throw new Error("No pude identificar el juego. Incluí su nombre en la pregunta, por ejemplo: «En el truco, ¿cómo funciona el envido?»");
}
