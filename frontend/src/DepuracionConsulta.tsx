import type { ContextoConversacion, Estado, Recuperacion, Respuesta, SeleccionContexto } from './types'

const alcanceNombre = { general: 'Reglas generales', lista: 'Listado completo', puntual: 'Pregunta puntual', procedimiento: 'Procedimiento', comparacion: 'Comparación' }

export function DepuracionConsulta({ pregunta, recuperacion, seleccion, contexto, respuesta, estado, umbral, modo, error = '' }: {
  pregunta: string; recuperacion: Recuperacion | null; seleccion: SeleccionContexto; contexto?: ContextoConversacion
  respuesta: Respuesta | null; estado: Estado; umbral: number | null; modo: 'secciones' | 'fragmentos'; error?: string
}) {
  if (!recuperacion) return <p className="helper">{error ? `La consulta se detuvo: ${error}` : 'Todavía no hay fragmentos recuperados.'}</p>
  const incluidos = new Set(seleccion.ids)
  const aceptados = new Set(seleccion.aceptados)
  const sinGenerar = !respuesta && estado !== 'generacion'
  return <div className="query-debug">
    <dl className="debug-metrics">
      <div><dt>Candidatos</dt><dd>{recuperacion.resultados.length}</dd></div>
      <div><dt>Superan el corte</dt><dd>{seleccion.aceptados.length}</dd></div>
      <div><dt>Secciones elegidas</dt><dd>{seleccion.grupos.length}</dd></div>
      <div><dt>Fragmentos de contexto</dt><dd>{seleccion.ids.length}</dd></div>
      <div><dt>Caracteres de contexto</dt><dd>{seleccion.caracteres.toLocaleString('es-AR')} / {seleccion.limites.caracteres.toLocaleString('es-AR')}</dd></div>
    </dl>

    <section className="debug-step" aria-label="Interpretación de la consulta">
      <h3><span>1</span> Pregunta e interpretación</h3>
      <dl className="debug-fields"><dt>Pregunta original</dt><dd>{pregunta}</dd>
        <dt>Juego</dt><dd>{recuperacion.juego}</dd>
        <dt>Alcance</dt><dd>{recuperacion.planContexto ? alcanceNombre[recuperacion.planContexto.alcance.tipo] : 'Fragmentos individuales'}</dd>
      </dl>
      {recuperacion.planContexto && <p className="helper">{recuperacion.planContexto.alcance.descripcion}</p>}
      {recuperacion.preguntaResuelta && <details className="context-debug"><summary>Pregunta reformulada</summary><p className="fragmento">{recuperacion.preguntaResuelta}</p></details>}
      {contexto?.pregunta && <details className="context-debug"><summary>Intercambio anterior usado para interpretar</summary>
        <dl className="debug-fields"><dt>Vos</dt><dd>{contexto.pregunta}</dd><dt>Gaucho</dt><dd>{contexto.respuesta}</dd></dl>
      </details>}
      <p className="helper">{recuperacion.preguntaResuelta ? 'Una llamada de interpretación y otra al pedir una respuesta. La interpretación se reutiliza.' : 'Sin llamada de interpretación. Una llamada al pedir una respuesta.'}</p>
    </section>

    <section className="debug-step" aria-label="Resultados de búsqueda">
      <h3><span>2</span> Búsqueda de candidatos</h3>
      <p className="helper">Corte aplicado: {umbral?.toFixed(2) ?? '—'} · Modo: {modo === 'secciones' ? 'Completar secciones' : 'Solo fragmentos candidatos'}.</p>
      <p className="helper">La similitud mide cercanía con la consulta; no es una probabilidad de que la respuesta sea correcta.</p>
      {recuperacion.consultaBusqueda && <details className="context-debug"><summary>Consulta usada para buscar</summary><p className="fragmento">{recuperacion.consultaBusqueda}</p></details>}
      <div className="debug-table-scroll"><table className="debug-table"><caption>Resultados antes de ampliar las secciones</caption>
        <thead><tr><th>ID</th><th>Sección</th><th>Similitud</th><th>Corte</th><th>Contexto final</th></tr></thead>
        <tbody>{recuperacion.resultados.map(f => <tr key={f.id}>
          <td>#{f.id}</td><td><details><summary>{f.seccion}</summary><p className="fragmento">{f.texto}</p></details></td>
          <td>{f.similitud.toFixed(3)}</td><td className={aceptados.has(f.id) ? 'accepted' : 'discarded'}>{aceptados.has(f.id) ? 'Aceptado' : 'Descartado'}</td>
          <td>{incluidos.has(f.id) ? aceptados.has(f.id) ? 'Incluido' : 'Completa sección' : 'Fuera del contexto'}</td>
        </tr>)}</tbody>
      </table></div>
      {recuperacion.tiempos && <p className="helper">Embedding: {recuperacion.tiempos.embedding} ms · Búsqueda: {recuperacion.tiempos.busqueda} ms · Secciones: {recuperacion.tiempos.secciones} ms</p>}
    </section>

    <section className="debug-step" aria-label="Contexto seleccionado">
      <h3><span>3</span> Contexto seleccionado</h3>
      <p className="helper">{seleccion.motivo} Los fragmentos añadidos para completar una sección se muestran sin atribuirles un puntaje de búsqueda.</p>
      {seleccion.grupos.map(grupo => <details className="debug-group" key={grupo.id}>
        <summary><strong>{grupo.seccion}</strong><span>{grupo.fragmentos.length} fragmentos</span></summary>
        <p className="helper">{grupo.motivo} Coincidencias que habilitan este contenido: {grupo.anclas.map(id => `#${id}`).join(', ')}.</p>
        <p className="helper">Mejor similitud: {grupo.similitud?.toFixed(3) ?? '—'} · Prioridad de selección: {grupo.prioridad.toFixed(3)} (incluye estructura y coincidencias de texto).</p>
        {grupo.fragmentos.map(f => <article className="debug-source" key={f.id}>
          <h4>#{f.id} · {f.seccion}</h4><p className="debug-badge">{aceptados.has(f.id) ? 'Encontrado por búsqueda y aceptado' : 'Incluido para completar el contexto'}</p>
          <p className="fragmento">{f.texto}</p>
        </article>)}
      </details>)}
      <details className="context-debug"><summary>IDs que se enviarán al backend</summary><p className="fragmento">{seleccion.ids.length ? seleccion.ids.join(', ') : 'Ninguno: se omite generar una respuesta.'}</p></details>
      {seleccion.descartados.length > 0 && <details className="context-debug"><summary>Secciones fuera del contexto</summary><ul>{seleccion.descartados.map(g => <li key={g.id}><strong>{g.seccion}:</strong> {g.motivo}</li>)}</ul></details>}
    </section>

    <section className="debug-step" aria-label="Generación de respuesta">
      <h3><span>4</span> Generación y respuesta</h3>
      <p className="debug-outcome">{error ? error : estado === 'generacion' ? 'Generando la respuesta…'
        : respuesta?.sinRespuesta ? 'El modelo se abstuvo con el contexto recibido.'
        : respuesta ? 'Respuesta generada con los documentos seleccionados.'
        : seleccion.ids.length ? 'Todavía no se pidió una respuesta con esta selección.' : 'Generación omitida: no hay contexto seleccionado.'}</p>
      {sinGenerar && <p className="helper">Cambiar el corte o el modo de contexto actualiza la selección sin llamar a Ollama ni al LLM. La respuesta se pide con Enter o con el botón de pruebas.</p>}
      {respuesta?.duracionMs !== undefined && <p className="helper">Generación: {respuesta.duracionMs} ms · Contexto formateado: {respuesta.caracteresContexto?.toLocaleString('es-AR')} caracteres</p>}
      {respuesta?.respuestaOriginal && <details className="context-debug"><summary>Salida original del modelo</summary><p className="fragmento">{respuesta.respuestaOriginal}</p></details>}
    </section>
  </div>
}
