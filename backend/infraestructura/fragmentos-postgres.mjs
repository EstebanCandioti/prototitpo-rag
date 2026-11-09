// Reutiliza el buscador vectorial original y conserva los filtros SQL por juego.
export function crearRepositorioFragmentos({ db, buscar }) {
  return {
    buscar,
    async secciones(juego) {
      const { rows } = await db.query(`SELECT id, juego, origen, seccion, posicion, texto
        FROM fragmentos WHERE juego = $1 ORDER BY posicion`, [juego]);
      return rows;
    },
    async porIds(juego, ids) {
      const { rows } = await db.query(`SELECT id, juego, origen, seccion, posicion, texto
        FROM fragmentos WHERE juego = $1 AND id = ANY($2::int[])`, [juego, ids]);
      return rows;
    },
  };
}
