import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { atenderConsulta } from './backend/http/consultas.mjs';
import { errorPublico } from './backend/errores.mjs';

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function origenPermitido(origen, host, origenPublico, permitirProxyLocalHttps) {
  try {
    const url = new URL(origen);
    return url.origin === origen && ((url.protocol === 'http:' && url.origin === `http://${host}`) ||
      (url.protocol === 'https:' && ((origenPublico !== undefined && url.origin === origenPublico) ||
        // El túnel de VS Code puede usar un puerto local distinto del backend.
        // Se conserva la comprobación de mismo origen, limitada a localhost y
        // habilitada explícitamente por la configuración de Codespaces.
        (permitirProxyLocalHttps === true && url.hostname === 'localhost' && url.origin === `https://${host}`))));
  }
  catch { return false; }
}


// El HTTP recibe un caso de uso ya compuesto; no construye proveedores ni DB.
export function crearServidor({ juegos, dist, origenPublico, permitirProxyLocalHttps = false, aplicacion }) {
  if (!aplicacion) throw new Error('Falta inyectar la aplicación de consultas.');
  function json(res, estado, datos) {
    res.writeHead(estado, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(datos));
  }
  async function cuerpoJson(req) {
    const partes=[]; let bytes=0;
    for await (const parte of req) {
      bytes+=parte.length;
      if(bytes>16000)throw Object.assign(new Error('La solicitud es demasiado grande'),{estado:413});
      partes.push(parte);
    }
    try { return JSON.parse(Buffer.concat(partes).toString('utf8')); }
    catch { throw Object.assign(new Error('El cuerpo debe ser JSON válido'),{estado:400}); }
  }
  return createServer(async(req,res)=>{
    const ruta=new URL(req.url,'http://localhost').pathname;
    try {
      if(req.method==='POST'&&req.headers.origin&&!origenPermitido(req.headers.origin,req.headers.host,origenPublico,permitirProxyLocalHttps)){
        json(res,403,{error:'Origen no permitido',codigo:'ORIGEN_NO_PERMITIDO'});return;
      }
      if(req.method==='GET'&&ruta==='/api/juegos'){
        json(res,200,{juegos,umbralInicial:aplicacion.config.umbral,apiVersion:1,
          diagnosticosHabilitados:aplicacion.config.diagnosticos,autenticacion:aplicacion.config.modoIdentidad});return;
      }
      if(req.method==='POST'&&ruta==='/api/v1/consultas'){
        await atenderConsulta({req,res,aplicacion,cuerpoJson,json});return;
      }
      const diagnostico=/^\/api\/(?:diagnostico\/)?(detectar|reformular|recuperar|responder)$/.exec(ruta);
      if(req.method==='POST'&&diagnostico&&aplicacion.config.diagnosticos){
        const usuario=await aplicacion.identificar(req);
        const resultado=await aplicacion.diagnosticar({accion:diagnostico[1],datos:await cuerpoJson(req),usuario,
          ...(req.headers['idempotency-key']?{clave:req.headers['idempotency-key']}:{})});
        // La compatibilidad de diagnóstico conserva sus mensajes de error.
        json(res,resultado.estado,resultado.datos);return;
      }
      if (req.method === "GET" && !ruta.startsWith("/api/")) {
        const archivo = ruta === "/" ? "index.html" : ruta.slice(1);
        const destino = resolve(dist, archivo);
        if (!destino.startsWith(resolve(dist) + sep)) {
          json(res, 404, { error: "Ruta no encontrada" });
          return;
        }
        try {
          const contenido = await readFile(destino);
          res.writeHead(200, { "Content-Type": tipos[extname(destino)] ?? "application/octet-stream",
            "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
          res.end(contenido);
        } catch (error) {
          json(res, error.code === "ENOENT" ? 404 : 500, {
            error: ruta === "/" ? "Falta el build de React. Ejecutá npm run build." : "Archivo no encontrado",
          });
        }
        return;
      }
      json(res, 404, { error: "Ruta no encontrada" });
    } catch(error) {
      const publico=errorPublico(error);
      if(!res.headersSent)json(res,publico.estado,{error:publico.error,codigo:publico.codigo});
      else res.end();
    }
  });
}
