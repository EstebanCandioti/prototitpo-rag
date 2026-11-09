import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { crearControlPostgres } from '../infraestructura/control-postgres.mjs';
// Optativo y sin proveedores externos: usa solo TEST_DATABASE_URL, nunca la base
// de trabajo por defecto. Todo vive en un esquema aleatorio que se elimina.
test('PostgreSQL real: reservas entre dos instancias, idempotencia, cuota atómica y uso persistido',
 {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 const esquema='rag_mobile_test_'+randomUUID().replaceAll('-','');
 let pool;
 t.after(async()=>{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);await admin.end();});
 await admin.query(`CREATE SCHEMA ${esquema}`);
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${esquema}`});
 const a=crearControlPostgres(pool),b=crearControlPostgres(pool);await a.preparar();
 const entrada={usuarioId:'a',ambito:'publico',clave:'clave-durable',huella:'huella',entrada:{pregunta:'truco'},limite:1};
 const simultaneas=await Promise.all([a.reservar(entrada),b.reservar(entrada)]);
 assert.equal(simultaneas.filter(r=>r.nueva).length,1);assert.equal(simultaneas[0].id,simultaneas[1].id);
 await assert.rejects(()=>b.reservar({...entrada,clave:'otra-clave'}),e=>e.codigo==='CUOTA_AGOTADA');
 await assert.rejects(()=>b.reservar({...entrada,huella:'distinta'}),e=>e.codigo==='CLAVE_REUTILIZADA');
 const id=simultaneas[0].id;
 await a.registrarLlamada({id:randomUUID(),consultaId:id,etapa:'generacion',proveedor:'simulado',modelo:'prueba',intento:1,resultado:'completada',tokens:{entrada:10,salida:2,cache:0},duracionMs:15,costo:null});
 await a.terminar(id,{id,estado:'respondida',juego:'El Truco',respuesta:'dos'},200,20);
 const repetida=await b.reservar(entrada);assert.equal(repetida.estado,'terminada');assert.equal(repetida.nueva,false);
 assert.equal((await b.anterior(id,'a')).salida.respuesta,'dos');assert.equal(await b.anterior(id,'b'),undefined);
 const {rows}=await pool.query('SELECT entrada_tokens,salida_tokens,costo_estimado FROM rag_llamadas');assert.deepEqual(rows,[{entrada_tokens:10,salida_tokens:2,costo_estimado:null}]);
 const distintas=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?a:b).reservar({...entrada,usuarioId:'otra-persona',clave:'distinta-'+i})));
 assert.equal(distintas.filter(r=>r.status==='fulfilled').length,1);assert.equal(distintas.filter(r=>r.status==='rejected'&&r.reason.codigo==='CUOTA_AGOTADA').length,7);
});
