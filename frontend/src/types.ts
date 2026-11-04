export type Estado = 'reposo' | 'deteccion' | 'busqueda' | 'generacion' | 'respuesta' | 'ausencia' | 'error'
export type Baraja = 'espanola' | 'inglesa-francesa' | 'general'
export interface Metadatos { baraja: Baraja; nota: string }
export interface Fuente { id: number; juego: string; seccion: string; origen: string; texto: string }
export interface Fragmento extends Fuente { similitud: number }
export interface JuegoDetectado { juego: string; metadatos: Metadatos }
export interface Recuperacion extends JuegoDetectado { resultados: Fragmento[] }
export interface Respuesta { respuesta: string; modeloInvocado: boolean; sinRespuesta: boolean; fuentes: Fuente[] }
