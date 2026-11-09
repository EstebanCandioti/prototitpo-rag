import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { errorAplicacion } from '../errores.mjs';
const convertir = fila => fila && ({ id: fila.id, usuarioId: fila.usuario_id, entrada: fila.entrada,
  estado: fila.estado, salida: fila.salida, httpEstado: fila.http_estado, huella: fila.huella });
export function crearControlPostgres(db) {
  return {
    async preparar() { await db.query(await readFile(new URL('./control.sql', import.meta.url), 'utf8')); },
    async reservar({ usuarioId, ambito, clave, huella, entrada, limite, ahora = new Date() }) {
      const cliente = await db.connect();
      try {
        await cliente.query('BEGIN');
        // Bloqueo transaccional por usuario/ámbito compartido entre procesos e
        // instancias: serializa claves repetidas y reservas de la última cuota.
        await cliente.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([usuarioId, ambito])]);
        const { rows } = await cliente.query('SELECT * FROM rag_consultas WHERE usuario_id=$1 AND ambito=$2 AND clave=$3', [usuarioId, ambito, clave]);
        if (rows[0]) {
          if (rows[0].huella !== huella) throw errorAplicacion(409, 'CLAVE_REUTILIZADA', 'La clave de idempotencia ya corresponde a otra solicitud.');
          await cliente.query('COMMIT');
          return { ...convertir(rows[0]), nueva: false };
        }
        const cuota = await cliente.query(`INSERT INTO rag_cuotas_diarias (usuario_id,ambito,dia,usadas) VALUES ($1,$2,$3,1)
          ON CONFLICT (usuario_id,ambito,dia) DO UPDATE SET usadas=rag_cuotas_diarias.usadas+1
          WHERE rag_cuotas_diarias.usadas < $4 RETURNING usadas`, [usuarioId, ambito, ahora.toISOString().slice(0,10), limite]);
        if (!cuota.rows.length) throw errorAplicacion(429, 'CUOTA_AGOTADA', 'Se agotó la cuota diaria de consultas de este usuario.');
        const registro = await cliente.query(`INSERT INTO rag_consultas (id,usuario_id,ambito,clave,huella,entrada,estado)
          VALUES ($1,$2,$3,$4,$5,$6,'procesando') RETURNING *`, [randomUUID(), usuarioId, ambito, clave, huella, JSON.stringify(entrada)]);
        await cliente.query('COMMIT');
        return { ...convertir(registro.rows[0]), nueva: true };
      } catch (error) { await cliente.query('ROLLBACK'); throw error; }
      finally { cliente.release(); }
    },
    async anterior(id, usuarioId) {
      const { rows } = await db.query(`SELECT * FROM rag_consultas WHERE id=$1 AND usuario_id=$2
        AND ambito='publico' AND estado='terminada' AND http_estado=200`, [id, usuarioId]);
      return convertir(rows[0]);
    },
    async registrarLlamada(r) {
      await db.query(`INSERT INTO rag_llamadas (id,consulta_id,etapa,proveedor,modelo,intento,resultado,entrada_tokens,salida_tokens,cache_tokens,duracion_ms,costo_estimado,moneda,escritura_cache_tokens,uso)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET modelo=EXCLUDED.modelo,resultado=EXCLUDED.resultado,
        entrada_tokens=EXCLUDED.entrada_tokens,salida_tokens=EXCLUDED.salida_tokens,cache_tokens=EXCLUDED.cache_tokens,
        escritura_cache_tokens=EXCLUDED.escritura_cache_tokens,uso=EXCLUDED.uso,duracion_ms=EXCLUDED.duracion_ms,costo_estimado=EXCLUDED.costo_estimado,moneda=EXCLUDED.moneda`,
      [r.id,r.consultaId,r.etapa,r.proveedor,r.modelo,r.intento,r.resultado,r.tokens?.entrada??null,
        r.tokens?.salida??null,r.tokens?.cache??null,r.duracionMs,r.costo?.estimado??null,r.costo?.moneda??null,r.tokens?.escrituraCache??null,r.uso??null]);
    },
    async terminar(id, salida, httpEstado, duracionMs) {
      await db.query(`UPDATE rag_consultas SET estado='terminada',salida=$2,http_estado=$3,duracion_ms=$4,terminada_en=now() WHERE id=$1`,
        [id, JSON.stringify(salida), httpEstado, duracionMs]);
    },
  };
}
