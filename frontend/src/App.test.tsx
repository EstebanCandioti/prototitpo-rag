// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { Gaucho } from './Gaucho'
import { construirPlanContexto } from '../../seleccionar-contexto.mjs'

const fragmentos = [
  { id: 11, juego: 'El Truco', seccion: 'Envido', origen: 'https://example.org/truco', texto: 'Primer fragmento.', similitud: .8 },
  { id: 12, juego: 'El Truco', seccion: 'Reparto', origen: 'https://example.org/truco', texto: 'Segundo fragmento.', similitud: .54 },
]
let pedidos: { ruta: string; datos: Record<string, unknown> | undefined }[]
let recuperarError: string | null
let responderError: string | null
let sinRespuesta: boolean
let deteccionError: string | null
let barajaDetectada: string
let juegoDevuelto: string
let textoRespuesta: string
let reformularError: string | null
let textoReformulado: string | null
beforeEach(() => {
  pedidos = []; recuperarError = null; responderError = null; sinRespuesta = false; deteccionError = null; barajaDetectada = 'espanola'
  juegoDevuelto = 'El Truco'; textoRespuesta = 'Respuesta generada.'
  reformularError = null; textoReformulado = null
  vi.stubGlobal('fetch', vi.fn(async (ruta: string, opciones?: RequestInit) => {
    const datos = opciones?.body ? JSON.parse(String(opciones.body)) : undefined
    pedidos.push({ ruta, datos })
    let error: string | null = null
    let cuerpo: unknown
    const fuentesJuego = juegoDevuelto === 'El Truco' ? fragmentos : fragmentos.map(f => ({ ...f, id: f.id + 20, juego: juegoDevuelto, origen: 'https://example.org/poker' }))
    if (ruta === '/api/juegos') cuerpo = { juegos: ['El Truco'], umbralInicial: .55 }
    else if (ruta === '/api/detectar') {
      error = deteccionError
      cuerpo = { juego: juegoDevuelto, metadatos: { baraja: barajaDetectada, nota: 'Corpus revisado' } }
    } else if (ruta === '/api/reformular') {
      error = reformularError
      cuerpo = { juego: juegoDevuelto, preguntaResuelta: textoReformulado ?? `En ${juegoDevuelto}: ${datos.pregunta}`, modeloInvocado: true }
    } else if (ruta === '/api/recuperar') {
      error = recuperarError
      cuerpo = { juego: juegoDevuelto, metadatos: { baraja: barajaDetectada, nota: 'Corpus revisado' }, resultados: fuentesJuego,
        preguntaResuelta: datos.preguntaResuelta, consultaBusqueda: datos.preguntaResuelta ?? datos.pregunta }
    } else {
      error = responderError
      cuerpo = { respuesta: sinRespuesta ? 'No lo encuentro en los documentos.' : textoRespuesta, sinRespuesta,
        modeloInvocado: true, fuentes: sinRespuesta ? [] : fuentesJuego.filter(f => datos.ids.includes(f.id)) }
    }
    return new Response(JSON.stringify(error ? { error } : cuerpo), { status: error ? 500 : 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function preparar() {
  render(<App />)
  await screen.findByText('0.55')
  const campo = screen.getByRole('textbox')
  fireEvent.change(campo, { target: { value: 'En el Truco, ¿cómo es el envido?' } })
  return campo
}
function enter() { fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }) }
async function recuperarPrueba() {
  await preparar()
  fireEvent.click(screen.getByText('Modo de pruebas'))
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar sin generar' }))
  await screen.findByText('Presioná Enter para consultar las reglas con la selección actual.')
}
describe('consulta RAG', () => {
  it('Enter recupera y responde automáticamente sin botones en el flujo principal, con fuentes seleccionadas', async () => {
    await preparar(); enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar', '/api/recuperar', '/api/responder'])
    expect(pedidos[2].datos).toEqual({ pregunta: 'En el Truco, ¿cómo es el envido?', k: 8, ampliar: true })
    expect(pedidos[3].datos?.ids).toEqual([11])
    expect(document.querySelector('.question-form button')).toBeNull()
    expect(screen.queryByText('Pedir respuesta')).toBeNull()
    const fuentes = screen.getByText(/Fuentes consultadas/).closest('details')!
    expect(fuentes.textContent).toContain('Primer fragmento.')
    expect(fuentes.textContent).not.toContain('Segundo fragmento.')
    expect(fuentes.querySelector('a')?.href).toBe('https://example.org/truco')
  })
  it('Shift+Enter y composición de texto conservan su comportamiento sin enviar', async () => {
    const campo = await preparar()
    expect(fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(fireEvent.keyDown(campo, { key: 'Enter', isComposing: true })).toBe(true)
    expect(pedidos).toHaveLength(1)
  })
  it('no envía una pregunta vacía', async () => {
    await preparar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    enter(); expect(pedidos).toHaveLength(1)
  })
  it('el modo de pruebas conserva las etapas y el umbral cambia sin repetir embedding ni llamar al LLM', async () => {
    await recuperarPrueba()
    expect(pedidos).toHaveLength(3)
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.9' } })
    expect(screen.getByText('No lo encuentro en los documentos')).toBeTruthy()
    expect(pedidos).toHaveLength(3)
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.6' } })
    expect(pedidos).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Generar respuesta con/ }))
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos[3].datos?.ids).toEqual([11])
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.5' } })
    expect(screen.queryByText('Respuesta generada.', { selector: '.conversation .answer' })).toBeNull()
    expect(pedidos).toHaveLength(4)
    enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos[4].datos?.ids).toEqual([11, 12])
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(1)
  })
  it('si ningún fragmento pasa el corte, Enter muestra abstención sin pedir respuesta al modelo', async () => {
    await preparar()
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.95' } })
    enter(); await screen.findByText('No lo encuentro en los documentos')
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar', '/api/recuperar'])
  })
  it('invalida recuperación al cambiar cantidad y busca de nuevo al enviar', async () => {
    await recuperarPrueba()
    fireEvent.change(screen.getByLabelText('Cantidad de fragmentos candidatos'), { target: { value: '3' } })
    expect(screen.getByText('Todavía no hay fragmentos recuperados.')).toBeTruthy()
    expect(pedidos).toHaveLength(3)
    enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos[4].datos?.k).toBe(3)
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(2)
  })
  it.each(['PostgreSQL', 'Ollama'])('muestra errores de %s y permite volver a enviar con Enter', async servicio => {
    recuperarError = `${servicio} no está disponible. Iniciá el servicio.`
    await preparar(); enter()
    expect((await screen.findByRole('alert')).textContent).toContain(servicio)
    expect(document.querySelector('[data-estado="error"]')).toBeTruthy()
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(0)
    recuperarError = null; enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
  })
  it('Enter reintenta un error del modelo con los fragmentos actuales, sin nueva búsqueda', async () => {
    await preparar(); responderError = 'Proveedor no disponible.'; enter()
    expect((await screen.findByRole('alert')).textContent).toContain('Proveedor')
    responderError = null; enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(2)
  })
  it('muestra abstención del modelo sin fuentes', async () => {
    await preparar(); sinRespuesta = true; enter()
    await screen.findByText('No lo encuentro en los documentos')
    expect(screen.queryByText(/Fuentes consultadas/)).toBeNull()
    expect(document.querySelector('[data-estado="ausencia"]')).toBeTruthy()
  })
  it('permite reintentar si el backend está apagado al iniciar', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toContain('servidor local')
    fireEvent.click(screen.getByRole('button', { name: /Reintentar conexión/ }))
    await screen.findByText('0.55')
  })
  it('avanza de búsqueda a generación automáticamente y bloquea envíos duplicados durante la carga', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!
    let completar: (() => void) | undefined
    vi.mocked(fetch).mockImplementation(async (ruta, opciones) => {
      if (String(ruta).endsWith('recuperar') || String(ruta).endsWith('responder')) {
        await new Promise<void>(resolve => { completar = resolve })
      }
      return original(ruta, opciones)
    })
    await preparar(); enter(); enter()
    await screen.findByText('Dejame que me acuerde...')
    expect(document.querySelector('[data-estado="busqueda"]')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
    completar!(); await screen.findByText('Creo que ya me acuerdo como era, che')
    expect(document.querySelector('[data-estado="generacion"][data-baraja="espanola"]')).toBeTruthy()
    enter()
    completar!(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(document.querySelector('[data-estado="respuesta"]')).toBeTruthy()
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar', '/api/recuperar', '/api/responder'])
  })
  it('identifica primero la baraja y la entrega al gaucho antes de recuperar documentos', async () => {
    barajaDetectada = 'inglesa-francesa'
    const original = vi.mocked(fetch).getMockImplementation()!
    let terminarDeteccion: (() => void) | undefined
    let terminarRecuperacion: (() => void) | undefined
    vi.mocked(fetch).mockImplementation(async (ruta, opciones) => {
      if (String(ruta).endsWith('detectar')) await new Promise<void>(resolve => { terminarDeteccion = resolve })
      if (String(ruta).endsWith('recuperar')) await new Promise<void>(resolve => { terminarRecuperacion = resolve })
      return original(ruta, opciones)
    })
    await preparar(); enter()
    expect(document.querySelector('[data-estado="deteccion"]')).toBeTruthy()
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('identificando')
    expect(vi.mocked(fetch).mock.calls.some(c => String(c[0]).endsWith('recuperar'))).toBe(false)
    terminarDeteccion!()
    await waitFor(() => expect(document.querySelector('[data-estado="busqueda"][data-baraja="inglesa-francesa"]')).toBeTruthy())
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar'])
    terminarRecuperacion!(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
  })
  it('una pregunta sin juego o con varios se detiene antes de consultar vectores o LLM', async () => {
    deteccionError = 'La pregunta menciona varios juegos. Consultá uno por vez.'
    await preparar(); enter()
    expect((await screen.findByRole('alert')).textContent).toContain('varios juegos')
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar'])
  })
  it('tocar el campo activa atención sin esperar una pregunta ni una búsqueda', async () => {
    render(<App />); await screen.findByText('0.55')
    const campo = screen.getByRole('textbox')
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('reposo')
    fireEvent.focus(campo)
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('atencion')
    fireEvent.change(campo, { target: { value: 'En el truco' } })
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('atencion')
    expect(pedidos).toHaveLength(1)
    fireEvent.blur(campo)
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('reposo')
  })
  it('conecta estados y barajas a recursos alternativos', () => {
    const { rerender, container } = render(<Gaucho estado="busqueda" baraja="general" />)
    expect(screen.getByRole('img')).toBeTruthy()
    rerender(<Gaucho estado="generacion" baraja="espanola" catalogo={{ espanola: { generacion: { src: '/gaucho.mp4', formato: 'video' } } }} />)
    expect(container.querySelector('video')?.getAttribute('src')).toBe('/gaucho.mp4')
    expect(container.querySelector('video')?.loop).toBe(false)
  })
})

describe('continuidad de conversación', () => {
  async function primeraRespuesta() {
    const campo = await preparar(); enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    return campo
  }
  it('envía el último intercambio en las tres rutas y recupera de nuevo para una pregunta nueva', async () => {
    const campo = await primeraRespuesta()
    textoRespuesta = 'Respuesta al seguimiento.'
    fireEvent.change(campo, { target: { value: '¿Y si no lo acepto?' } }); enter()
    await screen.findByText(textoRespuesta, { selector: '.conversation .answer' })
    const contexto = { juego: 'El Truco', pregunta: 'En el Truco, ¿cómo es el envido?', respuesta: 'Respuesta generada.' }
    expect(pedidos.slice(-4).map(p => p.ruta)).toEqual(['/api/detectar', '/api/reformular', '/api/recuperar', '/api/responder'])
    for (const pedido of pedidos.slice(-3)) expect(pedido.datos?.contexto).toEqual(contexto)
    expect(pedidos.at(-1)?.datos?.ids).toEqual([11])
    expect(screen.getByText(/Podés seguir preguntando sin repetir/)).toBeTruthy()
    textoRespuesta = 'Tercera respuesta.'
    fireEvent.change(campo, { target: { value: '¿Y cuánto se anota?' } }); enter()
    await screen.findByText(textoRespuesta, { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.contexto).toEqual({ juego: 'El Truco', pregunta: '¿Y si no lo acepto?', respuesta: 'Respuesta al seguimiento.' })
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(3)
  })
  it('cambiar el umbral y reintentar conservan el contexto original sin usar la propia respuesta como antecedente', async () => {
    const campo = await primeraRespuesta()
    fireEvent.change(campo, { target: { value: '¿Y si no quiero?' } }); enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    const contexto = pedidos.at(-1)?.datos?.contexto
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.5' } })
    responderError = 'Error temporal'; enter()
    await screen.findByRole('alert')
    responderError = null; enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.contexto).toEqual(contexto)
    expect(pedidos.at(-1)?.datos?.ids).toEqual([11, 12])
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Cantidad de fragmentos candidatos'), { target: { value: '3' } })
    enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.contexto).toEqual(contexto)
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
  })
  it('al mencionar otro juego limpia el historial y deja de enviar la conversación anterior', async () => {
    const campo = await primeraRespuesta()
    juegoDevuelto = 'Poker'; barajaDetectada = 'inglesa-francesa'; textoRespuesta = 'Respuesta de Poker.'
    fireEvent.change(campo, { target: { value: '¿Cómo se juega al Poker?' } }); enter()
    await screen.findByText(textoRespuesta, { selector: '.conversation .answer' })
    const ultimos = pedidos.slice(-3)
    expect(ultimos[0].datos?.contexto).toBeTruthy()
    expect(ultimos[1].datos?.contexto).toBeUndefined()
    expect(ultimos[2].datos?.contexto).toBeUndefined()
    expect(ultimos[2].datos?.ids).toEqual([31])
    expect(document.querySelector('[data-estado="respuesta"][data-baraja="inglesa-francesa"]')).toBeTruthy()
    fireEvent.click(screen.getByText('Historial de esta conversación'))
    await screen.findByText('¿Cómo se juega al Poker?', { exact: false, selector: '.history-question' })
    expect(document.querySelector('.history')?.textContent).not.toContain('En el Truco, ¿cómo es el envido?')
  })
  it('Nueva conversación borra la memoria, el historial y la pregunta sin hacer solicitudes', async () => {
    const campo = await primeraRespuesta()
    const cantidad = pedidos.length
    fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }))
    expect((campo as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('Historial de esta conversación')).toBeNull()
    expect(screen.queryByText('Respuesta generada.', { selector: '.conversation .answer' })).toBeNull()
    expect(pedidos).toHaveLength(cantidad)
    fireEvent.change(campo, { target: { value: '¿Y si no quiero?' } })
    deteccionError = 'Incluí el nombre del juego'; enter()
    await screen.findByRole('alert')
    expect(pedidos.at(-1)?.datos?.contexto).toBeUndefined()
  })
  it('un error en el seguimiento conserva el último intercambio completado', async () => {
    const campo = await primeraRespuesta()
    fireEvent.change(campo, { target: { value: '¿Y si no quiero?' } })
    recuperarError = 'PostgreSQL no está disponible'; enter()
    await screen.findByRole('alert')
    recuperarError = null
    fireEvent.change(campo, { target: { value: '¿Cómo se calcula?' } }); enter()
    await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.contexto).toEqual({ juego: 'El Truco', pregunta: 'En el Truco, ¿cómo es el envido?', respuesta: 'Respuesta generada.' })
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(2)
  })
  it('limita la respuesta anterior a 4000 caracteres y el modo de recuperación no crea un intercambio', async () => {
    textoRespuesta = 'Respuesta extensa. '.repeat(350)
    const campo = await primeraRespuestaLarga()
    fireEvent.change(campo, { target: { value: '¿Me explicás el reparto?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar sin generar' }))
    await screen.findByText('Presioná Enter para consultar las reglas con la selección actual.')
    const contexto = pedidos.at(-1)?.datos?.contexto as { respuesta: string; pregunta: string }
    expect(contexto.respuesta.length).toBeLessThanOrEqual(4000)
    expect(contexto.respuesta).toContain('Historial recortado')
    enter(); await screen.findByText(textoRespuesta.trim(), { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.contexto).toEqual(contexto)
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(2)
    async function primeraRespuestaLarga() {
      const campo = await preparar(); enter()
      await screen.findByText(textoRespuesta.trim(), { selector: '.conversation .answer' })
      return campo
    }
  })
})

describe('interpretación del seguimiento antes de recuperar', () => {
  async function iniciarSecuencia() {
    const campo = await preparar()
    fireEvent.change(campo, { target: { value: 'cuando puedo cantar truco en el truco?' } })
    enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    return campo
  }
  it('la primera pregunta omite la interpretación y el seguimiento busca y responde con la pregunta reformulada', async () => {
    const campo = await iniciarSecuencia()
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(0)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(1)
    textoReformulado = '¿Cuántos puntos vale el canto de truco en El Truco?'
    textoRespuesta = 'El truco aceptado vale dos puntos.'
    fireEvent.change(campo, { target: { value: 'y cuanto vale?' } }); enter()
    await screen.findByText(textoRespuesta, { selector: '.conversation .answer' })
    expect(pedidos.slice(-4).map(p => p.ruta)).toEqual(['/api/detectar', '/api/reformular', '/api/recuperar', '/api/responder'])
    const interpretacion = pedidos.find(p => p.ruta.endsWith('reformular'))!
    expect(interpretacion.datos?.contexto).toEqual({ juego: 'El Truco', pregunta: 'cuando puedo cantar truco en el truco?', respuesta: 'Respuesta generada.' })
    for (const p of pedidos.slice(-2)) {
      expect(p.datos?.preguntaResuelta).toBe(textoReformulado)
      expect(p.datos?.pregunta).toBe('y cuanto vale?')
    }
    expect(screen.getByText('Pregunta reformulada')).toBeTruthy()
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(2)
  })
  it('muestra interpretación y pensamiento sin buscar todavía; bloquea envíos duplicados', async () => {
    const campo = await iniciarSecuencia()
    const original = vi.mocked(fetch).getMockImplementation()!
    let terminar: (() => void) | undefined
    vi.mocked(fetch).mockImplementation(async (ruta, opciones) => {
      if (String(ruta).endsWith('reformular')) await new Promise<void>(resolve => { terminar = resolve })
      return original(ruta, opciones)
    })
    fireEvent.change(campo, { target: { value: 'y cuanto vale?' } }); enter()
    await screen.findByText('Estoy interpretando tu pregunta con lo que veníamos conversando.')
    expect(document.querySelector('[data-estado="reformulacion"]')).toBeTruthy()
    expect(document.querySelector('canvas')?.getAttribute('data-accion')).toBe('pensando')
    expect((campo as HTMLTextAreaElement).disabled).toBe(true)
    enter()
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(1)
    terminar!(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
  })
  it('si falla la interpretación muestra error y no dispara embedding ni respuesta; permite reintentar', async () => {
    const campo = await iniciarSecuencia()
    reformularError = 'No se pudo interpretar el seguimiento.'
    fireEvent.change(campo, { target: { value: 'y cuanto vale?' } }); enter()
    await screen.findByRole('alert')
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(1)
    reformularError = null; enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(2)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(2)
  })
  it('reutiliza la interpretación si falla PostgreSQL u Ollama después de reformular', async () => {
    const campo = await iniciarSecuencia()
    recuperarError = 'Ollama no está disponible.'
    fireEvent.change(campo, { target: { value: 'y cuanto vale?' } }); enter()
    await screen.findByRole('alert')
    recuperarError = null; enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(3)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(2)
  })
  it('sin aceptados usa solo interpretación; mover el corte y generar no repiten interpretación ni búsqueda', async () => {
    const campo = await iniciarSecuencia()
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.95' } })
    fireEvent.change(campo, { target: { value: 'y cuanto vale?' } }); enter()
    await screen.findByText('No lo encuentro en los documentos')
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('responder'))).toHaveLength(1)
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.55' } })
    enter(); await screen.findByText('Respuesta generada.', { selector: '.conversation .answer' })
    expect(pedidos.filter(p => p.ruta.endsWith('reformular'))).toHaveLength(1)
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(2)
    expect(pedidos.at(-1)?.datos?.preguntaResuelta).toContain('y cuanto vale?')
  })
})

describe('contexto por secciones y diagnóstico', () => {
  async function prepararSecciones() {
    const catalogo = [
      { id: 41, juego: 'Poker', origen: 'https://example.org/poker', seccion: 'Las jugadas del Poker > Full', texto: 'Definición del full.', posicion: 0 },
      { id: 42, juego: 'Poker', origen: 'https://example.org/poker', seccion: 'Las jugadas del Poker > Color', texto: 'Definición del color.', posicion: 1 },
      { id: 43, juego: 'Poker', origen: 'https://example.org/poker', seccion: 'Las jugadas del Poker > Pareja', texto: 'Definición de la pareja.', posicion: 2 },
    ]
    const candidatos = [{ ...catalogo[0], similitud: .8 }]
    const planContexto = construirPlanContexto({ pregunta: '¿Qué combinaciones existen en Poker?', juego: 'Poker', resultados: candidatos, fragmentos: catalogo })
    const original = vi.mocked(fetch).getMockImplementation()!
    juegoDevuelto = 'Poker'; barajaDetectada = 'inglesa-francesa'
    vi.mocked(fetch).mockImplementation(async (ruta, opciones) => {
      const base = await original(ruta, opciones)
      if (String(ruta).endsWith('recuperar')) return new Response(JSON.stringify({ juego: 'Poker', metadatos: { baraja: 'inglesa-francesa', nota: 'Corpus revisado' }, resultados: candidatos, planContexto,
        consultaBusqueda: '¿Qué combinaciones existen en Poker?' }), { headers: { 'Content-Type': 'application/json' } })
      if (String(ruta).endsWith('responder')) {
        const datos = JSON.parse(String(opciones?.body))
        return new Response(JSON.stringify({ respuesta: 'Listado respaldado por el corpus.', sinRespuesta: false, modeloInvocado: true,
          fuentes: catalogo.filter(f => datos.ids.includes(f.id)), respuestaOriginal: 'Listado respaldado por el corpus.\nFuente: Poker' }), { headers: { 'Content-Type': 'application/json' } })
      }
      return base
    })
    const campo = await preparar()
    fireEvent.change(campo, { target: { value: '¿Qué combinaciones existen en Poker?' } })
    return campo
  }
  it('los IDs ampliados son visibles y se envían solo las fuentes de las secciones seleccionadas', async () => {
    await prepararSecciones(); enter()
    await screen.findByText('Listado respaldado por el corpus.', { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.ids).toEqual([41,42,43])
    expect(screen.getByText('Candidatos').closest('div')?.querySelector('dd')?.textContent).toBe('1')
    expect(screen.getByText('Fragmentos de contexto').closest('div')?.querySelector('dd')?.textContent).toBe('3')
    expect(screen.getAllByText('Incluido para completar el contexto')).toHaveLength(2)
    expect(screen.getByText('Salida original del modelo')).toBeTruthy()
    const fuentes = document.querySelector('.fuentes')!
    expect(fuentes.textContent).toContain('#42'); expect(fuentes.textContent).toContain('Definición del color.')
  })
  it('comparar con fragmentos solos y ajustar el corte no hacen nuevas búsquedas ni llamadas al modelo', async () => {
    await prepararSecciones(); enter(); await screen.findByText('Listado respaldado por el corpus.', { selector: '.conversation .answer' })
    const cantidad = pedidos.length
    fireEvent.change(screen.getByLabelText('Contexto para responder'), { target: { value: 'fragmentos' } })
    expect(pedidos).toHaveLength(cantidad)
    expect(screen.getByText('Fragmentos de contexto').closest('div')?.querySelector('dd')?.textContent).toBe('1')
    enter(); await screen.findByText('Listado respaldado por el corpus.', { selector: '.conversation .answer' })
    expect(pedidos.at(-1)?.datos?.ids).toEqual([41])
    expect(pedidos.filter(p => p.ruta.endsWith('recuperar'))).toHaveLength(1)
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.9' } })
    const antes = pedidos.length; enter()
    await screen.findByText('No lo encuentro en los documentos')
    expect(pedidos).toHaveLength(antes)
  })
  it('el historial guarda el diagnóstico de la selección usada aunque cambie el corte actual', async () => {
    await prepararSecciones(); enter(); await screen.findByText('Listado respaldado por el corpus.', { selector: '.conversation .answer' })
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.95' } })
    fireEvent.click(screen.getByText('Historial de esta conversación'))
    await screen.findByText('Diagnóstico de esta consulta')
    const historico = document.querySelector('.history-debug')!
    expect(historico.textContent).toContain('41, 42, 43')
    expect(historico.textContent).toContain('Corte aplicado: 0.55')
    expect(historico.textContent).toContain('Respuesta generada con los documentos seleccionados.')
  })
})
