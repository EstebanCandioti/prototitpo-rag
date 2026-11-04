export function formatearContexto(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const clave = JSON.stringify([fila.juego, fila.origen, fila.seccion]);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(fila);
  }
  return [...grupos.values()].map(partes => {
    partes.sort((a, b) => (a.posicion ?? a.id) - (b.posicion ?? b.id));
    let texto = partes[0].texto;
    for (const parte of partes.slice(1)) {
      let solapamiento = 0;
      for (let n = Math.min(500, texto.length, parte.texto.length); n >= 40; n--) {
        if (texto.endsWith(parte.texto.slice(0, n))) { solapamiento = n; break; }
      }
      texto += solapamiento ? parte.texto.slice(solapamiento) : '\n\n' + parte.texto;
    }
    const r = partes[0];
    return `--- [${partes.map(f => f.id).join(', ')}] ${r.juego} · ${r.seccion} · ${r.origen} ---\n${texto}`;
  }).join('\n\n');
}

export function limpiarRespuesta(respuesta) {
  let cita = false;
  const lineas = [];
  for (const linea of respuesta.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*Fuentes?\s*:/i.test(linea)) { cita = true; continue; }
    if (cita && (/^\s*---/.test(linea) || /https?:\/\//.test(linea))) continue;
    cita = false;
    lineas.push(linea);
  }
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function esAbstencion(respuesta) {
  return /^No lo encuentro en los documentos[.!]?$/i.test(respuesta.trim());
}
