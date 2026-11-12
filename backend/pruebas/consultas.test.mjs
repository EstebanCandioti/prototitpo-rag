import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearServidor } from '../../web-handler.mjs';
import { crearRag } from '../rag/servicio.mjs';
import { crearAplicacion } from '../aplicacion/consultar.mjs';
import { crearIdentificador } from '../aplicacion/identidad.mjs';
import { configuracionAplicacion } from '../configuracion.mjs';
import { crearControlMemoria } from '../infraestructura/control-memoria.mjs';
import { crearChat, tokensDe } from '../infraestructura/chat.mjs';
import { calcularCosto } from '../aplicacion/costos.mjs';
import { crearOllama } from '../infraestructura/ollama.mjs';

const plantilla=await readFile(new URL('../../prompt.txt',import.meta.url),'utf8');
const fuentes=[{id:1,juego:'El Truco',seccion:'Truco',origen:'https://example.org/truco',posicion:0,texto:'El truco aceptado vale dos puntos.',similitud:.8},
  {id:2,juego:'Poker',seccion:'Distribución',origen:'https://example.org/poker',posicion:1,texto:'Se reparten cinco cartas.',similitud:.9}];
async function preparar(t,opciones={}){
 const config={...configuracionAplicacion({}),...opciones.config};
 const control=opciones.control??crearControlMemoria();
 const llamadas={chat:[],embedding:[],busqueda:[],selecciones:[]};
 const chat=crearChat({API_KEY:'simulada-no-real',MODELO_CHAT:'modelo-prueba'}, {esperar:async()=>{},fetchImpl:async(url,init)=>{
  const cuerpo=JSON.parse(init.body);llamadas.chat.push(cuerpo);
  if(opciones.esperarChat)await opciones.esperarChat;
  if(opciones.transporte)throw new Error('Red interrumpida');
  const interpretacion=cuerpo.messages[0].content.startsWith('TAREA: REFORMULAR');
  const texto=interpretacion?'JSON_REEMPLAZAR':opciones.abstencion?'Esa regla no la tengo clara. Prefiero no decirte cualquier cosa.':'El truco aceptado vale dos puntos.';
  return new Response(JSON.stringify(opciones.errorLlm?{error:{message:'detalle privado proveedor'}}:{model:'modelo-prueba',usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:10}},
   choices:[{message:{content:interpretacion?JSON.stringify({pregunta:'¿Cuántos puntos vale el canto de truco en El Truco?'}):texto}}]}),{status:opciones.errorLlm?503:200,headers:{'Content-Type':'application/json'}});
 }});
 const rag=crearRag({juegos:['El Truco','Poker'],plantilla,
  embedding:async texto=>{llamadas.embedding.push(texto);if(opciones.errorEmbedding)throw Object.assign(new Error('¿Está abierto Ollama?'),{codigo:'OLLAMA_NO_DISPONIBLE'});return [1,0];},
  fragmentos:{
   buscar:async(vector,juego,k)=>{llamadas.busqueda.push({juego,k});return fuentes.filter(f=>f.juego===juego).map(f=>({...f,similitud:opciones.bajoCorte?.2:f.similitud}));},
   secciones:async juego=>fuentes.filter(f=>f.juego===juego),
   porIds:async(juego,ids)=>{llamadas.selecciones.push(ids);return fuentes.filter(f=>f.juego===juego&&ids.includes(f.id));},
  },responder:async()=>{throw new Error('No usar la fachada sin medición');},
 });
 let usuario='usuario-verificado-a';
 const identificar=opciones.identificar??crearIdentificador({...config,modoIdentidad:'externa'},async()=>usuario?{id:usuario}:null);
 const aplicacion=crearAplicacion({rag,control,generar:chat,config,identificar});
 const servidor=crearServidor({juegos:['El Truco','Poker'],umbralInicial:.55,dist:'frontend/dist',aplicacion});
 await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{servidor.close(r);servidor.closeAllConnections();}));
 const base=`http://127.0.0.1:${servidor.address().port}`;
 async function post(datos,clave=randomUUID(),headers={},ruta='/api/v1/consultas'){
  const res=await fetch(base+ruta,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':clave,...headers},body:JSON.stringify(datos)});
  return {estado:res.status,datos:await res.json()};
 }
 return {post,base,control,llamadas,config,aplicacion,setUsuario:valor=>{usuario=valor;}};
}

test('operación completa: selección del servidor, fuentes verificadas y uso/costo registrado',async t=>{
 const p=await preparar(t,{config:{tarifas:{'modelo-prueba':{entradaPorMillon:1,salidaPorMillon:2,entradaCachePorMillon:.1,moneda:'USD'}}}});
 const r=await p.post({pregunta:'¿Cuánto vale el truco en El Truco?'});
 assert.equal(r.estado,200);assert.equal(r.datos.estado,'respondida');assert.equal(r.datos.juego,'El Truco');assert.equal(r.datos.baraja,'espanola');
 assert.deepEqual(r.datos.fuentes.map(f=>f.id),[1]);assert.deepEqual(p.llamadas.selecciones,[[1]]);assert.equal(p.llamadas.chat.length,1);
 assert.equal(p.llamadas.busqueda[0].k,8);assert.match(p.llamadas.chat[0].messages[0].content,/dos puntos/);assert.doesNotMatch(p.llamadas.chat[0].messages[0].content,/Se reparten cinco/);
 const registro=[...p.control.llamadas.values()][0];assert.equal(registro.modelo,'modelo-prueba');assert.equal(registro.proveedor,'openai');assert.equal(registro.etapa,'generacion');
 assert.deepEqual(registro.tokens,{entrada:100,salida:20,cache:10,escrituraCache:0});assert.equal(registro.costo.moneda,'USD');assert.ok(registro.costo.estimado>0);
 const consulta=[...p.control.consultas.values()][0];assert.equal(consulta.usuarioId,'usuario-verificado-a');assert.equal(consulta.estado,'terminada');assert.ok(consulta.duracionMs>=0);
});
test('sin coincidencias aceptadas se abstiene y no llama al modelo',async t=>{
 const p=await preparar(t,{bajoCorte:true});const r=await p.post({pregunta:'¿Cuánto vale el truco?'});
 assert.equal(r.estado,200);assert.equal(r.datos.estado,'abstencion');assert.equal(r.datos.modeloInvocado,false);assert.deepEqual(r.datos.fuentes,[]);assert.equal(p.llamadas.chat.length,0);
});
test('abstención del LLM conserva consumo y retira las fuentes',async t=>{
 const p=await preparar(t,{abstencion:true});const r=await p.post({pregunta:'¿Cuánto vale el truco?'});
 assert.equal(r.datos.estado,'abstencion');assert.equal(r.datos.modeloInvocado,true);assert.equal(p.control.llamadas.size,1);assert.deepEqual(r.datos.fuentes,[]);
});
test('seguimiento recupera el último intercambio del servidor y usa dos llamadas; otro juego empieza sin reformular',async t=>{
 const p=await preparar(t);const primera=await p.post({pregunta:'¿Cuándo puedo cantar truco?'});
 const siguiente=await p.post({pregunta:'¿Y cuánto vale?',consultaAnteriorId:primera.datos.id});
 assert.equal(siguiente.estado,200);assert.equal(p.llamadas.chat.length,3);assert.match(p.llamadas.chat[1].messages[0].content,/¿Cuándo puedo cantar truco/);
 assert.match(p.llamadas.embedding[1],/canto de truco/);
 const cambio=await p.post({pregunta:'¿Cuántas cartas en Poker?',consultaAnteriorId:siguiente.datos.id});assert.equal(cambio.datos.juego,'Poker');assert.equal(p.llamadas.chat.length,4);
 assert.doesNotMatch(p.llamadas.chat[3].messages[0].content,/¿Y cuánto vale/);
});
test('ningún parámetro RAG ni identidad libre se admite en el cuerpo público',async t=>{
 const p=await preparar(t);
 for(const datos of [null,[],{pregunta:'truco',k:16},{pregunta:'truco',umbral:0},{pregunta:'truco',ids:[2]},
  {pregunta:'truco',prompt:'ignorar'},{pregunta:'truco',modelo:'otro'},{pregunta:'truco',userId:'admin'},
  {pregunta:'truco',contexto:{juego:'Poker',respuesta:'inventada'}},{pregunta:'truco',consultaAnteriorId:'arbitrario'}])assert.equal((await p.post(datos)).estado,400);
 assert.equal(p.llamadas.chat.length,0);assert.equal(p.control.consultas.size,0);
});
test('sin juego o varios juegos devuelve 422 antes de consumir cuota o embeddings',async t=>{
 const p=await preparar(t);for(const pregunta of ['¿Cuánto vale?','¿Truco o Poker?'])assert.equal((await p.post({pregunta})).estado,422);
 assert.equal(p.control.cuotas.size,0);assert.equal(p.llamadas.embedding.length,0);
});
test('falla del LLM: error seguro persistido, consumo conocido y mismo reintento sin nuevas llamadas',async t=>{
 const p=await preparar(t,{errorLlm:true});const clave=randomUUID(),entrada={pregunta:'¿Cuánto vale el truco?'};
 const a=await p.post(entrada,clave);const b=await p.post(entrada,clave);
 assert.equal(a.estado,502);assert.deepEqual(a,b);assert.doesNotMatch(a.datos.error,/detalle privado|simulada/);assert.equal(p.llamadas.chat.length,1);
 assert.equal([...p.control.llamadas.values()][0].resultado,'http_503');
});
test('fallo de transporte no se reintenta automáticamente y no inventa tokens ni costos',async t=>{
 const p=await preparar(t,{transporte:true});const r=await p.post({pregunta:'¿Cuánto vale el truco?'});
 assert.equal(r.estado,502);assert.equal(p.llamadas.chat.length,1);const registro=[...p.control.llamadas.values()][0];assert.equal(registro.tokens,null);assert.equal(registro.costo,null);
});
test('cuota agotada impide incluso el embedding; diagnóstico usa una cuota distinta',async t=>{
 const p=await preparar(t,{config:{cuotaPublica:1,cuotaDiagnostico:1}});
 const primera=await p.post({pregunta:'¿Cuánto vale el truco?'});assert.equal(primera.estado,200);
 const agotada=await p.post({pregunta:'¿Cuándo puedo cantar truco?'});assert.equal(agotada.estado,429);assert.equal(agotada.datos.codigo,'CUOTA_AGOTADA');assert.equal(p.llamadas.embedding.length,1);
 const diag=await p.post({pregunta:'truco'},randomUUID(),{},'/api/diagnostico/detectar');assert.equal(diag.estado,200);
 const limite=await p.post({pregunta:'truco'},randomUUID(),{},'/api/diagnostico/detectar');assert.equal(limite.estado,429);
});
test('misma clave completada no gasta dos veces; otra entrada con esa clave es conflicto',async t=>{
 const p=await preparar(t,{config:{cuotaPublica:1}});const clave=randomUUID();const a=await p.post({pregunta:'¿Cuánto vale el truco?'},clave);
 const b=await p.post({pregunta:'¿Cuánto vale el truco?'},clave);assert.deepEqual(a,b);assert.equal(p.llamadas.chat.length,1);assert.equal(p.llamadas.embedding.length,1);
 assert.equal((await p.post({pregunta:'¿Cuándo cantar truco?'},clave)).estado,409);
});
test('solicitudes simultáneas con misma clave no duplican la generación y distintas claves no superan la última cuota',async t=>{
 let liberar;const espera=new Promise(r=>{liberar=r;});const p=await preparar(t,{esperarChat:espera,config:{cuotaPublica:1}});
 const clave=randomUUID(),datos={pregunta:'¿Cuánto vale el truco?'};const primera=p.post(datos,clave);
 while(!p.llamadas.chat.length)await new Promise(r=>setTimeout(r,5));
 const simultanea=await p.post(datos,clave);assert.equal(simultanea.estado,409);assert.equal(simultanea.datos.codigo,'CONSULTA_EN_CURSO');
 const distinta=await p.post(datos);assert.equal(distinta.estado,429);liberar();assert.equal((await primera).estado,200);assert.equal(p.llamadas.chat.length,1);
});
test('contexto e idempotencia quedan aislados por usuario verificado y los encabezados con IDs libres se ignoran',async t=>{
 const p=await preparar(t,{config:{cuotaPublica:1}});const clave=randomUUID();const a=await p.post({pregunta:'truco'},clave);
 assert.equal((await p.post({pregunta:'truco'},randomUUID(),{'X-User-Id':'otro'})).estado,429);
 p.setUsuario('usuario-verificado-b');assert.equal((await p.post({pregunta:'¿Y cuánto vale?',consultaAnteriorId:a.datos.id})).estado,404);
 assert.equal((await p.post({pregunta:'truco'},clave)).estado,200);p.setUsuario(null);assert.equal((await p.post({pregunta:'truco'})).estado,401);
});
test('producción falla sin autenticador real y desactiva también los alias de diagnóstico',async t=>{
 const config=configuracionAplicacion({NODE_ENV:'production',DIAGNOSTICOS_HABILITADOS:'true'});
 assert.equal(config.diagnosticos,false);assert.throws(()=>crearIdentificador(config),/autenticador real/);
 assert.throws(()=>configuracionAplicacion({NODE_ENV:'production',AUTH_MODE:'desarrollo'}));
 const p=await preparar(t,{config});for(const ruta of ['/api/detectar','/api/diagnostico/responder'])assert.equal((await p.post({pregunta:'truco',ids:[]},randomUUID(),{},ruta)).estado,404);
});
test('NDJSON mantiene juego, estados y resultado en una sola petición, incluso una respuesta en caché',async t=>{
 const p=await preparar(t),clave=randomUUID();
 async function consultar(){const r=await fetch(p.base+'/api/v1/consultas',{method:'POST',headers:{Accept:'application/x-ndjson','Content-Type':'application/json','Idempotency-Key':clave},body:JSON.stringify({pregunta:'truco'})});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/ndjson/);return (await r.text()).trim().split('\n').map(s=>JSON.parse(s));}
 const eventos=await consultar();assert.deepEqual(eventos.map(e=>e.tipo),['juego','etapa','etapa','resultado']);assert.equal(eventos[1].estado,'busqueda');assert.equal(eventos[2].estado,'generacion');
 const repetida=await consultar();assert.equal(repetida.length,1);assert.deepEqual(repetida[0],eventos.at(-1));assert.equal(p.llamadas.chat.length,1);
});
test('NDJSON termina con error estructurado cuando el proveedor falla después del progreso',async t=>{
 const p=await preparar(t,{errorLlm:true});const r=await fetch(p.base+'/api/v1/consultas',{method:'POST',headers:{Accept:'application/x-ndjson','Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({pregunta:'truco'})});
 const eventos=(await r.text()).trim().split('\n').map(s=>JSON.parse(s));assert.equal(eventos.at(-1).tipo,'error');assert.equal(eventos.at(-1).estadoHttp,502);
});
test('sin Idempotency-Key o con Origin ajeno no se consume cuota',async t=>{
 const p=await preparar(t);assert.equal((await p.post({pregunta:'truco'},'')).estado,400);assert.equal((await p.post({pregunta:'truco'},randomUUID(),{Origin:'https://evil.example'})).estado,403);assert.equal(p.control.cuotas.size,0);
});
test('si falla el registro de intención se corta antes de gastar tokens',async t=>{
 const control=crearControlMemoria();control.registrarLlamada=async()=>{throw new Error('Almacén caído');};const p=await preparar(t,{control});
 assert.equal((await p.post({pregunta:'truco'})).estado,502);assert.equal(p.llamadas.chat.length,0);
});
test('fallo de Ollama queda registrado sin invocar al LLM',async t=>{
 const p=await preparar(t,{errorEmbedding:true});const r=await p.post({pregunta:'truco'});assert.equal(r.estado,503);assert.equal(r.datos.codigo,'OLLAMA_NO_DISPONIBLE');assert.equal(p.llamadas.chat.length,0);
});
test('uso desconocido no es cero, y no se aplica una tarifa de otro modelo',()=>{
 assert.equal(tokensDe({},'openai'),null);assert.equal(calcularCosto({modelo:'otro',tokens:{entrada:1,salida:1,cache:0}},{}),null);
 assert.equal(calcularCosto({modelo:'x',tokens:null},{x:{}}),null);
});
test('Ollama mantiene orden, dimensiones y el formato de entradas original sin llamadas reales',async()=>{
 const o=crearOllama({MODELO_EMBEDDINGS:'bge-m3',DIMENSIONES:'2'},{fetchImpl:async(url,init)=>{
  assert.deepEqual(JSON.parse(init.body),{model:'bge-m3',input:['uno','dos']});return new Response(JSON.stringify({data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]}));
 }});assert.deepEqual(await o.embeddingsEnLote(['uno','dos']),[[1,0],[0,1]]);
});
test('fallo al guardar el resultado deja reserva pendiente e impide duplicar la llamada ya realizada',async t=>{
 const control=crearControlMemoria();control.terminar=async()=>{throw new Error('Registro interrumpido');};
 const p=await preparar(t,{control});const clave=randomUUID(),datos={pregunta:'truco'};
 assert.equal((await p.post(datos,clave)).estado,502);assert.equal((await p.post(datos,clave)).estado,409);assert.equal(p.llamadas.chat.length,1);
});
test('el adaptador registra cada intento 429 y conserva el consumo informado sin duplicar el total',async()=>{
 let peticiones=0;const registros=new Map();
 const generar=crearChat({API_KEY:'simulada',MODELO_CHAT:'modelo-prueba'},{esperar:async()=>{},fetchImpl:async()=>{
  peticiones++;return new Response(JSON.stringify(peticiones===1?{error:{}}:{model:'modelo-prueba',usage:{prompt_tokens:10,completion_tokens:2},choices:[{message:{content:'dos'}}]}),{status:peticiones===1?429:200});
 }});
 const salida=await generar('pregunta',{observar:async r=>{registros.set(r.id,r);}});
 assert.equal(salida.texto,'dos');assert.equal(peticiones,2);assert.equal(registros.size,2);
 assert.equal([...registros.values()][0].resultado,'http_429');assert.equal([...registros.values()][0].tokens,null);
 assert.deepEqual([...registros.values()][1].tokens,{entrada:10,salida:2,cache:0,escrituraCache:0});
});
test('un seguimiento sin contexto aceptado registra solo la interpretación y declara que hubo llamada al modelo',async t=>{
 const opciones={};const p=await preparar(t,opciones);const a=await p.post({pregunta:'¿Cuándo canto truco?'});opciones.bajoCorte=true;
 const b=await p.post({pregunta:'¿Y cuánto vale?',consultaAnteriorId:a.datos.id});
 assert.equal(b.datos.estado,'abstencion');assert.equal(b.datos.modeloInvocado,true);assert.equal(p.llamadas.chat.length,2);assert.deepEqual(b.datos.fuentes,[]);
});
test('el costo distingue lectura y escritura de caché y exige su tarifa cuando hay escritura',()=>{
 const llamada={modelo:'prueba',tokens:{entrada:100,salida:10,cache:20,escrituraCache:30}};
 const tarifas={prueba:{entradaPorMillon:1,salidaPorMillon:2,entradaCachePorMillon:.1,escrituraCachePorMillon:1.25,moneda:'USD'}};
 assert.equal(calcularCosto(llamada,tarifas).estimado,(50+2+37.5+20)/1e6);
 delete tarifas.prueba.escrituraCachePorMillon;assert.equal(calcularCosto(llamada,tarifas),null);
 assert.equal(tokensDe({usage:{prompt_tokens:5,completion_tokens:2,prompt_tokens_details:{cached_tokens:3,cache_write_tokens:4}}},'openai'),null);
});
