export function leerCorpus(texto) {
  const normal = texto.replace(/\r\n?/g, "\n").trim();
  const inicios = [...normal.matchAll(/^JUEGO: .+$/gm)];

  if (inicios.length === 0 || inicios[0].index !== 0) {
    throw new Error("El corpus debe comenzar con JUEGO:");
  }

  function campo(linea, nombre, numero) {
    const valor = linea
      ?.match(new RegExp(`^${nombre}:\\s*(.+)$`))?.[1]
      ?.trim();

    if (!valor) {
      throw new Error(`Juego ${numero}: falta ${nombre}:`);
    }
    return valor;
  }

  return inicios.map((inicio, i) => {
    const bloque = normal
      .slice(inicio.index, inicios[i + 1]?.index ?? normal.length)
      .trim();
    const lineas = bloque.split("\n");

    const juego = campo(lineas[0], "JUEGO", i + 1);
    const origen = campo(lineas[1], "ORIGEN", i + 1);
    const descripcion = campo(lineas[2], "DESCRIPCION", i + 1);

    const primeraSeccion = lineas.findIndex(l => /^SECCION: .+$/.test(l));
    if (primeraSeccion < 0) {
      throw new Error(`${juego}: falta SECCION:`);
    }

    if (lineas.slice(3, primeraSeccion).some(l => l.trim())) {
      throw new Error(
        `${juego}: hay texto entre DESCRIPCION y la primera SECCION`
      );
    }

    const reglas = lineas.slice(primeraSeccion).join("\n").trim();
    const contenido =
      `SECCION: Descripción general\n\n${descripcion}\n\n${reglas}`;

    return { juego, origen, contenido };
  });
}