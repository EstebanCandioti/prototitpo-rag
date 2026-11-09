import { errorPublico } from '../errores.mjs';
// JSON por defecto; NDJSON optativo para conservar las animaciones por etapa
// dentro de la misma petición, sin delegar decisiones RAG al navegador.
export async function atenderConsulta({req,res,aplicacion,cuerpoJson,json}) {
  const usuario=await aplicacion.identificar(req);
  const datos=await cuerpoJson(req);
  const streaming=(req.headers.accept??'').split(',').some(t=>t.trim()==='application/x-ndjson');
  function evento(valor){
    if(!streaming||res.destroyed)return;
    if(!res.headersSent)res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.write(JSON.stringify(valor)+'\n');
  }
  try {
    const resultado=await aplicacion.consultar({datos,usuario,clave:req.headers['idempotency-key'],onEvento:evento});
    if(res.headersSent){evento(resultado.estado===200?{tipo:'resultado',consulta:resultado.datos}:{tipo:'error',...resultado.datos,estadoHttp:resultado.estado});res.end();}
    else if(streaming&&resultado.estado===200){evento({tipo:'resultado',consulta:resultado.datos});res.end();}
    else json(res,resultado.estado,resultado.datos);
  } catch(error){
    if(!res.headersSent)throw error;
    const publico=errorPublico(error);evento({tipo:'error',error:publico.error,codigo:publico.codigo,estadoHttp:publico.estado});res.end();
  }
}
