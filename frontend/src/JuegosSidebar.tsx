import { useRef, useState } from 'react'

export function JuegosSidebar({ juegos, juegoActual, cargando, error }: {
  juegos: string[]; juegoActual?: string; cargando: boolean; error: boolean
}) {
  const [abierta, setAbierta] = useState(() => window.matchMedia?.('(min-width: 960px)').matches ?? false)
  const boton = useRef<HTMLButtonElement>(null)
  function cerrar() { setAbierta(false); boton.current?.focus() }
  return <>
    {abierta && <button className="games-backdrop" aria-label="Cerrar lista de juegos" onClick={cerrar} />}
    <aside className="games-sidebar" data-abierta={abierta} aria-label="Consulta de juegos disponibles"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cerrar() } }}>
      <button ref={boton} className="games-toggle" aria-expanded={abierta} aria-controls="lista-juegos"
        aria-label={abierta ? 'Plegar lista de juegos' : 'Mostrar juegos disponibles'} onClick={() => setAbierta(!abierta)}>
        <span className="games-mark" aria-hidden="true">♣</span>
        <span className="games-toggle-label">Juegos</span>
        <span className="games-chevron" aria-hidden="true">{abierta ? '‹' : '›'}</span>
      </button>
      <section id="lista-juegos" className="games-panel" hidden={!abierta} aria-labelledby="titulo-juegos" tabIndex={0}>
        <div className="games-heading"><p className="eyebrow">EL REGLAMENTO A MANO</p>
          <h2 id="titulo-juegos">Juegos disponibles <span>{juegos.length}</span></h2>
          <p className="helper">Mencioná uno de estos juegos en tu pregunta.</p>
        </div>
        {cargando ? <p className="helper games-notice">Cargando juegos…</p>
          : error ? <p className="helper games-notice">No se pudo cargar la lista. Reintentá la conexión en la página.</p>
          : juegos.length === 0 ? <p className="helper games-notice">No hay juegos disponibles.</p>
          : <ul className="games-list">{juegos.map(juego => <li key={juego}
            className={juego === juegoActual ? 'game-current' : undefined} aria-current={juego === juegoActual ? 'true' : undefined}>
            <span>{juego}</span>{juego === juegoActual && <span className="game-indicator" aria-label="Juego de la consulta actual">●</span>}
          </li>)}</ul>}
      </section>
    </aside>
  </>
}
