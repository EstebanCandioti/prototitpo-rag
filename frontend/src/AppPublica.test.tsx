// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import type { ConsultaPublica } from './types'
vi.mock('./Gaucho', () => ({ Gaucho: ({ estado, baraja }: { estado: string; baraja: string }) => <div data-testid="gaucho" data-estado={estado} data-baraja={baraja} /> }))
const id = '11111111-1111-4111-8111-111111111111'
const fuente = { id: 1, juego: 'El Truco', seccion: 'Truco', origen: 'https://example.org/truco', texto: 'El truco aceptado vale dos puntos.' }
const resultado: ConsultaPublica = { id, estado: 'respondida', juego: 'El Truco', baraja: 'espanola', respuesta: 'Vale dos puntos.', modeloInvocado: true, fuentes: [fuente] }
let pedidos: { ruta: string; opciones?: RequestInit }[]
let responder: (opciones: RequestInit) => Promise<Response>
function json(datos: unknown, status = 200) { return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } }) }
beforeEach(() => {
  pedidos = []; responder = async () => json(resultado)
  vi.stubGlobal('fetch', vi.fn(async (ruta: string, opciones?: RequestInit) => {
    pedidos.push({ ruta, opciones })
    if (ruta === '/api/juegos') return json({ juegos: ['El Truco', 'Poker'], umbralInicial: .55, diagnosticosHabilitados: false })
    if (ruta === '/api/v1/consultas') return responder(opciones!)
    throw new Error('El flujo público no debe llamar a etapas separadas: ' + ruta)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function preparar() {
  render(<App />)
  await screen.findByText('El Truco', { selector: '.games-list span' })
  const campo = screen.getByRole('textbox')
  fireEvent.change(campo, { target: { value: '¿Cuánto vale el truco?' } })
  return campo
}
function enter() { fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }) }
function consultas() { return pedidos.filter(p => p.ruta === '/api/v1/consultas') }
function cuerpo(i: number) { return JSON.parse(String(consultas()[i].opciones?.body)) }
function clave(i: number) { return new Headers(consultas()[i].opciones?.headers).get('Idempotency-Key') }
it('el flujo normal hace una operación pública, recibe fuentes y no envía controles de diagnóstico', async () => {
  await preparar(); enter()
  await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
  expect(pedidos.map(p => p.ruta)).toEqual(['/api/juegos', '/api/v1/consultas'])
  expect(cuerpo(0)).toEqual({ pregunta: '¿Cuánto vale el truco?' }); expect(clave(0)).toBeTruthy()
  expect(screen.getByText(/Fuentes consultadas/)).toBeTruthy()
  expect(document.querySelector('.fuentes a')?.getAttribute('href')).toBe(fuente.origen)
  expect(screen.queryByText('Modo de pruebas')).toBeNull()
  expect(screen.getByTestId('gaucho').dataset.baraja).toBe('espanola')
})
it('la continuidad envía solo el ID del intercambio anterior; nueva conversación lo elimina', async () => {
  const campo = await preparar(); enter(); await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
  fireEvent.change(campo, { target: { value: '¿Y si no quiero?' } }); enter()
  await waitFor(() => expect(consultas()).toHaveLength(2))
  expect(cuerpo(1)).toEqual({ pregunta: '¿Y si no quiero?', consultaAnteriorId: id })
  expect(clave(0)).not.toBe(clave(1))
  await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
  fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }))
  fireEvent.change(campo, { target: { value: '¿Cómo se juega al Truco?' } }); enter()
  await waitFor(() => expect(consultas()).toHaveLength(3))
  expect(cuerpo(2)).toEqual({ pregunta: '¿Cómo se juega al Truco?' })
})
it('un reintento tras fallo de red conserva clave y cuerpo y no hace llamadas por etapas', async () => {
  let numero = 0
  responder = async () => { if (++numero === 1) throw new Error('conexión perdida'); return json(resultado) }
  await preparar(); enter(); expect((await screen.findByRole('alert')).textContent).toContain('No pude conectarme con el servidor.'); enter()
  await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
  expect(clave(0)).toBe(clave(1)); expect(cuerpo(0)).toEqual(cuerpo(1))
})
it('bloquea envíos simultáneos y repetir Enter con la misma pregunta reutiliza la clave', async () => {
  let completar: (() => void) | undefined
  responder = async () => { await new Promise<void>(r => { completar = r }); return json(resultado) }
  await preparar(); enter(); enter()
  await waitFor(() => expect(consultas()).toHaveLength(1))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  completar!(); await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
  enter(); await waitFor(() => expect(consultas()).toHaveLength(2)); expect(clave(0)).toBe(clave(1))
  completar!(); await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' })
})
it('la cuota agotada y los errores del servidor se muestran sin inventar respuesta ni fuentes', async () => {
  responder = async () => json({ error: 'Se agotó la cuota diaria.', codigo: 'CUOTA_AGOTADA' }, 429)
  await preparar(); enter(); expect((await screen.findByRole('alert')).textContent).toContain('cuota diaria')
  expect(screen.queryByText(/Fuentes consultadas/)).toBeNull(); expect(screen.getByTestId('gaucho').dataset.estado).toBe('error')
})
it('un error técnico del servidor muestra su causa pública', async () => {
  responder = async () => json({ error: 'El proveedor no está disponible.', codigo: 'LLM_NO_DISPONIBLE' }, 503)
  await preparar(); enter()
  expect((await screen.findByRole('alert')).textContent).toContain('El proveedor no está disponible.')
})
it('un 502 vacío del túnel señala el servidor de la demo', async () => {
  responder = async () => new Response(null, { status: 502, headers: { 'Content-Type': 'text/html' } })
  await preparar(); enter()
  expect((await screen.findByRole('alert')).textContent).toContain('El servidor de la demo no respondió.')
})
it('la abstención conserva el estado visual y no muestra fuentes', async () => {
  responder = async () => json({ ...resultado, estado: 'abstencion', respuesta: 'Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.', modeloInvocado: false, fuentes: [] })
  await preparar(); enter(); await screen.findByText('Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.')
  expect(screen.getByTestId('gaucho').dataset.estado).toBe('ausencia'); expect(screen.queryByText(/Fuentes consultadas/)).toBeNull()
})
it('el stream cambia baraja y estados antes de entregar el resultado, sin nuevas peticiones', async () => {
  let controlador: ReadableStreamDefaultController<Uint8Array>
  responder = async () => new Response(new ReadableStream<Uint8Array>({ start(c) { controlador = c } }), { headers: { 'Content-Type': 'application/x-ndjson' } })
  await preparar(); enter(); await waitFor(() => expect(consultas()).toHaveLength(1))
  expect(screen.getByText('A ver, dejame pensarlo un momento…', { selector: '.conversation .answer' })).toBeTruthy()
  async function emitir(evento: unknown) { await act(async () => { controlador.enqueue(new TextEncoder().encode(JSON.stringify(evento) + '\n')) }) }
  await emitir({ tipo: 'juego', juego: 'Poker', baraja: 'inglesa-francesa' })
  expect(screen.getByTestId('gaucho').dataset.baraja).toBe('inglesa-francesa')
  expect(screen.getByText('A ver, dejame pensarlo un momento…', { selector: '.conversation .answer' })).toBeTruthy()
  await emitir({ tipo: 'etapa', estado: 'reformulacion' }); expect(screen.getByTestId('gaucho').dataset.estado).toBe('reformulacion')
  expect(screen.getByText('A ver, dejame pensarlo un momento…', { selector: '.conversation .answer' })).toBeTruthy()
  await emitir({ tipo: 'etapa', estado: 'generacion' }); expect(screen.getByTestId('gaucho').dataset.estado).toBe('generacion')
  expect(screen.getByText('A ver, dejame pensarlo un momento…', { selector: '.conversation .answer' })).toBeTruthy()
  await emitir({ tipo: 'resultado', consulta: { ...resultado, juego: 'Poker', baraja: 'inglesa-francesa', respuesta: 'Cinco cartas.', fuentes: [] } })
  await act(async () => { controlador.close() }); await screen.findByText('Cinco cartas.', { selector: '.conversation .answer' })
  expect(consultas()).toHaveLength(1); expect(screen.getByTestId('gaucho').dataset.estado).toBe('respuesta')
})
it('un error del stream muestra el mensaje público del backend', async () => {
  responder = async () => new Response(new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new TextEncoder().encode(JSON.stringify({ tipo: 'error', codigo: 'CHAT_NO_CONFIGURADO', estadoHttp: 503,
      error: 'Falta configurar la clave o el modelo de chat en el servidor.' }) + '\n'))
    c.close()
  } }), { headers: { 'Content-Type': 'application/x-ndjson' } })
  await preparar(); enter()
  expect((await screen.findByRole('alert')).textContent).toContain('Falta configurar la clave o el modelo de chat en el servidor.')
})
it('un stream interrumpido permite reintentar con la misma clave', async () => {
  let numero = 0
  responder = async () => ++numero === 1 ? new Response(new ReadableStream({ start(c) { c.close() } }), { headers: { 'Content-Type': 'application/x-ndjson' } }) : json(resultado)
  await preparar(); enter(); await screen.findByRole('alert'); enter()
  await screen.findByText('Vale dos puntos.', { selector: '.conversation .answer' }); expect(clave(0)).toBe(clave(1))
})
