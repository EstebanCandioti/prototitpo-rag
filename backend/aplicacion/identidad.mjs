import { errorAplicacion } from '../errores.mjs';
// Puerto de autenticación: autenticar(req) debe verificar firma/emisor/audiencia/
// expiración con el futuro proveedor y devolver { id }. Nunca leer IDs del cuerpo.
export function crearIdentificador(config, autenticar) {
  if (config.modoIdentidad === 'externa' && typeof autenticar !== 'function') {
    throw new Error('Falta integrar un autenticador real para AUTH_MODE=externa. No se inicia una API sin protección.');
  }
  if (config.produccion && config.modoIdentidad === 'desarrollo') throw new Error('Identidad de desarrollo prohibida en producción');
  return async req => {
    if (config.modoIdentidad === 'desarrollo') return { id: config.usuarioDesarrollo, autenticacion: 'desarrollo' };
    const identidad = await autenticar(req);
    if (!identidad || typeof identidad.id !== 'string' || !identidad.id || identidad.id.length > 256) {
      throw errorAplicacion(401, 'NO_AUTENTICADO', 'Se necesita una sesión válida.');
    }
    return { id: identidad.id, autenticacion: 'externa' };
  };
}
