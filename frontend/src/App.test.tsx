// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { Gaucho } from './Gaucho'

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
beforeEach(() => {
  pedidos = []; recuperarError = null; responderError = null; sinRespuesta = false; deteccionError = null; barajaDetectada = 'espanola'
  vi.stubGlobal('fetch', vi.fn(async (ruta: string, opciones?: RequestInit) => {
    const datos = opciones?.body ? JSON.parse(String(opciones.body)) : undefined
    pedidos.push({ ruta, datos })
    let error: string | null = null
    let cuerpo: unknown
    if (ruta === '/api/juegos') cuerpo = { juegos: ['El Truco'], umbralInicial: .55 }
    else if (ruta === '/api/detectar') {
      error = deteccionError
      cuerpo = { juego: 'El Truco', metadatos: { baraja: barajaDetectada, nota: 'Corpus revisado' } }
    } else if (ruta === '/api/recuperar') {
      error = recuperarError
      cuerpo = { juego: 'El Truco', metadatos: { baraja: barajaDetectada, nota: 'Corpus revisado' }, resultados: fragmentos }
    } else {
      error = responderError
      cuerpo = { respuesta: sinRespuesta ? 'No lo encuentro en los documentos.' : 'Respuesta generada.', sinRespuesta,
        modeloInvocado: true, fuentes: sinRespuesta ? [] : fragmentos.filter(f => datos.ids.includes(f.id)) }
    }
    return new Response(JSON.stringify(error ? { error } : cuerpo), { status: error ? 500 : 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function preparar() {
  render(<App />)
  await screen.findByText('0.55')
  const campo = screen.getByLabelText('¿Qué jugamos hoy?')
  fireEvent.change(campo, { target: { value: 'En el Truco, ¿cómo es el envido?' } })
  return campo
}
function enter() { fireEvent.keyDown(screen.getByLabelText('¿Qué jugamos hoy?'), { key: 'Enter' }) }
async function recuperarPrueba() {
  await preparar()
  fireEvent.click(screen.getByText('Modo de pruebas'))
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar sin generar' }))
  await screen.findByText('Presioná Enter para consultar las reglas con la selección actual.')
}
describe('consulta RAG', () => {
  it('Enter recupera y responde automáticamente sin botones en el flujo principal, con fuentes seleccionadas', async () => {
    await preparar(); enter()
    await screen.findByText('Respuesta generada.')
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar', '/api/recuperar', '/api/responder'])
    expect(pedidos[2].datos).toEqual({ pregunta: 'En el Truco, ¿cómo es el envido?', k: 2 })
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
    fireEvent.change(screen.getByLabelText('¿Qué jugamos hoy?'), { target: { value: '   ' } })
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
    await screen.findByText('Respuesta generada.')
    expect(pedidos[3].datos?.ids).toEqual([11])
    fireEvent.change(screen.getByLabelText(/Umbral de similitud/), { target: { value: '.5' } })
    expect(screen.queryByText('Respuesta generada.')).toBeNull()
    expect(pedidos).toHaveLength(4)
    enter(); await screen.findByText('Respuesta generada.')
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
    fireEvent.change(screen.getByLabelText('Cantidad de fragmentos'), { target: { value: '3' } })
    expect(screen.getByText('Todavía no hay fragmentos recuperados.')).toBeTruthy()
    expect(pedidos).toHaveLength(3)
    enter(); await screen.findByText('Respuesta generada.')
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
    await screen.findByText('Respuesta generada.')
  })
  it('Enter reintenta un error del modelo con los fragmentos actuales, sin nueva búsqueda', async () => {
    await preparar(); responderError = 'Proveedor no disponible.'; enter()
    expect((await screen.findByRole('alert')).textContent).toContain('Proveedor')
    responderError = null; enter()
    await screen.findByText('Respuesta generada.')
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
    await screen.findByText('Voy a buscar las reglas en los documentos.')
    expect(document.querySelector('[data-estado="busqueda"]')).toBeTruthy()
    expect((screen.getByLabelText('¿Qué jugamos hoy?') as HTMLTextAreaElement).disabled).toBe(true)
    completar!(); await screen.findByText('Estoy preparando tu respuesta…')
    expect(document.querySelector('[data-estado="generacion"][data-baraja="espanola"]')).toBeTruthy()
    enter()
    completar!(); await screen.findByText('Respuesta generada.')
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
    terminarRecuperacion!(); await screen.findByText('Respuesta generada.')
  })
  it('una pregunta sin juego o con varios se detiene antes de consultar vectores o LLM', async () => {
    deteccionError = 'La pregunta menciona varios juegos. Consultá uno por vez.'
    await preparar(); enter()
    expect((await screen.findByRole('alert')).textContent).toContain('varios juegos')
    expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/detectar'])
  })
  it('tocar el campo activa atención sin esperar una pregunta ni una búsqueda', async () => {
    render(<App />); await screen.findByText('0.55')
    const campo = screen.getByLabelText('¿Qué jugamos hoy?')
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
