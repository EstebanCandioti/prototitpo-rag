export function crearOllama(env, { fetchImpl = (...args) => fetch(...args), alPedir = () => {}, esperar = ms => new Promise(r=>setTimeout(r,ms)) } = {}) {
  if (!env.MODELO_EMBEDDINGS) throw new Error('Falta MODELO_EMBEDDINGS. ¿Corriste node con --env-file=.env?');
  async function embeddingsEnLote(textos) {
    for (let intento=1;intento<=4;intento++) {
      let res;
      try {
        alPedir();
        res = await fetchImpl(`${env.URL_EMBEDDINGS ?? 'http://localhost:11434/v1'}/embeddings`, {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:env.MODELO_EMBEDDINGS,input:textos}),
          signal:AbortSignal.timeout(Number(env.EMBEDDING_TIMEOUT_MS ?? 180000)),
        });
      } catch { throw Object.assign(new Error('No contesta Ollama. ¿Está abierto Ollama?'), { codigo:'OLLAMA_NO_DISPONIBLE' }); }
      if(res.status===429&&intento<4){await esperar(10000*intento);continue;}
      if(!res.ok)throw new Error(`Ollama respondió ${res.status}`);
      const datos=await res.json();
      const vectores=datos.data.sort((a,b)=>(a.index??0)-(b.index??0)).map(d=>d.embedding);
      if(vectores.length!==textos.length)throw new Error(`Mandé ${textos.length} textos y volvieron ${vectores.length} vectores`);
      for(const vector of vectores)if(env.DIMENSIONES&&vector.length!==Number(env.DIMENSIONES))throw new Error(`El modelo devolvió ${vector.length} números y DIMENSIONES=${env.DIMENSIONES}`);
      return vectores;
    }
  }
  return { embeddingsEnLote, embedding:async texto=>(await embeddingsEnLote([texto]))[0] };
}
