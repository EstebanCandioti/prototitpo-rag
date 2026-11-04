import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { detectarJuego } from "./detectar-juego.mjs";
import { metadatoJuego } from "./metadatos-juegos.mjs";

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function origenPermitido(origen, host) {
  try { const url = new URL(origen); return url.protocol === 'http:' && url.origin === `http://${host}`; }
  catch { return false; }
}

// Inyección de dependencias para probar el contrato sin invocar proveedores reales.
export function crearServidor({ juegos, umbralInicial, plantilla, dist, embedding, buscar, db, responder }) {
  const sinRespuesta = "No lo encuentro en los documentos.";
  function json(res, estado, datos) {
    res.writeHead(estado, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(datos));
  }

  async function cuerpoJson(req) {
    let contenido = "";
    for await (const parte of req) {
      contenido += parte;
      if (contenido.length > 16000) {
        const error = new Error("La solicitud es demasiado grande");
        error.estado = 413;
        throw error;
      }
    }
    try {
      return JSON.parse(contenido);
    } catch {
      const error = new Error("El cuerpo debe ser JSON válido");
      error.estado = 400;
      throw error;
    }
  }

  function validarPregunta(datos) {
    const pregunta = typeof datos?.pregunta === "string" ? datos.pregunta.trim() : "";
    if (!pregunta || pregunta.length > 1000) {
      const error = new Error("Escribí una pregunta de hasta 1000 caracteres");
      error.estado = 400;
      throw error;
    }
    return pregunta;
  }

  function juegoDePregunta(pregunta) {
    try {
      return detectarJuego(pregunta, juegos);
    } catch (error) {
      error.estado = 422;
      throw error;
    }
  }

  return createServer(async (req, res) => {
    try {
      const ruta = new URL(req.url, "http://localhost").pathname;

      if (req.method === "POST" && req.headers.origin &&
          !origenPermitido(req.headers.origin, req.headers.host)) {
        json(res, 403, { error: "Origen no permitido" });
        return;
      }

      if (req.method === "GET" && ruta === "/api/juegos") {
        json(res, 200, {
          juegos,
          umbralInicial: Number.isFinite(umbralInicial) && umbralInicial >= 0 && umbralInicial <= 1
            ? umbralInicial : 0.6,
        });
        return;
      }

      // Clasificación por nombre y metadatos del corpus: sin vectores, SQL ni LLM.
      if (req.method === "POST" && ruta === "/api/detectar") {
        const pregunta = validarPregunta(await cuerpoJson(req));
        const juego = juegoDePregunta(pregunta);
        json(res, 200, { juego, metadatos: metadatoJuego(juego) });
        return;
      }

      if (req.method === "POST" && ruta === "/api/recuperar") {
        const datos = await cuerpoJson(req);
        const pregunta = validarPregunta(datos);
        const juego = juegoDePregunta(pregunta);
        const k = Number(datos.k);
        if (!Number.isInteger(k) || k < 1 || k > 8) {
          json(res, 400, { error: "La cantidad de fragmentos debe estar entre 1 y 8" });
          return;
        }
        const resultados = await buscar(await embedding(pregunta), juego, k);
        json(res, 200, { juego, metadatos: metadatoJuego(juego), resultados });
        return;
      }

      if (req.method === "POST" && ruta === "/api/responder") {
        const datos = await cuerpoJson(req);
        const pregunta = validarPregunta(datos);
        const juego = juegoDePregunta(pregunta);
        const ids = datos.ids;
        if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => !Number.isInteger(id) || id < 1)) {
          json(res, 400, { error: "La selección de fragmentos no es válida" });
          return;
        }
        if (ids.length === 0) {
          json(res, 200, { respuesta: sinRespuesta, modeloInvocado: false, sinRespuesta: true, fuentes: [] });
          return;
        }

        const { rows } = await db.query(
          `SELECT id, juego, origen, seccion, texto
             FROM fragmentos
            WHERE juego = $1 AND id = ANY($2::int[])`,
          [juego, ids],
        );
        const porId = new Map(rows.map(r => [r.id, r]));
        if (new Set(ids).size !== ids.length || ids.some(id => !porId.has(id))) {
          json(res, 400, { error: "La selección no corresponde al juego indicado" });
          return;
        }

        const fragmentos = ids.map(id => {
          const r = porId.get(id);
          const etiqueta = `${r.juego} · ${r.seccion} · ${r.origen}`;
          return `--- ${etiqueta} ---\n${r.texto}`;
        }).join("\n\n");
        const prompt = plantilla
          .replace("{{fragmentos}}", fragmentos)
          .replace("{{pregunta}}", pregunta);
        const respuesta = await responder(prompt);
        const abstencion = respuesta.trim().startsWith("No lo encuentro en los documentos");
        json(res, 200, {
          // Las citas visibles son las fuentes estructuradas verificadas; se retira
          // el pie libre del LLM para que no pueda introducir una URL o juego ajeno.
          respuesta: abstencion ? sinRespuesta : respuesta.replace(/(?:^|\n)\s*Fuentes?:[\s\S]*$/i, "").trim(),
          modeloInvocado: true,
          sinRespuesta: abstencion,
          // Fuentes de contexto verificadas por SQL, nunca inferidas del texto del LLM.
          fuentes: abstencion ? [] : ids.map(id => porId.get(id)),
        });
        return;
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
    } catch (error) {
      const estado = error.estado ?? 500;
      if (estado === 500) console.error(error);
      const conexion = estado === 500 && (error.code === "ECONNREFUSED" ||
        error.code === "57P01" || error.code === "ETIMEDOUT" ||
        error.errors?.some(e => e.code === "ECONNREFUSED"));
      json(res, estado, { error: conexion
        ? "PostgreSQL no está disponible. Iniciá la base de datos y volvé a buscar."
        : estado === 500 && error.message?.includes("¿Está abierto Ollama?")
          ? "Ollama no está disponible. Iniciá Ollama y volvé a buscar."
        : estado === 500
          ? "No se pudo completar la solicitud. Revisá la consola del servidor."
          : error.message });
    }
  });

}
