import { randomUUID } from 'node:crypto';
import { errorAplicacion } from '../errores.mjs';
export function tokensDe(datos, proveedor) {
  const uso = proveedor === 'gemini' ? datos?.usageMetadata : datos?.usage;
  const entrada = proveedor === 'gemini' ? uso?.promptTokenCount : uso?.prompt_tokens;
  const salida = proveedor === 'gemini' ? (uso?.candidatesTokenCount === undefined ? undefined : uso.candidatesTokenCount + (uso.thoughtsTokenCount ?? 0)) : uso?.completion_tokens;
  const cache = proveedor === 'gemini' ? uso?.cachedContentTokenCount ?? 0 : uso?.prompt_tokens_details?.cached_tokens ?? 0;
  const escrituraCache = proveedor === 'gemini' ? 0 : uso?.prompt_tokens_details?.cache_write_tokens ?? 0;
  return Number.isInteger(escrituraCache) && escrituraCache >= 0 && Number.isInteger(entrada) && entrada >= 0 && Number.isInteger(salida) && salida >= 0 && Number.isInteger(cache) && cache >= 0 && cache + escrituraCache <= entrada
    ? { entrada, salida, cache, escrituraCache } : null;
}
export function crearChat(env, { fetchImpl = (...args) => fetch(...args), esperar = ms => new Promise(r => setTimeout(r, ms)), alPedir = () => {} } = {}) {
  const proveedor = env.PROVEEDOR_CHAT ?? 'openai', modelo = env.MODELO_CHAT;
  const maxSalida = Number(env.CHAT_MAX_SALIDA_TOKENS ?? 4096);
  if (!Number.isInteger(maxSalida) || maxSalida < 1) throw new Error('CHAT_MAX_SALIDA_TOKENS debe ser un entero positivo');
  return async function generar(prompt, { observar = async () => {} } = {}) {
    if (!env.API_KEY || !modelo) throw errorAplicacion(503, 'CHAT_NO_CONFIGURADO', 'Falta configurar la clave o el modelo de chat en el servidor.');
    const gemini = proveedor === 'gemini';
    const url = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`
      : `${(env.URL_CHAT ?? 'https://api.openai.com/v1').replace(/\/$/,'')}/chat/completions`;
    for (let intento = 1; intento <= 4; intento++) {
      const inicio = performance.now();
      const registro = { id: randomUUID(), proveedor, modelo, intento, resultado: 'iniciada', tokens: null, duracionMs: 0 };
      // Si no se pudo registrar la intención, no se hace la llamada con costo.
      await observar(registro);
      let res, datos;
      try {
        alPedir();
        res = await fetchImpl(url, { method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(gemini ? { 'x-goog-api-key': env.API_KEY } : { Authorization: `Bearer ${env.API_KEY}` }) },
          body: JSON.stringify(gemini ? { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxSalida } }
            : { model: modelo, messages: [{ role: 'user', content: prompt }], max_completion_tokens: maxSalida }),
          signal: AbortSignal.timeout(Number(env.CHAT_TIMEOUT_MS ?? 90000)),
        });
        datos = await res.json();
      } catch {
        await observar({ ...registro, resultado: 'error_transporte', duracionMs: Math.round(performance.now()-inicio) });
        // No reintentar errores ambiguos: el proveedor pudo haber procesado/cobrado.
        throw errorAplicacion(502, 'LLM_TRANSPORTE', 'No se pudo confirmar la respuesta del proveedor. La solicitud queda registrada y no se vuelve a ejecutar automáticamente.');
      }
      const fin = { ...registro, modelo: datos.model ?? datos.modelVersion ?? modelo, tokens: tokensDe(datos, proveedor), uso: (gemini ? datos.usageMetadata : datos.usage) ?? null,
        resultado: res.ok ? 'completada' : `http_${res.status}`, duracionMs: Math.round(performance.now()-inicio) };
      await observar(fin);
      if (res.status === 429 && intento < 4) { await esperar(10000 * intento); continue; }
      if (!res.ok) throw errorAplicacion(res.status === 429 ? 503 : 502, 'LLM_NO_DISPONIBLE', 'El proveedor de respuestas no está disponible temporalmente.');
      const texto = gemini ? datos.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('') : datos.choices?.[0]?.message?.content;
      if (typeof texto !== 'string' || !texto.trim()) throw errorAplicacion(502, 'LLM_RESPUESTA_VACIA', 'El proveedor devolvió una respuesta vacía.');
      return { texto, modelo: fin.modelo, proveedor, tokens: fin.tokens, duracionMs: fin.duracionMs };
    }
  };
}
