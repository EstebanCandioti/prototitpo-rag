// Clase 8: un proveedor para cada tarea.
//   embeddings -> Ollama, en tu compu (habla como OpenAI y no pide clave)
//   respuesta  -> PROVEEDOR_CHAT=openai: OpenAI o compatibles (con URL_CHAT)
//                 PROVEEDOR_CHAT=gemini: Google AI Studio
const {
  URL_EMBEDDINGS = "http://localhost:11434/v1",
  MODELO_EMBEDDINGS,
  DIMENSIONES,
  PROVEEDOR_CHAT = "openai",
  API_KEY,
  URL_CHAT = "https://api.openai.com/v1",
  MODELO_CHAT,
} = process.env;

if (!MODELO_EMBEDDINGS) throw new Error("Falta MODELO_EMBEDDINGS. ¿Corriste node con --env-file=.env?");

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// Cuenta cuántos pedidos HTTP salieron desde que arrancó el programa (clase 7).
export let pedidos = 0;

// Hace el pedido HTTP. Si el proveedor dice "pará un poco" (429),
// espera y reintenta hasta tres veces.
async function pedir(url, cuerpo, encabezados = {}, intento = 1) {
  pedidos++;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...encabezados },
      body: JSON.stringify(cuerpo),
    });
  } catch (e) {
    if (url.startsWith(URL_EMBEDDINGS)) {
      throw new Error(`No contesta nadie en ${URL_EMBEDDINGS}. ¿Está abierto Ollama?`);
    }
    throw e;
  }
  if (res.status === 429 && intento <= 3) {
    console.log(`  (límite de pedidos: espero ${10 * intento} segundos y reintento)`);
    await new Promise(r => setTimeout(r, 10000 * intento));
    return pedir(url, cuerpo, encabezados, intento + 1);
  }
  if (!res.ok) throw new Error(`La API respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

function revisarDimension(vector) {
  if (DIMENSIONES && vector.length !== Number(DIMENSIONES)) {
    throw new Error(`El modelo devolvió ${vector.length} números y el .env dice DIMENSIONES=${DIMENSIONES}`);
  }
  return vector;
}

// Muchos textos -> muchos vectores, en UN SOLO pedido a Ollama.
// Devuelve los vectores en el mismo orden que los textos.
export async function embeddingsEnLote(textos) {
  const datos = await pedir(`${URL_EMBEDDINGS}/embeddings`, {
    model: MODELO_EMBEDDINGS,
    input: textos,
  });
  // cada resultado trae su posición (index): se ordena por las dudas
  const vectores = datos.data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(d => d.embedding);
  if (vectores.length !== textos.length) {
    throw new Error(`Mandé ${textos.length} textos y volvieron ${vectores.length} vectores`);
  }
  return vectores.map(revisarDimension);
}

// Un texto -> un vector: es un lote de uno.
export async function embedding(texto) {
  const [vector] = await embeddingsEnLote([texto]);
  return vector;
}

// La respuesta sigue saliendo de la nube, igual que en las clases 6 y 7.
export async function responder(prompt) {
  if (!API_KEY) throw new Error("Falta API_KEY del proveedor de chat en el entorno del backend");
  if (!MODELO_CHAT) throw new Error("Falta MODELO_CHAT en el .env");
  if (PROVEEDOR_CHAT === "gemini") {
    const datos = await pedir(
      `${GEMINI}/${MODELO_CHAT}:generateContent`,
      { contents: [{ role: "user", parts: [{ text: prompt }] }] },
      { "x-goog-api-key": API_KEY },
    );
    const partes = datos.candidates?.[0]?.content?.parts;
    if (!partes) throw new Error(`Respuesta vacía: ${JSON.stringify(datos)}`);
    return partes.map(p => p.text).join("");
  }
  const datos = await pedir(
    `${URL_CHAT}/chat/completions`,
    { model: MODELO_CHAT, messages: [{ role: "user", content: prompt }] },
    { "Authorization": `Bearer ${API_KEY}` },
  );
  return datos.choices[0].message.content;
}
