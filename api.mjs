// Fachada compatible con los programas de consola. Las integraciones están en
// infraestructura; React nunca importa este módulo ni variables del servidor.
import { crearChat } from './backend/infraestructura/chat.mjs';
import { crearOllama } from './backend/infraestructura/ollama.mjs';
export let pedidos = 0;
const alPedir = () => { pedidos++; };
const ollama = crearOllama(process.env, { alPedir });
export const embeddingsEnLote = ollama.embeddingsEnLote;
export const embedding = ollama.embedding;
export const responderConUso = crearChat(process.env, { alPedir });
export async function responder(prompt) { return (await responderConUso(prompt)).texto; }
