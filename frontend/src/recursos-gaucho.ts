// Composición de dorsos azules reutilizada de gaucho-demo-conversacion/prueba.html.
// Las máscaras delimitan las cartas; el personaje y el resto del dibujo se conservan.
export type TipoSprite = 'atencion' | 'pensando' | 'respuesta' | 'mazo'
type Carta = { spans: [number, number, number][]; motif: [number, number, number, number] | null }
export interface RecursosGaucho {
  originales: Record<TipoSprite, HTMLImageElement>
  azules: Partial<Record<TipoSprite, HTMLCanvasElement | HTMLImageElement>>
}
let recursos: Promise<RecursosGaucho> | undefined
function cargarImagen(archivo: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se pudo cargar el gaucho: ${archivo}`))
    img.src = `/animaciones/${archivo}.png`
  })
}
export function cargarRecursos(): Promise<RecursosGaucho> {
  recursos ??= preparar().catch(error => { recursos = undefined; throw error })
  return recursos
}
async function preparar(): Promise<RecursosGaucho> {
  const tipos: TipoSprite[] = ['atencion', 'pensando', 'respuesta', 'mazo']
  // El nuevo cierre ya tiene ambos mazos; las máscaras siguen usándose en los otros gestos.
  const [imagenes, respuestaAzul] = await Promise.all([
    Promise.all(tipos.map(tipo => cargarImagen(tipo === 'respuesta' ? 'respuesta-sombrero-rojo' : tipo))),
    cargarImagen('respuesta-sombrero-azul'),
  ])
  const respuesta = await fetch('/animaciones/mascaras-azules.json')
  if (!respuesta.ok) throw new Error('No se pudieron cargar las máscaras del gaucho')
  const mascaras = await respuesta.json() as Record<string, Carta[][]>
  const originales = Object.fromEntries(tipos.map((tipo, i) => [tipo, imagenes[i]])) as RecursosGaucho['originales']
  const azules: RecursosGaucho['azules'] = { respuesta: respuestaAzul }
  for (const tipo of ['atencion', 'pensando'] as const) {
    const atlas = document.createElement('canvas')
    atlas.width = originales[tipo].width; atlas.height = 724
    const ctx = atlas.getContext('2d')
    if (!ctx) throw new Error('No se pudo preparar el dibujo del gaucho')
    ctx.drawImage(originales[tipo], 0, 0)
    mascaras[tipo].forEach((cartas, indice) => cartas.forEach(carta => {
      const offset = indice * 640
      ctx.save(); ctx.beginPath()
      for (const [y, x, ancho] of carta.spans) ctx.rect(offset + x, y, ancho, 1)
      ctx.clip()
      const x0 = Math.min(...carta.spans.map(s => s[1])), y0 = carta.spans[0][0]
      const x1 = Math.max(...carta.spans.map(s => s[1] + s[2])), y1 = carta.spans.at(-1)![0] + 1
      ctx.drawImage(originales.mazo, 5 * 640 + 355, 242, 5, 9, offset + x0, y0, x1 - x0, y1 - y0)
      if (carta.motif) {
        const [x, y, r, b] = carta.motif, w = (r - x) * 1.3, h = (b - y) * 1.1
        ctx.drawImage(originales.mazo, 5 * 640 + 343, 257, 28, 35, offset + (x + r - w) / 2, (y + b - h) / 2, w, h)
      }
      ctx.restore()
    }))
    azules[tipo] = atlas
  }
  return { originales, azules }
}
