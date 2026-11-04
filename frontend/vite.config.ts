import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Solo el puerto se usa en la configuración de Node; no se expone .env al bundle.
  const { PUERTO_WEB = '3000' } = loadEnv(mode, '..', 'PUERTO_WEB')
  return {
    server: {
      port: 5173, strictPort: true,
      // Conserva Host y Origin del navegador: la validación same-origin sigue activa.
      proxy: { '/api': { target: `http://127.0.0.1:${PUERTO_WEB}`, changeOrigin: false } },
    },
  }
})
