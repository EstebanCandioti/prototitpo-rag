import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuracionWeb } from './configuracion-web.mjs';
import { validarEntornoDemo, firmaIndice } from './scripts/codespaces.mjs';

test('la configuración local sigue en loopback; Codespaces usa solo su dominio y puerto', () => {
  assert.deepEqual(configuracionWeb({}), { puerto: 3000, host: '127.0.0.1', origenPublico: undefined });
  assert.deepEqual(configuracionWeb({ CODESPACES: 'true', CODESPACE_NAME: 'demo-entre-cartas' }),
    { puerto: 3000, host: '0.0.0.0', origenPublico: 'https://demo-entre-cartas-3000.app.github.dev' });
  assert.equal(configuracionWeb({ CODESPACES: 'true', CODESPACE_NAME: 'demo', PUERTO_WEB: '3456', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' }).origenPublico, 'https://demo-3456.app.github.dev');
  for (const env of [{ PUERTO_WEB: 'no' }, { CODESPACES: 'true' }, { CODESPACES: 'true', CODESPACE_NAME: 'demo/otro' },
    { CODESPACES: 'true', CODESPACE_NAME: 'demo', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev/otra' }]) assert.throws(() => configuracionWeb(env));
});

test('el preparador de demo rechaza la base local, otros modelos y ejecuciones fuera de Codespaces', () => {
  const env = { CODESPACES: 'true', DATABASE_URL: 'postgresql://rag:demo@postgres:5432/rag_demo', URL_EMBEDDINGS: 'http://ollama:11434/v1', MODELO_EMBEDDINGS: 'bge-m3', DIMENSIONES: '1024' };
  assert.doesNotThrow(() => validarEntornoDemo(env));
  for (const cambio of [{ CODESPACES: 'false' }, { DATABASE_URL: 'postgresql://rag:demo@localhost:5432/rag' }, { DATABASE_URL: 'postgresql://rag:demo@postgres:5432/otra' }, { MODELO_EMBEDDINGS: 'otro' }, { DIMENSIONES: '768' }]) {
    assert.throws(() => validarEntornoDemo({ ...env, ...cambio }), /base local no se modifica/);
  }
});

test('la firma del índice permite reutilizarlo y cambia al cambiar modelo o archivos', async () => {
  const a = new URL('./marca.mjs', import.meta.url), b = new URL('./trocear.mjs', import.meta.url);
  assert.equal(await firmaIndice('digest-modelo', [a]), await firmaIndice('digest-modelo', [a]));
  assert.notEqual(await firmaIndice('digest-modelo', [a]), await firmaIndice('otro-digest', [a]));
  assert.notEqual(await firmaIndice('digest-modelo', [a]), await firmaIndice('digest-modelo', [b]));
});
