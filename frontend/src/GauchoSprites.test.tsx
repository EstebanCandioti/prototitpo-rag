// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GauchoSprites } from './GauchoSprites'
import App from './App'
import { cargarRecursos } from './recursos-gaucho'
import type { RecursosGaucho } from './recursos-gaucho'
vi.mock('./recursos-gaucho', () => ({ cargarRecursos: vi.fn() }))
const drawImage = vi.fn()
let recursos: RecursosGaucho
let reducido = false
beforeEach(() => {
  vi.useFakeTimers(); drawImage.mockClear(); reducido = false
  recursos = {
    originales: { atencion: {}, pensando: {}, respuesta: {}, mazo: {} },
    azules: { atencion: {}, pensando: {}, respuesta: {} },
  } as RecursosGaucho
  vi.mocked(cargarRecursos).mockResolvedValue(recursos)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('matchMedia', () => ({ matches: reducido, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function listo() { await act(async () => { await Promise.resolve() }) }
function ultimoCuadro() { return drawImage.mock.calls.at(-1)![1] / 640 }
it('pensamiento respeta los cinco cuadros y tiempos originales mientras espera', async () => {
  render(<GauchoSprites estado="generacion" baraja="espanola" atento={false} onError={vi.fn()} />)
  await listo(); expect(ultimoCuadro()).toBe(0)
  await act(() => vi.advanceTimersByTimeAsync(800)); expect(ultimoCuadro()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(220)); expect(ultimoCuadro()).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(500)); expect(ultimoCuadro()).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(240)); expect(ultimoCuadro()).toBe(4)
  await act(() => vi.advanceTimersByTimeAsync(800)); expect(ultimoCuadro()).toBe(0)
})
it('respuesta mira, baja el sombrero y sostiene el reposo después de 2780 ms sin repetir el ciclo', async () => {
  render(<GauchoSprites estado="respuesta" baraja="espanola" atento={false} onError={vi.fn()} />)
  await listo(); expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.respuesta)
  await act(() => vi.advanceTimersByTimeAsync(480)); expect(ultimoCuadro()).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(550)); expect(ultimoCuadro()).toBe(4)
  await act(() => vi.advanceTimersByTimeAsync(350)); expect(ultimoCuadro()).toBe(5)
  await act(() => vi.advanceTimersByTimeAsync(450)); expect(ultimoCuadro()).toBe(6)
  await act(() => vi.advanceTimersByTimeAsync(600)); expect(ultimoCuadro()).toBe(7)
  await act(() => vi.advanceTimersByTimeAsync(350)); expect(ultimoCuadro()).toBe(8)
  expect(vi.getTimerCount()).toBe(0)
  const llamadas = drawImage.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(5000)); expect(drawImage).toHaveBeenCalledTimes(llamadas)
})
it('la respuesta azul termina en reposo y el movimiento reducido muestra directamente esa pose', async () => {
  reducido = true
  render(<GauchoSprites estado="respuesta" baraja="inglesa-francesa" atento={false} onError={vi.fn()} />)
  await listo(); expect(ultimoCuadro()).toBe(8)
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.respuesta)
  expect(vi.getTimerCount()).toBe(0)
})
it('cambia de mazo una vez y conserva el azul al pasar de pensamiento a respuesta', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="generacion" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo()
  expect(drawImage.mock.calls[0][0]).toBe(recursos.originales.mazo)
  await act(() => vi.advanceTimersByTimeAsync(1080))
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.pensando)
  rerender(<GauchoSprites estado="respuesta" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo(); expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.respuesta)
  await act(() => vi.advanceTimersByTimeAsync(480)); expect(ultimoCuadro()).toBe(3)
  rerender(<GauchoSprites estado="reposo" baraja="espanola" atento={false} onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(5)
  await act(() => vi.advanceTimersByTimeAsync(1080))
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.atencion)
})
it('reposo inicial muestra cinco cartas y la cara tapada, sin cambiar mazo para categoría general', async () => {
  render(<GauchoSprites estado="reposo" baraja="general" atento={false} onError={vi.fn()} />)
  await listo(); expect(ultimoCuadro()).toBe(0)
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.atencion)
  const llamadas = drawImage.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(5000)); expect(drawImage).toHaveBeenCalledTimes(llamadas)
})
it('también piensa durante la carga antes de que se identifique una baraja', async () => {
  render(<GauchoSprites estado="busqueda" baraja="general" atento={false} onError={vi.fn()} />)
  await listo(); expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.pensando)
  await act(() => vi.advanceTimersByTimeAsync(800)); expect(ultimoCuadro()).toBe(1)
})
it('movimiento reducido mantiene poses estáticas y no crea esperas', async () => {
  reducido = true
  render(<GauchoSprites estado="generacion" baraja="inglesa-francesa" atento={false} onError={vi.fn()} />)
  await listo(); expect(ultimoCuadro()).toBe(0)
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.pensando)
  expect(vi.getTimerCount()).toBe(0)
})
it('cancela pensamiento al llegar un error y detiene todos los temporizadores al desmontar', async () => {
  const onError = vi.fn()
  const { rerender, unmount } = render(<GauchoSprites estado="generacion" baraja="espanola" atento={false} onError={onError} />)
  await listo()
  rerender(<GauchoSprites estado="error" baraja="espanola" atento={false} onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(3)
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.atencion)
  const llamadas = drawImage.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(5000)); expect(drawImage).toHaveBeenCalledTimes(llamadas)
  unmount(); expect(vi.getTimerCount()).toBe(0)
})
it('al tocar el campo, atiende durante 1000 ms aun sin juego y no reinicia al escribir o detectar española', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="reposo" baraja="general" atento={false} onError={onError} />)
  await listo()
  rerender(<GauchoSprites estado="reposo" baraja="general" atento onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(0)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(1)
  rerender(<GauchoSprites estado="reposo" baraja="espanola" atento onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(3)
  expect(vi.getTimerCount()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(vi.getTimerCount()).toBe(0)
  const llamadas = drawImage.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(3000)); expect(drawImage).toHaveBeenCalledTimes(llamadas)
  rerender(<GauchoSprites estado="reposo" baraja="espanola" atento={false} onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(0)
  expect(vi.getTimerCount()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(vi.getTimerCount()).toBe(0)
})
it('tocar el campo después de una respuesta inicia atención y tipear no la reinicia', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="respuesta" baraja="espanola" atento={false} onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(480))
  rerender(<GauchoSprites estado="respuesta" baraja="espanola" atento onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(1)
  rerender(<GauchoSprites estado="reposo" baraja="general" atento onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(2)
})
it('una categoría general conserva el azul y no ejecuta la tira de cambio de mazo', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="reposo" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(1080))
  drawImage.mockClear()
  rerender(<GauchoSprites estado="busqueda" baraja="general" atento={false} onError={onError} />)
  await listo()
  expect(drawImage.mock.calls.every(c => c[0] !== recursos.originales.mazo)).toBe(true)
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.pensando)
})
it('si llega la respuesta durante el cambio de mazo, continúa el cambio y luego asiente en azul', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="generacion" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(540)); expect(ultimoCuadro()).toBe(3)
  rerender(<GauchoSprites estado="respuesta" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(540))
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.respuesta)
  await act(() => vi.advanceTimersByTimeAsync(480)); expect(ultimoCuadro()).toBe(3)
})
it('avisa al contenedor si falla la carga para mostrar el reemplazo', async () => {
  const onError = vi.fn(); vi.mocked(cargarRecursos).mockRejectedValueOnce(new Error('archivo ausente'))
  render(<GauchoSprites estado="reposo" baraja="espanola" atento={false} onError={onError} />)
  await listo(); expect(onError).toHaveBeenCalledOnce()
})

it('identificar no activa pensamiento; el cambio de mazo termina antes de pensar en azul', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="reposo" baraja="general" atento={false} onError={onError} />)
  await listo(); drawImage.mockClear()
  rerender(<GauchoSprites estado="deteccion" baraja="general" atento={false} onError={onError} />)
  await listo(); expect(drawImage).not.toHaveBeenCalled()
  rerender(<GauchoSprites estado="busqueda" baraja="inglesa-francesa" atento={false} onError={onError} />)
  await listo()
  await act(() => vi.advanceTimersByTimeAsync(1079))
  expect(drawImage.mock.calls.every(c => c[0] === recursos.originales.mazo)).toBe(true)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.azules.pensando)
})
it('un juego de la misma familia empieza a pensar sin ejecutar cambio de mazo', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="deteccion" baraja="general" atento={false} onError={onError} />)
  await listo(); drawImage.mockClear()
  rerender(<GauchoSprites estado="busqueda" baraja="espanola" atento={false} onError={onError} />)
  await listo()
  expect(drawImage.mock.calls.at(-1)![0]).toBe(recursos.originales.pensando)
  expect(drawImage.mock.calls.every(c => c[0] !== recursos.originales.mazo)).toBe(true)
})

it('al terminar el sombrero, React mantiene la respuesta y sus fuentes sin volver a invocar el modelo', async () => {
  const fuente = { id: 1, juego: 'El Truco', seccion: 'Envido', origen: 'https://example.org/truco', texto: 'Fragmento de prueba.', similitud: .8 }
  const solicitudes: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (ruta: string) => {
    solicitudes.push(ruta)
    const cuerpo = ruta.endsWith('/juegos') ? { juegos: ['El Truco'], umbralInicial: .55 }
      : ruta.endsWith('/detectar') ? { juego: 'El Truco', metadatos: { baraja: 'espanola', nota: 'Revisada' } }
      : ruta.endsWith('/recuperar') ? { juego: 'El Truco', metadatos: { baraja: 'espanola', nota: 'Revisada' }, resultados: [fuente] }
      : { respuesta: 'La respuesta sigue visible.', sinRespuesta: false, modeloInvocado: true, fuentes: [fuente] }
    return { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => cuerpo }
  }))
  render(<App />); await listo()
  const campo = screen.getByLabelText('¿Qué jugamos hoy?')
  fireEvent.change(campo, { target: { value: '¿Qué dice el Truco?' } })
  fireEvent.keyDown(campo, { key: 'Enter' }); await listo()
  expect(screen.getByText('La respuesta sigue visible.')).toBeTruthy()
  await act(() => vi.advanceTimersByTimeAsync(2780))
  expect(ultimoCuadro()).toBe(8)
  expect(screen.getByText('La respuesta sigue visible.')).toBeTruthy()
  expect(screen.getByText(/Fuentes consultadas/)).toBeTruthy()
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(solicitudes.filter(r => r.endsWith('/responder'))).toHaveLength(1)
})

it('después del cierre, enfocar y salir mantiene atención de 1 s sin repetir la respuesta', async () => {
  const onError = vi.fn()
  const { rerender } = render(<GauchoSprites estado="respuesta" baraja="espanola" atento={false} onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(2780)); expect(ultimoCuadro()).toBe(8)
  rerender(<GauchoSprites estado="respuesta" baraja="espanola" atento onError={onError} />)
  await listo(); await act(() => vi.advanceTimersByTimeAsync(1000)); expect(ultimoCuadro()).toBe(3)
  drawImage.mockClear()
  rerender(<GauchoSprites estado="respuesta" baraja="espanola" atento={false} onError={onError} />)
  await listo(); expect(ultimoCuadro()).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(250)); expect(ultimoCuadro()).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(750)); expect(ultimoCuadro()).toBe(8)
  const cuadrosRespuesta = drawImage.mock.calls.filter(c => c[0] === recursos.originales.respuesta)
  expect(cuadrosRespuesta).toHaveLength(1)
  expect(cuadrosRespuesta[0][1]).toBe(8 * 640)
})
