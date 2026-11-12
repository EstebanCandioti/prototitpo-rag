import type { ConsultaPublica, EventoConsulta } from './types'
const errorTecnico = 'Ahora no puedo responderte bien. Probá de nuevo en un momento.'
export async function api<T>(ruta: string, datos?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${ruta}`, datos === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(datos),
    })
  } catch { throw new Error('No se pudo conectar con el servidor local. Comprobá que esté iniciado e intentá otra vez.') }
  const tipo = res.headers.get('content-type') ?? ''
  if (!tipo.includes('application/json')) throw new Error('El servidor local no devolvió una respuesta válida. Revisá que el backend esté iniciado.')
  const cuerpo = await res.json()
  if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo completar la consulta.')
  return cuerpo as T
}

// Una petición pública; los eventos describen etapas ejecutadas por el servidor.
export async function consultarPublica(datos: { pregunta: string; consultaAnteriorId?: string }, clave: string,
  onEvento: (evento: EventoConsulta) => void): Promise<ConsultaPublica> {
  let res: Response
  try {
    res = await fetch('/api/v1/consultas', { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'Idempotency-Key': clave,
    }, body: JSON.stringify(datos) })
  } catch { throw new Error(errorTecnico) }
  const tipo = res.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) {
    const cuerpo = await res.json()
    if (!res.ok) throw new Error(res.status >= 500 ? errorTecnico : cuerpo.error ?? errorTecnico)
    return cuerpo as ConsultaPublica
  }
  if (!res.ok || !tipo.includes('application/x-ndjson') || !res.body) throw new Error(errorTecnico)
  const lector = res.body.getReader()
  const decoder = new TextDecoder()
  let pendiente = '', resultado: ConsultaPublica | undefined
  function procesar(linea: string) {
    if (!linea.trim()) return
    const evento = JSON.parse(linea) as EventoConsulta
    if (evento.tipo === 'error') throw new Error(evento.estadoHttp >= 500 ? errorTecnico : evento.error)
    onEvento(evento)
    if (evento.tipo === 'resultado') resultado = evento.consulta
  }
  try {
    while (true) {
      const { done, value } = await lector.read()
      if (done) break
      pendiente += decoder.decode(value, { stream: true })
      const lineas = pendiente.split('\n'); pendiente = lineas.pop() ?? ''
      for (const linea of lineas) procesar(linea)
    }
    pendiente += decoder.decode(); procesar(pendiente)
  } finally { await lector.cancel().catch(() => {}); lector.releaseLock() }
  if (!resultado) throw new Error(errorTecnico)
  return resultado
}
