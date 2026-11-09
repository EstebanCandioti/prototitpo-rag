import { randomUUID } from 'node:crypto';
import { crearRag } from '../rag/servicio.mjs';
import { crearRepositorioFragmentos } from '../infraestructura/fragmentos-postgres.mjs';
import { crearAplicacion } from '../aplicacion/consultar.mjs';
import { crearIdentificador } from '../aplicacion/identidad.mjs';
import { crearControlMemoria } from '../infraestructura/control-memoria.mjs';
import { configuracionAplicacion } from '../configuracion.mjs';
// Solo para los contratos HTTP históricos, con integraciones simuladas.
export function crearAplicacionParaPruebas(dependencias) {
 const config=configuracionAplicacion({UMBRAL:String(dependencias.umbralInicial??.55)});
 const rag=crearRag({...dependencias,fragmentos:crearRepositorioFragmentos(dependencias)});
 return crearAplicacion({rag,control:crearControlMemoria(),config,identificar:crearIdentificador(config),
  generar:async(prompt,{observar})=>{
   const registro={id:randomUUID(),proveedor:'simulado',modelo:'simulado',intento:1,tokens:null,duracionMs:0,resultado:'iniciada'};
   await observar(registro);
   const texto=await dependencias.responder(prompt);await observar({...registro,resultado:'completada'});return {texto};
  }});
}
