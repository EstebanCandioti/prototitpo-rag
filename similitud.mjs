export function coseno(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Los vectores tienen distinta dimensión: ${a.length} y ${b.length} números`);
  }
  let producto = 0, normaA = 0, normaB = 0;

  for (let i = 0; i < a.length; i++) {
    producto += a[i] * b[i];   // producto punto
    normaA += a[i] * a[i];     // suma de cuadrados de a
    normaB += b[i] * b[i];     // suma de cuadrados de b
  }

  return producto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

export function buscarPorSignificado(vectorPregunta, indice, k = 3) {
  return indice
    .map(f => ({
      ...f,                                        // todo lo que trae el fragmento
      similitud: coseno(vectorPregunta, f.vector),
    }))
    .sort((x, y) => y.similitud - x.similitud)  // de mayor a menor
    .slice(0, k);                               // los primeros k
}