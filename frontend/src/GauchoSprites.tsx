import { useEffect, useRef, useState } from 'react'
import type { Baraja, Estado } from './types'
import { cargarRecursos } from './recursos-gaucho'
import type { RecursosGaucho, TipoSprite } from './recursos-gaucho'
import { secuencias, respuestaSombrero } from './secuencias-gaucho'

export function GauchoSprites({ estado, baraja, atento, onError }: {
  estado: Estado; baraja: Baraja; atento: boolean; onError: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const mazo = useRef<Baraja>('espanola')
  const poseAtenta = useRef(false)
  const tieneDibujo = useRef(false)
  const respuestaReproducida = useRef(false)
  const cambioEnCurso = useRef<{ destino: Baraja; paso: number } | null>(null)
  // La baraja general conserva el dibujo actual; nunca dispara cambio de mazo.
  const destinoMazo = baraja === 'general' ? mazo.current : baraja
  // Escribir tiene prioridad sobre una respuesta anterior, antes del primer carácter.
  const accion = estado === 'deteccion' ? 'identificando'
    : estado === 'reformulacion' || estado === 'busqueda' || estado === 'generacion' ? 'pensando'
    : atento ? 'atencion'
    : estado === 'respuesta' ? 'respuesta'
    : estado === 'ausencia' || estado === 'error' ? 'aviso' : 'reposo'
  const [recursos, setRecursos] = useState<RecursosGaucho | null>(null)
  const [reducido, setReducido] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    let activo = true
    cargarRecursos().then(datos => { if (activo) setRecursos(datos) }).catch(() => { if (activo) onError() })
    return () => { activo = false }
  }, [onError])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const cambiar = () => setReducido(media.matches)
    media.addEventListener('change', cambiar)
    return () => media.removeEventListener('change', cambiar)
  }, [])
  useEffect(() => {
    if (estado === 'reformulacion' || estado === 'busqueda' || estado === 'generacion') respuestaReproducida.current = false
  }, [estado])
  useEffect(() => {
    if (!recursos || !canvas.current) return
    const ctx = canvas.current.getContext('2d')
    if (!ctx) { onError(); return }
    let activo = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let despertar: (() => void) | undefined
    const esperar = (ms: number) => new Promise<void>(resolve => { despertar = resolve; timer = setTimeout(resolve, ms) })
    function dibujar(tipo: TipoSprite, cuadro: number) {
      if (!activo || !ctx) return
      const imagen = mazo.current === 'inglesa-francesa' && tipo !== 'mazo'
        ? recursos!.azules[tipo]! : recursos!.originales[tipo]
      tieneDibujo.current = true
      ctx.clearRect(0, 0, 640, 724)
      ctx.drawImage(imagen, cuadro * 640, 0, 640, 724, 0, 0, 640, 724)
    }
    async function reproducir(tipo: TipoSprite, cuadros: readonly number[], tiempos: readonly number[]) {
      if (reducido) { dibujar(tipo, cuadros.at(-1)!); return }
      for (let i = 0; i < cuadros.length && activo; i++) {
        dibujar(tipo, cuadros[i])
        if (tiempos[i] > 0) await esperar(tiempos[i])
      }
    }
    async function ejecutar() {
      // Mientras se identifica el nombre, conservar la pose: todavía no pensar.
      if (accion === 'identificando') {
        if (!tieneDibujo.current) dibujar('atencion', 0)
        return
      }
      if (mazo.current !== destinoMazo) {
        const cambio = destinoMazo === 'inglesa-francesa'
          ? secuencias.mazo.animations.espanola_a_inglesa : secuencias.mazo.animations.inglesa_a_espanola
        if (cambioEnCurso.current?.destino !== destinoMazo) cambioEnCurso.current = { destino: destinoMazo, paso: 0 }
        // Un cambio de estado del RAG continúa el cambio de mazo desde su cuadro actual.
        // El texto aparece de inmediato y no espera a este reproductor visual.
        if (reducido) dibujar('mazo', cambio.sequence.at(-1)!)
        else while (activo && cambioEnCurso.current.paso < cambio.sequence.length) {
          dibujar('mazo', cambio.sequence[cambioEnCurso.current.paso])
          await esperar(cambio.frame_ms)
          if (activo) cambioEnCurso.current.paso++
        }
        if (!activo) return
        mazo.current = destinoMazo; cambioEnCurso.current = null; poseAtenta.current = false
      }
      if (accion === 'pensando') {
        poseAtenta.current = false; respuestaReproducida.current = false
        if (reducido) { dibujar('pensando', 0); return }
        while (activo) await reproducir('pensando', secuencias.pensando.frames.map(f => f.index), secuencias.pensando.frames.map(f => f.duration_ms))
      } else if (accion === 'respuesta') {
        const estabaAtento = poseAtenta.current
        poseAtenta.current = false
        if (respuestaReproducida.current) {
          // Si se tocó el campo después del cierre, conservar también la salida de atención de 1 s.
          if (estabaAtento) {
            const salida = secuencias.atencion.animations.volver_concentrado
            await reproducir('atencion', salida.frames, salida.frames.map(() => 1000 / salida.frames.length))
          }
          dibujar('respuesta', respuestaSombrero.sequence.at(-1)!)
          return
        }
        respuestaReproducida.current = true
        // Solo termina el gesto visual: el estado de respuesta y sus fuentes siguen visibles.
        await reproducir('respuesta', respuestaSombrero.sequence, respuestaSombrero.durations_ms)
      } else if (accion === 'aviso') {
        poseAtenta.current = false; dibujar('atencion', 3)
      } else if (accion === 'atencion') {
        if (poseAtenta.current) { dibujar('atencion', 3); return }
        poseAtenta.current = true
        // Duración solicitada: 1000 ms en total. Se sostiene la última pose.
        const entrada = secuencias.atencion.animations.entrar_atento.frames
        await reproducir('atencion', entrada, entrada.map(() => 1000 / entrada.length))
      } else {
        const estabaAtento = poseAtenta.current
        poseAtenta.current = false
        if (estabaAtento) {
          const salida = secuencias.atencion.animations.volver_concentrado
          await reproducir('atencion', salida.frames, salida.frames.map(() => 1000 / salida.frames.length))
        } else dibujar('atencion', 0)
      }
    }
    void ejecutar().catch(() => { if (activo) onError() })
    // Cancelar esperas y dibujo al cambiar de estado: nunca retrasa la respuesta del RAG.
    return () => { activo = false; clearTimeout(timer); despertar?.() }
  }, [accion, destinoMazo, reducido, recursos, onError])
  return <canvas ref={canvas} width={640} height={724} role="img" aria-label="Gaucho con cartas, sentado a la mesa"
    className="gaucho-sprites" data-cargado={Boolean(recursos)} data-accion={accion} />
}
