// Precios inyectados desde configuración; null significa que no se conoce el costo.
export function calcularCosto(llamada, tarifas) {
  const tarifa = tarifas[llamada.modelo];
  const { entrada, salida, cache, escrituraCache = 0 } = llamada.tokens ?? {};
  if (!tarifa || !Number.isInteger(entrada) || !Number.isInteger(salida) || !Number.isInteger(cache)) return null;
  if (escrituraCache > 0 && !Number.isFinite(tarifa.escrituraCachePorMillon)) return null;
  return { moneda: tarifa.moneda, estimado: ((entrada - cache - escrituraCache) * tarifa.entradaPorMillon +
    cache * tarifa.entradaCachePorMillon + escrituraCache * (tarifa.escrituraCachePorMillon ?? 0) + salida * tarifa.salidaPorMillon) / 1000000 };
}
