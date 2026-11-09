import { createHash, randomUUID } from 'node:crypto';
import { seleccionarContexto } from '../../seleccionar-contexto.mjs';
import { metadatoJuego } from '../../metadatos-juegos.mjs';
import { validarPregunta } from '../rag/servicio.mjs';
import { calcularCosto } from './costos.mjs';
import { errorAplicacion, errorPublico, errorDiagnostico } from '../errores.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validarEntrada(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) || Object.keys(datos).some(k=>!['pregunta','consultaAnteriorId'].includes(k))) {
    throw errorAplicacion(400,'CUERPO_INVALIDO','Enviá únicamente pregunta y, si corresponde, consultaAnteriorId.');
  }
  const pregunta=validarPregunta(datos);
  if(datos.consultaAnteriorId!==undefined && (typeof datos.consultaAnteriorId!=='string'||!uuid.test(datos.consultaAnteriorId))) {
    throw errorAplicacion(400,'CONTEXTO_INVALIDO','consultaAnteriorId debe ser el ID de una consulta anterior.');
  }
  return { pregunta, ...(datos.consultaAnteriorId ? { consultaAnteriorId:datos.consultaAnteriorId.toLowerCase() } : {}) };
}
export function crearAplicacion({ rag, control, generar, identificar, config }) {
  async function ejecutar({ usuario, ambito, clave, entrada, tarea }) {
    if(typeof clave!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(clave)) {
      throw errorAplicacion(400,'CLAVE_REQUERIDA','Enviá Idempotency-Key con entre 8 y 100 letras, números, guiones o guiones bajos.');
    }
    const inicio=performance.now();
    const huella=createHash('sha256').update(JSON.stringify(entrada)).digest('hex');
    const registro=await control.reservar({usuarioId:usuario.id,ambito,clave,huella,entrada,
      limite:ambito==='publico'?config.cuotaPublica:config.cuotaDiagnostico});
    if(!registro.nueva){
      if(registro.estado==='procesando')throw errorAplicacion(409,'CONSULTA_EN_CURSO','La consulta sigue en proceso o su ejecución quedó pendiente. Reintentá con la misma clave; no se genera de nuevo automáticamente.');
      return {estado:registro.httpEstado,datos:registro.salida};
    }
    function generarEtapa(etapa){
      return async prompt => {
        const resultado=await generar(prompt,{observar:async intento=>{
          await control.registrarLlamada({...intento,consultaId:registro.id,etapa,costo:calcularCosto(intento,config.tarifas)});
        }});
        return resultado.texto;
      };
    }
    let estado=200,datos;
    try { datos=await tarea({id:registro.id,generarEtapa}); }
    catch(error){const publico=ambito==='diagnostico'?errorDiagnostico(error):errorPublico(error);estado=publico.estado;datos={error:publico.error,codigo:publico.codigo,consultaId:registro.id};}
    // Si el proceso/almacén falla aquí, el registro permanece procesando. Se
    // conserva la reserva y nunca se reejecuta una llamada de costo incierto.
    await control.terminar(registro.id,datos,estado,Math.round(performance.now()-inicio));
    return {estado,datos};
  }
  async function consultar({datos,clave,usuario,onEvento=()=>{}}){
    const entrada=validarEntrada(datos);
    let contexto;
    if(entrada.consultaAnteriorId){
      const anterior=await control.anterior(entrada.consultaAnteriorId,usuario.id);
      if(!anterior)throw errorAplicacion(404,'CONSULTA_ANTERIOR_NO_ENCONTRADA','La consulta anterior no está disponible para este usuario.');
      contexto={juego:anterior.salida.juego,pregunta:anterior.entrada.pregunta,respuesta:anterior.salida.respuesta.slice(0,4000)};
    }
    // Detección/validación antes de reservar; ninguna integración de costo aún.
    const consulta=rag.resolver({pregunta:entrada.pregunta,...(contexto?{contexto}:{})});
    return ejecutar({usuario,ambito:'publico',clave,entrada,tarea:async({id,generarEtapa})=>{
      const metadatos=metadatoJuego(consulta.juego);
      onEvento({tipo:'juego',juego:consulta.juego,baraja:metadatos.baraja});
      let preguntaResuelta;
      if(consulta.contexto?.pregunta){
        onEvento({tipo:'etapa',estado:'reformulacion'});
        preguntaResuelta=(await rag.reformular(consulta,generarEtapa('reformulacion'))).preguntaResuelta;
      }
      const datosRag={pregunta:consulta.pregunta,...(consulta.contexto?{contexto:consulta.contexto}:{}),...(preguntaResuelta?{preguntaResuelta}:{})};
      onEvento({tipo:'etapa',estado:'busqueda'});
      const recuperacion=await rag.recuperar({...datosRag,k:config.k,ampliar:true});
      const seleccion=seleccionarContexto(recuperacion,config.umbral,'secciones');
      if(seleccion.ids.length)onEvento({tipo:'etapa',estado:'generacion'});
      const respuesta=await rag.responderSeleccion({...datosRag,ids:seleccion.ids},generarEtapa('generacion'));
      return {id,estado:respuesta.sinRespuesta?'abstencion':'respondida',juego:consulta.juego,baraja:metadatos.baraja,
        respuesta:respuesta.respuesta,modeloInvocado:respuesta.modeloInvocado||Boolean(preguntaResuelta),fuentes:respuesta.fuentes.map(({id,juego,seccion,origen,texto})=>({id,juego,seccion,origen,texto}))};
    }});
  }
  async function diagnosticar({accion,datos,clave=randomUUID(),usuario}){
    if(!config.diagnosticos)throw errorAplicacion(404,'RUTA_NO_ENCONTRADA','Ruta no encontrada');
    return ejecutar({usuario,ambito:'diagnostico',clave,entrada:{accion,datos},tarea:async({generarEtapa})=>{
      if(accion==='detectar')return rag.detectar(datos);
      if(accion==='reformular')return rag.reformular(datos,generarEtapa('reformulacion'));
      if(accion==='recuperar')return rag.recuperar(datos);
      if(accion==='responder')return rag.responderSeleccion(datos,generarEtapa('generacion'));
      throw errorAplicacion(404,'RUTA_NO_ENCONTRADA','Ruta no encontrada');
    }});
  }
  return {consultar,diagnosticar,identificar,config};
}
