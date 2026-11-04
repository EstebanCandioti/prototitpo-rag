# Probar Entre cartas en GitHub Codespaces

Esta configuración ejecuta el backend y React junto a PostgreSQL/pgvector y Ollama con `bge-m3` en la máquina de GitHub. Gemini sigue generando las respuestas. La base de trabajo de Windows y su `.env` no se utilizan en la prueba.

## Primera creación

1. Subí esta versión al repositorio. El repositorio elegido para la prueba es [EstebanCandioti/prototitpo-rag](https://github.com/EstebanCandioti/prototitpo-rag).
2. En [Settings → Codespaces → Secrets](https://github.com/settings/codespaces), agregá `API_KEY` con tu clave de Gemini y dale acceso únicamente a ese repositorio. Nunca pegues la clave en un archivo versionado ni en el chat. GitHub también puede solicitar este secreto al crear el entorno.
3. Abrí [Crear Codespace](https://codespaces.new/EstebanCandioti/prototitpo-rag), elegí la rama `main` y una máquina de **2 núcleos / 8 GB**. Revisá tu cuota gratuita disponible antes de crearlo. Se configura un puerto privado para la prueba.
4. Esperá la preparación inicial. El script instala dependencias, compila React, descarga `bge-m3` en GitHub y genera el índice de la base nueva `rag_demo`. La descarga y el trabajo de CPU ocurren en el Codespace, no en la PC de la facultad. Este proceso no llama a Gemini.
5. En la terminal del Codespace ejecutá:

```bash
npm run codespaces:verificar
npm run codespaces:iniciar
```

6. En **Ports**, abrí **Entre cartas / 3000** con **Open in Browser**. La dirección externa es HTTPS aunque el proceso interno use HTTP. Conservá la visibilidad **Private**. No publiques los puertos 5432 ni 11434.

Probá «¿Cuánto vale cantar truco en El Truco?», «¿Qué combinaciones existen en Poker?» y luego una pregunta de seguimiento. Revisá Modo de pruebas para contrastar los puntajes y el contexto seleccionado.

## Qué hace cada comando

- `npm run codespaces:preparar`: instalación y build, descarga del modelo si falta e indexación de la base de demo si falta o cambió su firma. Se ejecuta automáticamente al crear el entorno.
- `npm run codespaces:verificar`: usa Ollama y PostgreSQL reales para buscar Truco y Poker; muestra dimensiones, puntajes, IDs seleccionados y tiempo. No consume llamadas a Gemini.
- `npm run codespaces:iniciar`: comprueba el índice y arranca el servidor de React y la API. Reutiliza el modelo descargado y los vectores cuando no cambió el corpus, el troceado ni el modelo.

La firma incluye el corpus, el código de indexación/troceado, el modelo y su digest de Ollama. El índice se reemplaza usando el programa original de consola, que prepara todos los embeddings antes de comenzar la transacción de reemplazo.

## Persistencia, acceso y cuota

Los datos de PostgreSQL y el modelo se guardan bajo `.codespaces-data/`, dentro del workspace persistente. Ese directorio está excluido de Git. Se conservan al detener/reanudar o reconstruir el entorno, pero **eliminar el Codespace elimina su almacenamiento**. Una nueva instancia puede reconstruirse desde el corpus.

La preparación rechaza ejecutarse contra `localhost`, otra base o un modelo diferente: solo trabaja con los servicios `postgres/rag_demo` y `ollama` del entorno de prueba. Las credenciales de esa base son exclusivamente de desarrollo y los servicios no publican puertos.

El backend acepta el origen HTTPS exacto calculado a partir de `CODESPACE_NAME`, el puerto y `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. No admite cualquier dominio `github.dev`, ni confía en `X-Forwarded-Host` enviado por el cliente. El uso local conserva loopback y la validación HTTP original.

Codespaces consume cuota de cómputo mientras está activo y almacenamiento mientras existe. Detenelo desde el menú de Codespaces cuando termines. La visibilidad privada exige iniciar sesión en GitHub para acceder a la aplicación. Este entorno sirve para la demostración; no configura un servicio de producción permanente. [Cuotas y facturación](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).

## Si aparece un error

- **Falta `API_KEY`:** configurá el secreto con acceso al repositorio y detené/reiniciá el Codespace para que se inyecte. La recuperación puede probarse sin la clave, pero la generación y la interpretación de seguimientos la requieren.
- **Preparación interrumpida:** ejecutá nuevamente `npm run codespaces:preparar`. El índice existente se reutiliza si su firma y cantidad de fragmentos coinciden.
- **403 Origen no permitido:** abrí el puerto 3000 del Codespace actual. Un dominio de otro Codespace o del puerto 5173 no está autorizado para esta demo.
- **Sin cuota o permisos para Codespaces:** GitHub debe habilitar el entorno en tu cuenta. La CLI requiere el permiso `codespace`; crear y abrir el entorno desde el navegador también es posible.

La configuración se prepara y prueba automáticamente hasta donde permite el entorno disponible. El rendimiento de CPU, la descarga real y el acceso por URL deben comprobarse en el Codespace creado.
