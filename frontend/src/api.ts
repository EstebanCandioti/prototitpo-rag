export async function api<T>(ruta: string, datos?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${ruta}`, datos === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
    })
  } catch { throw new Error('No se pudo conectar con el servidor local. Comprobá que esté iniciado e intentá otra vez.') }
  const tipo = res.headers.get('content-type') ?? ''
  if (!tipo.includes('application/json')) throw new Error('El servidor local no devolvió una respuesta válida. Revisá que el backend esté iniciado.')
  const cuerpo = await res.json()
  if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo completar la consulta.')
  return cuerpo as T
}
