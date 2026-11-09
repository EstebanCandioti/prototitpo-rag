export function errorAplicacion(estado, codigo, mensaje) {
  return Object.assign(new Error(mensaje), { estado, codigo, publico: true });
}
export function errorPublico(error) {
  if (error.publico) return { estado: error.estado, codigo: error.codigo, error: error.message };
  if (error.estado && error.estado < 500) return { estado: error.estado, codigo: 'CONSULTA_INVALIDA', error: error.message };
  if (error.codigo === 'OLLAMA_NO_DISPONIBLE' || error.message?.includes('¿Está abierto Ollama?')) {
    return { estado: 503, codigo: 'OLLAMA_NO_DISPONIBLE', error: 'Ollama no está disponible. Volvé a intentar más tarde.' };
  }
  if (error.code === 'ECONNREFUSED' || error.code === '57P01' || error.code === 'ETIMEDOUT' || error.errors?.some(e => e.code === 'ECONNREFUSED')) {
    return { estado: 503, codigo: 'DATOS_NO_DISPONIBLES', error: 'PostgreSQL no está disponible. Volvé a intentar más tarde.' };
  }
  return { estado: 502, codigo: 'CONSULTA_FALLIDA', error: 'No se pudo completar la consulta. Volvé a intentar con la misma clave para comprobar su resultado.' };
}
// Compatibilidad de las rutas de diagnóstico existentes; la API v1 usa códigos
// de servicio estables y no entrega detalles del proveedor ni de conexiones.
export function errorDiagnostico(error) {
  const estado=error.estado??500;
  const conexion=error.code==='ECONNREFUSED'||error.code==='57P01'||error.code==='ETIMEDOUT'||error.errors?.some(e=>e.code==='ECONNREFUSED');
  return {estado,codigo:error.codigo??'DIAGNOSTICO_FALLIDO',error:estado===500
    ? conexion?'PostgreSQL no está disponible. Iniciá la base de datos y volvé a buscar.'
      :error.message?.includes('¿Está abierto Ollama?')?'Ollama no está disponible. Iniciá Ollama y volvé a buscar.'
      :'No se pudo completar la solicitud. Revisá la consola del servidor.'
    :error.message};
}
