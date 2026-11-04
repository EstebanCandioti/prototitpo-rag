import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import { Gaucho } from './Gaucho'
import { JuegosSidebar } from './JuegosSidebar'
import type { Estado, Recuperacion, Respuesta, Fuente, JuegoDetectado } from './types'

const ausencia = 'No lo encuentro en los documentos'
export function Fuentes({ fuentes }: { fuentes: Fuente[] }) {
  return <details className="fuentes"><summary>Fuentes consultadas <span>{fuentes.length}</span></summary>
    <p className="helper">Fragmentos utilizados como contexto para esta respuesta.</p>
    {fuentes.map(f => <article key={f.id}>
      <h3>{f.juego} · {f.seccion}</h3>
      {/^(https?:)\/\//i.test(f.origen)
        ? <a href={f.origen} target="_blank" rel="noreferrer">{f.origen} ↗</a>
        : <span>{f.origen}</span>}
      <p className="fragmento">{f.texto}</p>
    </article>)}
  </details>
}
export default function App() {
  const enCurso = useRef(false)
  const [escribiendo, setEscribiendo] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [k, setK] = useState(2)
  const [umbral, setUmbral] = useState<number | null>(null)
  const [estado, setEstado] = useState<Estado>('reposo')
  const [juegoDetectado, setJuegoDetectado] = useState<JuegoDetectado | null>(null)
  const [recuperacion, setRecuperacion] = useState<Recuperacion | null>(null)
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [configError, setConfigError] = useState('')
  const [juegos, setJuegos] = useState<string[]>([])
  const ocupado = estado === 'deteccion' || estado === 'busqueda' || estado === 'generacion'
  const seleccion = recuperacion?.resultados.filter(f => f.similitud >= (umbral ?? 1)) ?? []
  async function cargarConfiguracion() {
    setConfigError('')
    try {
      const datos = await api<{ juegos: string[]; umbralInicial: number }>('juegos')
      setJuegos(datos.juegos); setUmbral(datos.umbralInicial)
    } catch (e) { setConfigError((e as Error).message) }
  }
  useEffect(() => { void cargarConfiguracion() }, [])
  function invalidar() {
    setJuegoDetectado(null); setRecuperacion(null); setRespuesta(null); setError(''); setEstado('reposo')
  }
  async function consultar(soloRecuperar = false) {
    if (enCurso.current || umbral === null || !pregunta.trim()) return
    enCurso.current = true
    setEscribiendo(false); setError(''); setRespuesta(null)
    try {
      let datosRecuperados = recuperacion
      if (soloRecuperar || !datosRecuperados) {
        setEstado('deteccion'); setJuegoDetectado(null); setRecuperacion(null)
        const detectado = await api<JuegoDetectado>('detectar', { pregunta: pregunta.trim() })
        setJuegoDetectado(detectado)
        // El sprite cambia primero de mazo; la recuperación puede avanzar en paralelo.
        setEstado('busqueda')
        datosRecuperados = await api<Recuperacion>('recuperar', { pregunta: pregunta.trim(), k })
        setRecuperacion(datosRecuperados)
      }
      // Filtrar la recuperación actual: no repetir embedding para otro corte o reintento.
      const aceptados = datosRecuperados.resultados.filter(f => f.similitud >= umbral)
      if (!aceptados.length) { setEstado('ausencia'); return }
      if (soloRecuperar) { setEstado('reposo'); return }
      setEstado('generacion')
      const datos = await api<Respuesta>('responder', { pregunta: pregunta.trim(), ids: aceptados.map(f => f.id) })
      // Solo fuentes verificadas del juego de esta consulta.
      setRespuesta({ ...datos, fuentes: datos.fuentes.filter(f => f.juego === datosRecuperados.juego) })
      setEstado(datos.sinRespuesta ? 'ausencia' : 'respuesta')
    } catch (e) { setError((e as Error).message); setEstado('error') }
    finally { enCurso.current = false }
  }
  function enviar(event: FormEvent) {
    event.preventDefault()
    void consultar()
  }
  function cambiarUmbral(valor: number) {
    setUmbral(valor); setRespuesta(null); setError('')
    setEstado(recuperacion && !recuperacion.resultados.some(f => f.similitud >= valor) ? 'ausencia' : 'reposo')
  }
  const mensaje = estado === 'deteccion' ? 'Identificando el juego…'
    : estado === 'busqueda' ? 'Voy a buscar las reglas en los documentos.'
    : estado === 'generacion' ? 'Estoy preparando tu respuesta…'
    : estado === 'error' ? error
    : estado === 'ausencia' ? ausencia
    : respuesta ? respuesta.respuesta
    : recuperacion ? 'Presioná Enter para consultar las reglas con la selección actual.'
    : '¿Una duda con las reglas? Mencioná el juego en tu pregunta y lo consultamos en los documentos.'
  return <div className="app-shell">
    <JuegosSidebar juegos={juegos} juegoActual={juegoDetectado?.juego ?? recuperacion?.juego}
      cargando={umbral === null && !configError} error={Boolean(configError)} />
    <div className="page">
    <header className="header">
      <a className="brand" href="/" aria-label="Entre cartas, inicio"><span aria-hidden="true">✦</span> Entre cartas<span className="brand-dot">.</span></a>
      <span className="header-note">REGLAS SOBRE LA MESA</span>
    </header>
    <main>
      <div className="intro"><p className="eyebrow">UN JUEGO, UNA PREGUNTA</p><h1>Que las dudas no corten<br />la partida.</h1><p>Consultá las reglas, con los documentos a mano.</p></div>
      {configError && <div className="config-error" role="alert">{configError} <button onClick={() => void cargarConfiguracion()}>Reintentar conexión</button></div>}
      <section className="conversation" aria-label="Consulta de reglas" aria-busy={ocupado}>
        <div className={`bubble ${estado === 'error' ? 'bubble-error' : ''}`}>
          <p className="bubble-label">{juegoDetectado?.juego ?? recuperacion?.juego ?? 'EL GAUCHO DICE'}</p>
          <div role={estado === 'error' ? 'alert' : 'status'} aria-live="polite" className="answer">{mensaje}</div>
          {respuesta && respuesta.fuentes.length > 0 && <Fuentes fuentes={respuesta.fuentes} />}
        </div>
        <Gaucho atento={escribiendo} estado={estado} baraja={juegoDetectado?.metadatos.baraja ?? recuperacion?.metadatos.baraja ?? 'general'} />
        <span className="table-line" aria-hidden="true" />
      </section>
      <form className="question-form" onSubmit={enviar}>
        <label htmlFor="pregunta">¿Qué jugamos hoy?</label>
        <div className="input-row"><textarea id="pregunta" onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} rows={2} maxLength={1000} required disabled={ocupado} enterKeyHint="send" aria-describedby="ayuda-pregunta"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!ocupado && umbral !== null) event.currentTarget.form?.requestSubmit()
            }
          }}
          value={pregunta} onChange={e => { setPregunta(e.target.value); invalidar() }}
          placeholder="En el truco, ¿cómo funciona el envido?" />
        </div>
        <p id="ayuda-pregunta" className="helper">Enter para preguntar · Shift+Enter para agregar una línea. Incluí el nombre de un solo juego.</p>
      </form>
      <details className="testing"><summary>Modo de pruebas <span>AJUSTES Y RECUPERACIÓN</span></summary>
        <div className="test-controls">
          <div><label htmlFor="umbral">Umbral de similitud</label><output htmlFor="umbral">{umbral === null ? 'Cargando…' : umbral.toFixed(2)}</output>
            <input id="umbral" type="range" min="0" max="1" step="0.01" value={umbral ?? 0} disabled={ocupado || umbral === null} onChange={e => cambiarUmbral(Number(e.target.value))} /></div>
          <label htmlFor="cantidad">Cantidad de fragmentos<select id="cantidad" value={k} disabled={ocupado} onChange={e => { setK(Number(e.target.value)); invalidar() }}>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} fragmento{n > 1 ? 's' : ''}</option>)}</select></label>
        </div>
        <p className="helper">El umbral filtra esta recuperación sin repetir el embedding. Cambiar la pregunta o la cantidad requiere buscar de nuevo. El corte incluye puntajes iguales al umbral.</p>
        <p className="helper">Para evaluar por etapas, recuperá sin generar y ajustá el corte antes de llamar al modelo.</p>
        <button disabled={ocupado || umbral === null || !pregunta.trim()} onClick={() => void consultar(true)}>Recuperar sin generar</button>
        {recuperacion ? <>
          <p className="test-summary">{recuperacion.juego} · {seleccion.length} de {recuperacion.resultados.length} aceptados</p>
          <p className="helper">Baraja para el gaucho: {recuperacion.metadatos.baraja}. {recuperacion.metadatos.nota}</p>
          {recuperacion.resultados.map(f => <article className="test-fragment" key={f.id}>
            <div className="fragment-heading"><strong>#{f.id} · {f.seccion}</strong><span className={f.similitud >= (umbral ?? 1) ? 'accepted' : 'discarded'}>{f.similitud.toFixed(3)} · {f.similitud >= (umbral ?? 1) ? 'Aceptado' : 'Descartado'}</span></div>
            <p>{f.juego} · {f.origen}</p><p className="fragmento">{f.texto}</p>
          </article>)}
          <button disabled={ocupado || seleccion.length === 0} onClick={() => void consultar()}>Generar respuesta con {seleccion.length} fragmentos</button>
        </> : <p className="helper">Todavía no hay fragmentos recuperados.</p>}
        <p className="helper">La similitud no garantiza que un texto contenga la respuesta.</p>
      </details>
    </main>
    <footer><span>ENTRE CARTAS</span><p>Respuestas apoyadas en el corpus local. Si la regla no está, te lo decimos.</p><span aria-hidden="true">♣ ♦ ♠ ♥</span></footer>
    </div>
  </div>
}
