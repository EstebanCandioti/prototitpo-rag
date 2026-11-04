import { useCallback, useState } from 'react'
import { GauchoSprites } from './GauchoSprites'
import type { Baraja, Estado } from './types'

export interface Animacion {
  src: string
  formato: 'imagen' | 'video'
  // Permite reemplazar un estado por un recurso adicional sin modificar el reproductor de sprites.
  loop?: boolean
}
export type CatalogoAnimaciones = Partial<Record<Baraja, Partial<Record<Estado, Animacion>>>>
export const animaciones: CatalogoAnimaciones = {}
const etiquetas: Record<Estado, string> = {
  reposo: 'Listo para tu pregunta', deteccion: 'Identificando el juego…', reformulacion: 'Interpretando tu pregunta…', busqueda: 'Buscando en los documentos…',
  generacion: 'Preparando la respuesta…', respuesta: 'Respuesta lista',
  ausencia: 'Sin respuesta en los documentos', error: 'La consulta necesita atención',
}
export function Gaucho({ estado, baraja, atento = false, catalogo = animaciones }: {
  estado: Estado; baraja: Baraja; atento?: boolean; catalogo?: CatalogoAnimaciones
}) {
  const [fallo, setFallo] = useState(false)
  const alFallar = useCallback(() => setFallo(true), [])
  const recurso = catalogo[baraja]?.[estado] ?? catalogo.general?.[estado]
  return <div className="gaucho" data-estado={estado} data-baraja={baraja}>
    {recurso ? recurso.formato === 'video'
      ? <video key={`${baraja}-${estado}`} src={recurso.src} autoPlay muted playsInline loop={recurso.loop ?? false} aria-label="Gaucho" />
      : <img src={recurso.src} alt="Gaucho" />
      : !fallo ? <GauchoSprites estado={estado} baraja={baraja} atento={atento} onError={alFallar} />
      : <svg viewBox="0 0 300 245" role="img" aria-label="Ilustración provisoria de un gaucho con sombrero y pañuelo">
        <ellipse cx="150" cy="231" rx="108" ry="9" fill="#b8a081" opacity=".22" />
        <path d="M56 234 Q63 158 120 158 L180 158 Q237 163 246 234Z" fill="#6c7563" />
        <path d="M100 177 L150 214 L201 177 L178 154 L120 154Z" fill="#e8d4aa" />
        <path d="M131 153 L150 179 L170 153 L179 174 L157 193 L171 226 L151 215 L135 225 L142 192 L120 174Z" fill="#a54b36" />
        <path d="M103 80 Q96 127 115 150 Q150 178 184 146 Q204 119 192 81Z" fill="#d4aa7d" />
        <path d="M103 82 Q96 103 103 128 L116 109 L118 83 M186 83 L182 109 L194 126 L200 85" fill="#493d30" />
        <path d="M120 114 L130 114 M169 114 L179 114" stroke="#493d30" strokeWidth="4" strokeLinecap="round" />
        <path d="M150 119 L145 133 L154 133" fill="none" stroke="#b88760" strokeWidth="3" />
        <path d="M127 143 Q137 131 150 137 Q164 131 175 143 Q160 150 150 143 Q138 150 127 143" fill="#493d30" />
        <path d="M71 78 Q89 66 105 63 L115 29 Q150 17 183 29 L197 63 Q224 67 233 78 Q197 100 151 96 Q99 97 71 78" fill="#574936" />
        <path d="M106 61 Q151 73 195 61 L198 72 Q153 85 102 72Z" fill="#302f28" />
        <path d="M78 230 L97 193 M221 230 L202 193" stroke="#505e50" strokeWidth="3" />
      </svg>}
    <span className="gaucho-status">{etiquetas[estado]}</span>
  </div>
}
