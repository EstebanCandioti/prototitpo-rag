export type Estado = 'reposo' | 'deteccion' | 'reformulacion' | 'busqueda' | 'generacion' | 'respuesta' | 'ausencia' | 'error'
export type Baraja = 'espanola' | 'inglesa-francesa' | 'general'
export interface Metadatos { baraja: Baraja; nota: string }
export interface Fuente { id: number; juego: string; seccion: string; origen: string; texto: string; posicion?: number }
export interface Fragmento extends Fuente { similitud: number }
export interface JuegoDetectado { juego: string; metadatos: Metadatos }
export interface ContextoConversacion { juego: string; pregunta?: string; respuesta?: string }
export interface Reformulacion { juego: string; preguntaResuelta: string; modeloInvocado: boolean }
export interface AlcanceConsulta { tipo: 'general' | 'lista' | 'comparacion' | 'procedimiento' | 'puntual'; descripcion: string }
export interface LimitesContexto { candidatos: number; fragmentos: number; caracteres: number; grupos: number }
export interface GrupoContexto { id: string; juego: string; origen: string; seccion: string; idsAncla: number[]; fragmentos: Fuente[]; afinidad: number; orden: number; motivo: string }
export interface PlanContexto { alcance: AlcanceConsulta; grupos: GrupoContexto[]; limites: LimitesContexto }
export interface GrupoSeleccionado extends GrupoContexto { anclas: number[]; similitud: number | null; prioridad: number }
export interface SeleccionContexto { ids: number[]; fuentes: Fuente[]; grupos: GrupoSeleccionado[]; descartados: { id: string; seccion: string; motivo: string }[]; aceptados: number[]; caracteres: number; motivo: string; limites: LimitesContexto }
export interface Recuperacion extends JuegoDetectado { resultados: Fragmento[]; consultaBusqueda?: string; preguntaResuelta?: string; planContexto?: PlanContexto; tiempos?: { embedding: number; busqueda: number; secciones: number } }
export interface Respuesta { respuesta: string; modeloInvocado: boolean; sinRespuesta: boolean; fuentes: Fuente[]; respuestaOriginal?: string; duracionMs?: number; caracteresContexto?: number }
export interface InformeConsulta { recuperacion: Recuperacion; seleccion: SeleccionContexto; umbral: number; modo: 'secciones' | 'fragmentos'; contexto?: ContextoConversacion }
export interface TurnoConversacion { consultaId?: string; juego: string; pregunta: string; respuesta: Respuesta; contexto?: ContextoConversacion; informe?: InformeConsulta }
export interface ConsultaPublica {
  id: string; estado: 'respondida' | 'abstencion'; juego: string; baraja: Baraja
  respuesta: string; modeloInvocado: boolean; fuentes: Fuente[]
}
export type EventoConsulta = { tipo: 'juego'; juego: string; baraja: Baraja }
  | { tipo: 'etapa'; estado: 'reformulacion' | 'busqueda' | 'generacion' }
  | { tipo: 'resultado'; consulta: ConsultaPublica }
  | { tipo: 'error'; error: string; codigo: string; estadoHttp: number }
