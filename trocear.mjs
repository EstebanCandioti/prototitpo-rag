export function trocear(texto, tamano = 800, solapamiento = 150) {
  if (solapamiento >= tamano) {
    throw new Error("el solapamiento no puede ser mayor o igual al tamaño");
  }
  const fragmentos = [];
  let inicio = 0;
  while (inicio < texto.length) {
    const fin = Math.min(inicio + tamano, texto.length);
    fragmentos.push({ id: fragmentos.length, inicio, fin, texto: texto.slice(inicio, fin) });
    if (fin === texto.length) break;
    inicio = fin - solapamiento;
  }
  return fragmentos;
}

export function trocearPorArticulo(texto) {
  const fragmentos = [];
  let titulo = "";                          // el TÍTULO en el que estamos parados

  for (const parrafo of texto.split(/\n\s*\n/)) {   // párrafos: separados por un renglón vacío
    const p = parrafo.trim();

    if (p.startsWith("TÍTULO")) {
      titulo = p;
      continue;
    }

    const m = p.match(/^Artículo (\d+)\./);
    if (m) {
      fragmentos.push({
        id: fragmentos.length,
        articulo: Number(m[1]),
        titulo,
        texto: `${titulo}\n${p}`,
      });
    }
  }

  return fragmentos;
}

// Clase 8: la idea de trocearPorArticulo, para cualquier documento.
// "marca" es una expresión regular que reconoce el párrafo donde empieza cada parte.
// Lo que la marca reconoce se guarda como "seccion": es lo que se va a citar como fuente.
// Un título solo, sin contenido abajo, se pega adelante de la parte siguiente.
// Una parte más larga que "maximo" se corta con el trocear de la clase 5.
export function trocearPorMarca(texto, marca, maximo = 2000) {
  const fragmentos = [];
  let seccion = null;      // la parte en la que estamos parados
  let parrafos = [];       // los párrafos que se van juntando
  let prefijo = "";        // títulos sueltos que esperan a la parte siguiente

  function cerrar() {
    if (parrafos.length === 0) return;
    const cuerpo = parrafos.join("\n\n");
    if (parrafos.length === 1 && cuerpo.length < 120 && seccion !== null) {
      prefijo += cuerpo + "\n";            // era un título solo
    } else {
      const completo = prefijo + cuerpo;
      const pedazos = completo.length > maximo
        ? trocear(completo, maximo, 200).map(f => f.texto)
        : [completo];
      for (const t of pedazos) fragmentos.push({ id: fragmentos.length, seccion, texto: t });
      prefijo = "";
    }
    parrafos = [];
  }

  for (const parrafo of texto.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const p = parrafo.trim();
    if (!p) continue;
    const m = p.match(marca);
    if (m) {
      cerrar();
      seccion = m[0].trim();
    }
    parrafos.push(p);
  }
  cerrar();
  if (prefijo) fragmentos.push({ id: fragmentos.length, seccion, texto: prefijo.trim() });
  return fragmentos;
}