export function configuracionWeb(env = process.env) {
  const puerto = Number(env.PUERTO_WEB ?? 3000);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('PUERTO_WEB debe estar entre 1 y 65535');
  if (env.CODESPACES !== 'true') return { puerto, host: '127.0.0.1', origenPublico: undefined };
  const nombre = env.CODESPACE_NAME;
  const dominio = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev';
  if (!nombre || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(nombre) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(dominio)) {
    throw new Error('La configuración del dominio de Codespaces no es válida.');
  }
  return { puerto, host: '0.0.0.0', origenPublico: `https://${nombre}-${puerto}.${dominio}`, permitirProxyLocalHttps: true };
}
