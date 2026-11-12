import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, consultarPublica } from './api'
import { Gaucho } from './Gaucho'
import { JuegosSidebar } from './JuegosSidebar'
import { DepuracionConsulta } from './DepuracionConsulta'
import { seleccionarContexto } from '../../seleccionar-contexto.mjs'
import type { Estado, Recuperacion, Respuesta, Fuente, JuegoDetectado, ContextoConversacion, TurnoConversacion, Reformulacion } from './types'

const ausencia = 'Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.'
const pensando = 'A ver, dejame pensarlo un momento…'
function normalizarNombre(texto: string) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function fraseAlPensar(pregunta: string, juegoActivo: string | undefined, ultimoJuego: string | undefined, juegos: string[]) {
  if (!juegoActivo || ultimoJuego !== juegoActivo) return pensando
  const consulta = ` ${normalizarNombre(pregunta)} `
  const otroJuego = juegos.some(juego => juego !== juegoActivo &&
    consulta.includes(` ${normalizarNombre(juego).replace(/^(el|la|los) /, '')} `))
  return otroJuego ? pensando : `Sí, seguimos con ${juegoActivo}. Dejame pensar…`
}
export function Fuentes({ fuentes }: { fuentes: Fuente[] }) {
  const grupos = new Map<string, Fuente[]>()
  for (const fuente of fuentes) {
    const clave = JSON.stringify([fuente.juego, fuente.origen, fuente.seccion.split(' > ')[0]])
    grupos.set(clave, [...(grupos.get(clave) ?? []), fuente])
  }
  return <details className="fuentes"><summary>Fuentes consultadas <span>{fuentes.length}</span></summary>
    <p className="helper">Fragmentos utilizados como contexto para esta respuesta.</p>
    {[...grupos].map(([clave, partes]) => { const f = partes[0]; return <article key={clave}>
      <h3>{f.juego} · {f.seccion.split(' > ')[0]}</h3>
      {/^(https?:)\/\//i.test(f.origen)
        ? <a href={f.origen} target="_blank" rel="noreferrer">{f.origen} ↗</a>
        : <span>{f.origen}</span>}
      {partes.map(parte => <details className="source-part" key={parte.id}><summary>#{parte.id} · {parte.seccion}</summary><p className="fragmento">{parte.texto}</p></details>)}
    </article> })}
  </details>
}
function Historial({ turnos }: { turnos: TurnoConversacion[] }) {
  const [abierto, setAbierto] = useState(false)
  if (!turnos.length) return null
  return <details className="history" onToggle={event => setAbierto(event.currentTarget.open)}>
    <summary>Historial de esta conversación <span>{turnos.length}</span></summary>
    {abierto && <ol>{turnos.map((turno, indice) => <li key={indice}>
      <p className="history-question"><strong>Vos:</strong> {turno.pregunta}</p>
      <p className="answer"><strong>Gaucho · {turno.juego}:</strong> {turno.respuesta.respuesta}</p>
      {turno.respuesta.fuentes.length > 0 && <Fuentes fuentes={turno.respuesta.fuentes} />}
      {turno.informe && <details className="history-debug"><summary>Diagnóstico de esta consulta</summary>
        <DepuracionConsulta pregunta={turno.pregunta} recuperacion={turno.informe.recuperacion} seleccion={turno.informe.seleccion}
          contexto={turno.informe.contexto} respuesta={turno.respuesta} estado={turno.respuesta.sinRespuesta ? 'ausencia' : 'respuesta'} umbral={turno.informe.umbral} modo={turno.informe.modo} />
      </details>}
    </li>)}</ol>}
    <p className="helper">Se muestran hasta 10 intercambios. El servidor usa solo el último intercambio anterior en el flujo normal.</p>
  </details>
}
export default function App() {
  const enCurso = useRef(false)
  const solicitudPublica = useRef<{ clave: string; datos: { pregunta: string; consultaAnteriorId?: string } } | null>(null)
  const [diagnosticos, setDiagnosticos] = useState(false)
  const [evaluacion, setEvaluacion] = useState(false)
  const [escribiendo, setEscribiendo] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [k, setK] = useState(8)
  const [umbral, setUmbral] = useState<number | null>(null)
  const [modoContexto, setModoContexto] = useState<'secciones' | 'fragmentos'>('secciones')
  const [estado, setEstado] = useState<Estado>('reposo')
  const [juegoDetectado, setJuegoDetectado] = useState<JuegoDetectado | null>(null)
  const [juegoActivo, setJuegoActivo] = useState<JuegoDetectado | null>(null)
  const [historial, setHistorial] = useState<TurnoConversacion[]>([])
  const [contextoRecuperacion, setContextoRecuperacion] = useState<ContextoConversacion | undefined>()
  const [reformulacion, setReformulacion] = useState<Reformulacion | null>(null)
  const [recuperacion, setRecuperacion] = useState<Recuperacion | null>(null)
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [mensajeEspera, setMensajeEspera] = useState(pensando)
  const [error, setError] = useState('')
  const [configError, setConfigError] = useState('')
  const [juegos, setJuegos] = useState<string[]>([])
  const ocupado = estado === 'deteccion' || estado === 'reformulacion' || estado === 'busqueda' || estado === 'generacion'
  const seleccion = seleccionarContexto(recuperacion, umbral ?? 1, modoContexto)
  async function cargarConfiguracion() {
    setConfigError('')
    try {
      const datos = await api<{ juegos: string[]; umbralInicial: number; diagnosticosHabilitados?: boolean }>('juegos')
      setJuegos(datos.juegos); setUmbral(datos.umbralInicial); setDiagnosticos(datos.diagnosticosHabilitados === true)
    } catch (e) { setConfigError((e as Error).message) }
  }
  useEffect(() => { void cargarConfiguracion() }, [])
  function invalidar(conservarReformulacion = false) {
    solicitudPublica.current = null
    setJuegoDetectado(null); setRecuperacion(null); setContextoRecuperacion(undefined); setRespuesta(null); setError(''); setEstado('reposo')
    if (!conservarReformulacion) setReformulacion(null)
  }
  function nuevaConversacion() {
    if (enCurso.current) return
    invalidar(); setPregunta(''); setJuegoActivo(null); setHistorial([]); setEscribiendo(false)
  }
  async function consultar(soloRecuperar = false) {
    if (evaluacion || soloRecuperar) return consultarDiagnostico(soloRecuperar)
    if (enCurso.current || umbral === null || !pregunta.trim()) return
    enCurso.current = true
    setEscribiendo(false); setError(''); setRespuesta(null); setRecuperacion(null); setEstado('deteccion')
    const preguntaActual = pregunta.trim()
    setMensajeEspera(fraseAlPensar(preguntaActual, juegoActivo?.juego, historial.at(-1)?.juego, juegos))
    if (!solicitudPublica.current) {
      const anterior = historial.at(-1)?.consultaId
      solicitudPublica.current = { clave: crypto.randomUUID(), datos: { pregunta: preguntaActual,
        ...(anterior ? { consultaAnteriorId: anterior } : {}) } }
    }
    try {
      const solicitud = solicitudPublica.current
      const resultado = await consultarPublica(solicitud.datos, solicitud.clave, evento => {
        if (evento.tipo === 'juego') {
          const juego = { juego: evento.juego, metadatos: { baraja: evento.baraja, nota: 'Clasificación revisada en el corpus.' } }
          setJuegoDetectado(juego); setJuegoActivo(juego)
          setEstado('busqueda')
        } else if (evento.tipo === 'etapa') setEstado(evento.estado)
      })
      const juego = { juego: resultado.juego, metadatos: { baraja: resultado.baraja, nota: 'Clasificación revisada en el corpus.' } }
      setJuegoDetectado(juego); setJuegoActivo(juego)
      const verificada: Respuesta = { respuesta: resultado.respuesta, sinRespuesta: resultado.estado === 'abstencion',
        modeloInvocado: resultado.modeloInvocado, fuentes: resultado.fuentes.filter(f => f.juego === resultado.juego) }
      setRespuesta(verificada)
      setHistorial(previos => {
        const anteriores = previos.filter(t => t.juego === resultado.juego && t.consultaId !== resultado.id)
        return [...anteriores, { consultaId: resultado.id, juego: resultado.juego, pregunta: preguntaActual, respuesta: verificada }].slice(-10)
      })
      setEstado(verificada.sinRespuesta ? 'ausencia' : 'respuesta')
    } catch (e) { setError((e as Error).message); setEstado('error') }
    finally { enCurso.current = false }
  }
  async function consultarDiagnostico(soloRecuperar = false) {
    if (enCurso.current || umbral === null || !pregunta.trim()) return
    enCurso.current = true
    setEscribiendo(false); setError(''); setRespuesta(null)
    setMensajeEspera(fraseAlPensar(pregunta.trim(), juegoActivo?.juego, historial.at(-1)?.juego, juegos))
    try {
      const preguntaActual = pregunta.trim()
      let contexto = contextoRecuperacion
      let datosRecuperados = recuperacion
      if (soloRecuperar || !datosRecuperados) {
        const ultimo = historial.at(-1)
        contexto = ultimo && ultimo.juego === juegoActivo?.juego
          ? ultimo.pregunta === preguntaActual ? ultimo.contexto : {
            juego: ultimo.juego, pregunta: ultimo.pregunta,
            respuesta: ultimo.respuesta.respuesta.length > 4000
              ? ultimo.respuesta.respuesta.slice(0, 3960) + '\n[Historial recortado por extensión.]'
              : ultimo.respuesta.respuesta,
          }
          : juegoActivo ? { juego: juegoActivo.juego } : undefined
        const conversacion = contexto ? { contexto } : {}
        setEstado('deteccion'); setJuegoDetectado(null); setRecuperacion(null)
        const detectado = await api<JuegoDetectado>('detectar', { pregunta: preguntaActual, ...conversacion })
        if (detectado.juego !== juegoActivo?.juego) setHistorial([])
        if (contexto?.juego !== detectado.juego) contexto = undefined
        setContextoRecuperacion(contexto)
        setJuegoDetectado(detectado); setJuegoActivo(detectado)
        let interpretacion = reformulacion?.juego === detectado.juego ? reformulacion : null
        if (contexto?.pregunta) {
          if (!interpretacion) {
            setEstado('reformulacion')
            interpretacion = await api<Reformulacion>('reformular', { pregunta: preguntaActual, contexto })
            setReformulacion(interpretacion)
          }
        } else {
          interpretacion = null; setReformulacion(null)
        }
        // El sprite cambia primero de mazo; la recuperación puede avanzar en paralelo.
        setEstado('busqueda')
        datosRecuperados = await api<Recuperacion>('recuperar', { pregunta: preguntaActual, k, ampliar: true,
          ...(contexto ? { contexto } : {}), ...(interpretacion ? { preguntaResuelta: interpretacion.preguntaResuelta } : {}) })
        setRecuperacion(datosRecuperados)
      }
      const seleccionActual = seleccionarContexto(datosRecuperados, umbral, modoContexto)
      const guardarTurno = (datos: Respuesta) => {
        const turno: TurnoConversacion = { juego: datosRecuperados.juego, pregunta: preguntaActual, respuesta: datos, contexto,
          informe: { recuperacion: datosRecuperados, seleccion: seleccionActual, umbral, modo: modoContexto, contexto } }
        setHistorial(previos => {
          const anteriores = previos.filter(t => t.juego === turno.juego)
          if (anteriores.at(-1)?.pregunta === preguntaActual) return [...anteriores.slice(0, -1), turno]
          return [...anteriores, turno].slice(-10)
        })
      }
      // Filtrar la recuperación actual: no repetir embedding para otro corte o reintento.
      if (!seleccionActual.ids.length) {
        if (!soloRecuperar) guardarTurno({ respuesta: ausencia, modeloInvocado: false, sinRespuesta: true, fuentes: [] })
        setEstado('ausencia'); return
      }
      if (soloRecuperar) { setEstado('reposo'); return }
      setEstado('generacion')
      const datos = await api<Respuesta>('responder', { pregunta: preguntaActual, ids: seleccionActual.ids,
        ...(contexto ? { contexto } : {}), ...(datosRecuperados.preguntaResuelta ? { preguntaResuelta: datosRecuperados.preguntaResuelta } : {}) })
      // Solo fuentes verificadas del juego de esta consulta.
      const verificada = { ...datos, fuentes: datos.fuentes.filter(f => f.juego === datosRecuperados.juego) }
      setRespuesta(verificada); guardarTurno(verificada)
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
    setEstado(recuperacion && !seleccionarContexto(recuperacion, valor, modoContexto).ids.length ? 'ausencia' : 'reposo')
  }
  function cambiarModo(valor: 'secciones' | 'fragmentos') {
    setModoContexto(valor); setRespuesta(null); setError('')
    setEstado(recuperacion && !seleccionarContexto(recuperacion, umbral ?? 1, valor).ids.length ? 'ausencia' : 'reposo')
  }
  const mensaje = ocupado ? mensajeEspera
    : estado === 'error' ? error
    : estado === 'ausencia' ? ausencia
    : respuesta ? respuesta.respuesta
    : recuperacion ? 'Presioná Enter para consultar las reglas con la selección actual.'
    : juegoActivo ? `¿Qué más querés saber de ${juegoActivo.juego}?`
    : '¿Qué juego tenés en mente? Preguntame y lo vemos.'
  return <div className="app-shell">
    <JuegosSidebar juegos={juegos} juegoActual={juegoDetectado?.juego ?? juegoActivo?.juego}
      cargando={umbral === null && !configError} error={Boolean(configError)} />
    <div className="page">
    <header className="header">
      <a className="brand" href="/" aria-label="Entre cartas, inicio"><span aria-hidden="true">✦</span> Entre cartas<span className="brand-dot">.</span></a>
    </header>
    <main>
      {configError && <div className="config-error" role="alert">{configError} <button onClick={() => void cargarConfiguracion()}>Reintentar conexión</button></div>}
      <section className="conversation" aria-label="Consulta de reglas" aria-busy={ocupado}>
        <div className={`bubble ${estado === 'error' ? 'bubble-error' : ''}`}>
          <div role={estado === 'error' ? 'alert' : 'status'} aria-live="polite" className="answer">{mensaje}</div>
        </div>
        <div className="gaucho-stage">
          <Gaucho atento={escribiendo} estado={estado} baraja={juegoDetectado?.metadatos.baraja ?? juegoActivo?.metadatos.baraja ?? 'general'} />
          <span className="table-line" aria-hidden="true" />
        </div>
        {respuesta && respuesta.fuentes.length > 0 && <div className="conversation-sources"><Fuentes fuentes={respuesta.fuentes} /></div>}
      </section>
      <div className="conversation-controls">
        <p className="helper">{juegoActivo ? `Conversando sobre ${juegoActivo.juego}. Podés seguir preguntando sin repetir su nombre.` : 'Para empezar, mencioná el juego en tu pregunta.'}</p>
        <button type="button" disabled={ocupado || (!juegoActivo && !historial.length)} onClick={nuevaConversacion}>Nueva conversación</button>
      </div>
      <form className="question-form" onSubmit={enviar}>
        <label htmlFor="pregunta">¿Que se juega hoy?</label>
        <div className="input-row"><textarea id="pregunta" onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} rows={2} maxLength={1000} required disabled={ocupado} enterKeyHint="send" aria-describedby="ayuda-pregunta"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!ocupado && umbral !== null) event.currentTarget.form?.requestSubmit()
            }
          }}
          value={pregunta} onChange={e => { setPregunta(e.target.value); invalidar() }}
          placeholder={juegoActivo ? '¿Qué otra regla querés consultar?' : 'En el truco, ¿cómo funciona el envido?'} />
        </div>
        <p id="ayuda-pregunta" className="helper">Enter para preguntar · Shift+Enter para agregar una línea. {juegoActivo ? 'Para cambiar de juego, mencioná otro por su nombre.' : 'Incluí el nombre de un solo juego.'}</p>
      </form>
      <Historial key={juegoActivo?.juego ?? 'nueva'} turnos={historial} />
      {diagnosticos && <details className="testing"><summary>Modo de pruebas <span>AJUSTES Y RECUPERACIÓN</span></summary>
        <label className="helper"><input type="checkbox" checked={evaluacion} disabled={ocupado} onChange={e => {
          setEvaluacion(e.target.checked); invalidar(); setHistorial([]); setJuegoActivo(null)
        }} /> Evaluar por etapas</label>
        <p className="helper">El flujo normal se coordina en el servidor. Activá la evaluación para probar etapas con una cuota separada; estos controles no cambian la configuración de la operación pública.</p>
        <div className="test-controls">
          <div><label htmlFor="umbral">Umbral de similitud</label><output htmlFor="umbral">{umbral === null ? 'Cargando…' : umbral.toFixed(2)}</output>
            <input id="umbral" type="range" min="0" max="1" step="0.01" value={umbral ?? 0} disabled={ocupado || !evaluacion || umbral === null} onChange={e => cambiarUmbral(Number(e.target.value))} /></div>
          <label htmlFor="cantidad">Cantidad de fragmentos candidatos<select id="cantidad" value={k} disabled={ocupado || !evaluacion} onChange={e => { setK(Number(e.target.value)); invalidar(true) }}>{[1, 2, 3, 4, 5, 6, 7, 8, 12, 16].map(n => <option key={n} value={n}>{n} candidato{n > 1 ? 's' : ''}</option>)}</select></label>
          <label htmlFor="modo-contexto">Contexto para responder<select id="modo-contexto" value={modoContexto} disabled={ocupado || !evaluacion} onChange={e => cambiarModo(e.target.value as 'secciones' | 'fragmentos')}>
            <option value="secciones">Completar secciones</option><option value="fragmentos">Solo fragmentos candidatos</option>
          </select></label>
        </div>
        <p className="helper">Los candidatos localizan temas; el contexto puede incluir más fragmentos para completar esas secciones. El umbral y el modo actualizan la selección localmente. Cambiar la pregunta o la cantidad de candidatos requiere buscar de nuevo.</p>
        <p className="helper">Para evaluar por etapas, recuperá sin generar y ajustá el corte antes de pedir una respuesta. En seguimientos, recuperar incluye una llamada al modelo para interpretar la pregunta.</p>
        <button disabled={ocupado || !evaluacion || umbral === null || !pregunta.trim()} onClick={() => { setEvaluacion(true); void consultarDiagnostico(true) }}>Recuperar sin generar</button>
        {recuperacion ? <>
          <p className="test-summary">{recuperacion.juego} · {seleccion.aceptados.length} de {recuperacion.resultados.length} candidatos aceptados · {seleccion.ids.length} fragmentos de contexto</p>
          <p className="helper">Baraja para el gaucho: {recuperacion.metadatos.baraja}. {recuperacion.metadatos.nota}</p>
          <button disabled={ocupado || !evaluacion || seleccion.ids.length === 0} onClick={() => void consultarDiagnostico()}>Generar respuesta con {seleccion.ids.length} fragmentos</button>
        </> : null}
        <DepuracionConsulta pregunta={pregunta.trim()} recuperacion={recuperacion} seleccion={seleccion} contexto={contextoRecuperacion}
          respuesta={respuesta} estado={estado} error={error} umbral={umbral} modo={modoContexto} />
        <p className="helper">La similitud no garantiza que un texto contenga la respuesta.</p>
      </details>}
    </main>
    <footer><span>ENTRE CARTAS</span><p>Respuestas apoyadas en el corpus local. Si la regla no está, te lo decimos.</p><span aria-hidden="true">♣ ♦ ♠ ♥</span></footer>
    </div>
  </div>
}
