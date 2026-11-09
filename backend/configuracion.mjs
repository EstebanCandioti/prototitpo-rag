function entero(env, nombre, defecto, maximo = 1000000) {
  const valor = Number(env[nombre] ?? defecto);
  if (!Number.isInteger(valor) || valor < 1 || valor > maximo) throw new Error(`${nombre} no es válido`);
  return valor;
}
export function configuracionAplicacion(env = process.env) {
  const produccion = env.NODE_ENV === 'production';
  const modoIdentidad = env.AUTH_MODE ?? (produccion ? 'externa' : 'desarrollo');
  if (!['desarrollo', 'externa'].includes(modoIdentidad) || (produccion && modoIdentidad === 'desarrollo')) {
    throw new Error('AUTH_MODE=desarrollo solo está permitido fuera de producción.');
  }
  const umbral = Number(env.UMBRAL ?? .55);
  if (!Number.isFinite(umbral) || umbral < 0 || umbral > 1) throw new Error('UMBRAL debe estar entre 0 y 1');
  const tarifas = JSON.parse(env.TARIFAS_MODELOS_JSON ?? '{}');
  if (!tarifas || Array.isArray(tarifas) || typeof tarifas !== 'object') throw new Error('TARIFAS_MODELOS_JSON debe ser un objeto');
  for (const tarifa of Object.values(tarifas)) {
    if (!tarifa || typeof tarifa.moneda !== 'string' || !tarifa.moneda ||
        (tarifa.escrituraCachePorMillon !== undefined && (!Number.isFinite(tarifa.escrituraCachePorMillon) || tarifa.escrituraCachePorMillon < 0)) ||
        !['entradaPorMillon', 'salidaPorMillon', 'entradaCachePorMillon'].every(k => Number.isFinite(tarifa[k]) && tarifa[k] >= 0)) {
      throw new Error('Cada tarifa debe indicar moneda y precios no negativos de entrada, salida y entradaCachePorMillon');
    }
  }
  return Object.freeze({ produccion, modoIdentidad, usuarioDesarrollo: 'desarrollo-local',
    diagnosticos: !produccion && (env.DIAGNOSTICOS_HABILITADOS ?? 'true') === 'true',
    k: entero(env, 'RAG_K', 8, 16), umbral,
    cuotaPublica: entero(env, 'CUOTA_CONSULTAS_DIA', 50), cuotaDiagnostico: entero(env, 'CUOTA_DIAGNOSTICOS_DIA', 200),
    tarifas,
  });
}
