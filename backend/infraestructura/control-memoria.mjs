import { randomUUID } from 'node:crypto';
import { errorAplicacion } from '../errores.mjs';
// Implementación solo para pruebas con proveedores simulados. Nunca se usa al
// arrancar servidor-web.mjs: el servicio real siempre inyecta PostgreSQL.
export function crearControlMemoria() {
  const consultas = new Map(), cuotas = new Map(), llamadas = new Map();
  return {
    consultas, cuotas, llamadas,
    async reservar({ usuarioId, ambito, clave, huella, entrada, limite, ahora = new Date() }) {
      const llave = JSON.stringify([usuarioId, ambito, clave]);
      const existente = consultas.get(llave);
      if (existente) {
        if (existente.huella !== huella) throw errorAplicacion(409, 'CLAVE_REUTILIZADA', 'La clave de idempotencia ya corresponde a otra solicitud.');
        return { ...structuredClone(existente), nueva: false };
      }
      const cuota = JSON.stringify([usuarioId, ambito, ahora.toISOString().slice(0, 10)]);
      const usadas = cuotas.get(cuota) ?? 0;
      if (usadas >= limite) throw errorAplicacion(429, 'CUOTA_AGOTADA', 'Se agotó la cuota diaria de consultas de este usuario.');
      const registro = { id: randomUUID(), usuarioId, ambito, clave, huella, entrada: structuredClone(entrada), estado: 'procesando' };
      // Sin await entre comprobar, reservar e insertar: atómico en un proceso JS.
      cuotas.set(cuota, usadas + 1); consultas.set(llave, registro);
      return { ...structuredClone(registro), nueva: true };
    },
    async anterior(id, usuarioId) {
      return structuredClone([...consultas.values()].find(c => c.id === id && c.usuarioId === usuarioId && c.ambito === 'publico' && c.estado === 'terminada' && c.httpEstado === 200));
    },
    async registrarLlamada(registro) { llamadas.set(registro.id, structuredClone(registro)); },
    async terminar(id, salida, httpEstado, duracionMs) {
      const consulta = [...consultas.values()].find(c => c.id === id);
      Object.assign(consulta, { estado: 'terminada', salida: structuredClone(salida), httpEstado, duracionMs });
    },
  };
}
