// Compartido por Node y React: no importa servicios, variables de entorno ni credenciales.
export const limitesContexto = Object.freeze({ candidatos: 16, fragmentos: 64, caracteres: 24000 });

const normalizar = texto => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’'`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const seccionDe = fila => fila.seccion.replace(/^SECCION:\s*/, '').trim();
const rutaDe = fila => seccionDe(fila).split(/\s*>\s*/);
const dentro = (seccion, padre) => seccion === padre || seccion.startsWith(padre + ' > ');
const ordenarFilas = filas => [...filas].sort((a, b) => (a.posicion ?? a.id) - (b.posicion ?? b.id));
const palabrasVacias = new Set('a al el la las los un una unos unas de del en por para con sin sobre y o que cual cuales como cuando donde cuanto cuanta cuantos cuantas son es se si me mi mis las le lo les nos sus su hay puedo puede pueden usar usa utilizan existe existen posible posibles carta cartas juego jugar juegos seria saber quiero explicar explicame'.split(' '));

export function clasificarConsulta(pregunta, juego) {
  const texto = normalizar(pregunta);
  const tokensJuego = new Set(normalizar(juego).split(' '));
  const temas = texto.split(' ').filter(p => !tokensJuego.has(p) && !palabrasVacias.has(p));
  if (/\b(basic[ao]s?|generales|resumen|principiante|aprender)\b/.test(texto) ||
      (/\b(como (?:se )?(?:juega|jugar)|reglas|reglamento)\b/.test(texto) && temas.every(p => /^(reglas|reglamento|juega|basicas|basicos|partida|funciona)$/.test(p)))) {
    return { tipo: 'general', descripcion: 'Reglas generales: cubrir preparación, objetivo, desarrollo y puntuación.' };
  }
  if (/\b(diferencia|diferencias|comparar|comparacion)\b|\bentre\b.+\by\b|\b(gana|mayor|mejor)\b.+\bo\b/.test(texto)) {
    return { tipo: 'comparacion', descripcion: 'Comparación: reunir las secciones de los conceptos consultados.' };
  }
  if (/\b(combinaciones|jugadas|tipos|formas|lista|listado|enumerar|todas|todos)\b/.test(texto) || /\bcuales (?:son|hay|existen)\b/.test(texto)) {
    return { tipo: 'lista', descripcion: 'Listado: recuperar el conjunto temático con sus subsecciones.' };
  }
  if (/\b(como|pasos|calcula|calcular|procedimiento)\b/.test(texto)) {
    return { tipo: 'procedimiento', descripcion: 'Procedimiento: completar las secciones que explican los pasos.' };
  }
  return { tipo: 'puntual', descripcion: 'Pregunta puntual: priorizar la sección específica y sus continuaciones.' };
}

function afinidad(pregunta, juego, seccion, filas) {
  const juegoTokens = new Set(normalizar(juego).split(' '));
  const terminos = [...new Set(normalizar(pregunta).split(' ').filter(p => p.length > 3 && !palabrasVacias.has(p) && !juegoTokens.has(p)).map(p => p.slice(0, 5)))];
  const titulo = normalizar(seccion);
  const cuerpo = normalizar(filas.map(f => f.texto).join(' '));
  const titulos = terminos.filter(p => titulo.includes(p)).length;
  const contenidos = terminos.filter(p => cuerpo.includes(p)).length;
  // Este valor ordena grupos; nunca se presenta como similitud de un embedding.
  return Math.min(titulos, 2) * .08 + Math.min(contenidos, 3) * .025;
}

function ordenGeneral(seccion) {
  const titulo = normalizar(seccion);
  const basicas = ['descripcion', 'objetivo', 'baraja', 'numero de jugadores', 'distribucion', 'orden y valor', 'inicio', 'tanteo', 'puntuacion'];
  const indice = basicas.findIndex(p => titulo.startsWith(p));
  return indice < 0 ? 20 : indice;
}

export function construirPlanContexto({ pregunta, juego, resultados, fragmentos }) {
  const alcance = clasificarConsulta(pregunta, juego);
  const compararOrden = alcance.tipo === 'comparacion' && /\b(gana|mayor|mejor|supera|vale mas)\b/.test(normalizar(pregunta));
  const catalogo = [...new Map([...fragmentos, ...resultados].filter(f => f.juego === juego).map(f => [f.id, f])).values()];
  const candidatos = resultados.filter(f => f.juego === juego);
  const grupos = new Map();
  const semillas = alcance.tipo === 'general' ? catalogo : candidatos;
  for (const fila of semillas) {
    const ruta = rutaDe(fila);
    const seccion = alcance.tipo === 'general' ? ruta[0]
      : (alcance.tipo === 'lista' || compararOrden) && ruta.length > 1 ? ruta.slice(0, -1).join(' > ') : seccionDe(fila);
    const id = JSON.stringify([fila.origen, seccion]);
    if (grupos.has(id)) continue;
    const ampliar = alcance.tipo === 'general' || alcance.tipo === 'lista' || compararOrden;
    // En comparaciones, la introducción de la sección padre puede definir el orden
    // de las categorías. Se incorpora su texto exacto, sin traer todas las categorías.
    const padres = alcance.tipo === 'comparacion' && !compararOrden ? ruta.slice(0, -1).map((_, i) => ruta.slice(0, i + 1).join(' > ')) : [];
    const partes = ordenarFilas(catalogo.filter(f => f.origen === fila.origen &&
      ((ampliar ? dentro(seccionDe(f), seccion) : seccionDe(f) === seccion) || padres.includes(seccionDe(f)))));
    const anclas = candidatos.filter(f => f.origen === fila.origen &&
      (alcance.tipo === 'general' || (ampliar ? dentro(seccionDe(f), seccion) : seccionDe(f) === seccion)));
    grupos.set(id, { id, juego, origen: fila.origen, seccion,
      idsAncla: anclas.map(f => f.id), fragmentos: partes,
      afinidad: afinidad(pregunta, juego, seccion, partes), orden: ordenGeneral(seccion),
      motivo: alcance.tipo === 'general' ? 'Cobertura de reglas generales del juego.'
        : alcance.tipo === 'lista' ? 'Sección temática y sus subsecciones completas.'
        : compararOrden ? 'Familia temática completa para conservar el orden de las categorías del documento.'
        : alcance.tipo === 'comparacion' ? 'Secciones comparadas, sus continuaciones y la introducción de su sección padre.'
        : 'Sección específica, incluyendo sus continuaciones.' });
  }
  return { alcance, grupos: [...grupos.values()], limites: { ...limitesContexto,
    grupos: alcance.tipo === 'general' ? 12 : alcance.tipo === 'lista' || alcance.tipo === 'comparacion' ? 3 : 2 } };
}

export function seleccionarContexto(recuperacion, umbral, modo = 'secciones') {
  const candidatos = recuperacion?.resultados ?? [];
  const aceptados = candidatos.filter(f => Number.isFinite(f.similitud) && f.similitud >= umbral);
  const vacia = { ids: [], fuentes: [], grupos: [], descartados: [], aceptados: aceptados.map(f => f.id), caracteres: 0,
    motivo: 'Ningún candidato supera el umbral.', limites: recuperacion?.planContexto?.limites ?? { ...limitesContexto, grupos: limitesContexto.candidatos } };
  if (!aceptados.length) return vacia;
  const plan = recuperacion?.planContexto;
  const porId = new Map(aceptados.map(f => [f.id, f]));
  const grupos = modo === 'fragmentos' || !plan
    ? aceptados.map(f => ({ id: String(f.id), juego: f.juego, origen: f.origen, seccion: f.seccion,
      idsAncla: [f.id], fragmentos: [f], afinidad: 0, orden: 0, motivo: 'Fragmento aceptado por similitud.' }))
    : plan.grupos;
  const general = modo === 'secciones' && plan?.alcance.tipo === 'general';
  const limites = { ...vacia.limites, grupos: modo === 'fragmentos' || !plan ? limitesContexto.candidatos : vacia.limites.grupos };
  const evaluados = grupos.map(grupo => {
    const anclas = grupo.idsAncla.map(id => porId.get(id)).filter(Boolean);
    const similitud = anclas.length ? Math.max(...anclas.map(f => f.similitud)) : null;
    const prioridad = similitud === null ? -Infinity : similitud + grupo.afinidad + Math.min(3, anclas.length - 1) * .015;
    return { ...grupo, anclas: anclas.map(f => f.id), similitud, prioridad };
  }).sort((a, b) => general ? a.orden - b.orden || b.prioridad - a.prioridad : b.prioridad - a.prioridad);
  const seleccion = { ...vacia, limites, motivo: '', grupos: [], descartados: [] };
  const usados = new Set();
  const mejor = evaluados.find(g => g.anclas.length)?.prioridad ?? -Infinity;
  for (const grupo of evaluados) {
    let razon = !grupo.anclas.length ? 'Sin una coincidencia que supere el umbral.' : '';
    if (!razon && plan && !general && modo === 'secciones' && grupo.prioridad < mejor - .1) razon = 'Menor pertinencia que las secciones priorizadas.';
    if (!razon && seleccion.grupos.length >= limites.grupos) razon = 'Límite de secciones para esta pregunta.';
    const nuevas = grupo.fragmentos.filter(f => !usados.has(f.id));
    const caracteres = nuevas.reduce((total, f) => total + f.texto.length, 0);
    if (!razon && (seleccion.ids.length + nuevas.length > limites.fragmentos || seleccion.caracteres + caracteres > limites.caracteres)) {
      razon = 'La sección completa supera el presupuesto de contexto disponible.';
    }
    if (razon) { seleccion.descartados.push({ id: grupo.id, seccion: grupo.seccion, motivo: razon }); continue; }
    if (!nuevas.length) continue;
    seleccion.grupos.push({ ...grupo, fragmentos: nuevas });
    for (const fila of nuevas) { usados.add(fila.id); seleccion.ids.push(fila.id); seleccion.fuentes.push(fila); }
    seleccion.caracteres += caracteres;
  }
  seleccion.motivo = seleccion.ids.length ? 'Contexto seleccionado y sin duplicados.' : 'Las secciones relevantes superan el presupuesto de contexto.';
  return seleccion;
}
