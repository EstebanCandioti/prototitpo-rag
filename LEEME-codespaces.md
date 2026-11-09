# Probar Entre cartas en GitHub Codespaces

Esta configuración ejecuta el backend y React junto a PostgreSQL/pgvector y Ollama con `bge-m3` en la máquina de GitHub. OpenAI (`gpt-6-luna`) genera las respuestas. La base de trabajo de Windows y su `.env` no se utilizan en la prueba.

## Primera creación

1. Subí esta versión al repositorio. El repositorio elegido para la prueba es [EstebanCandioti/prototitpo-rag](https://github.com/EstebanCandioti/prototitpo-rag).
2. En [Settings → Codespaces → Secrets](https://github.com/settings/codespaces), agregá `API_KEY` con tu clave de OpenAI y dale acceso únicamente a ese repositorio. Si ya existía una clave de Gemini con ese nombre, reemplazala. Para aplicar la nueva configuración de `.devcontainer/compose.yaml` en un Codespace existente, ejecutá «Codespaces: Rebuild Container». Nunca pegues la clave en un archivo versionado ni en el chat. GitHub también puede solicitar este secreto al crear el entorno.
3. Abrí [Crear Codespace](https://codespaces.new/EstebanCandioti/prototitpo-rag), elegí la rama `main` y una máquina de **2 núcleos / 8 GB**. Revisá tu cuota gratuita disponible antes de crearlo. Se configura un puerto privado para la prueba.
4. Esperá la preparación inicial. El script instala dependencias, compila React, descarga `bge-m3` en GitHub y genera el índice de la base nueva `rag_demo`. La descarga y el trabajo de CPU ocurren en el Codespace, no en la PC de la facultad. Este proceso no llama a OpenAI.
5. En la terminal del Codespace ejecutá:

```bash
npm run codespaces:verificar
npm run codespaces:iniciar
```

6. En **Ports**, abrí **Entre cartas / 3000** con **Open in Browser**. La dirección externa es HTTPS aunque el proceso interno use HTTP. Conservá la visibilidad **Private**. No publiques los puertos 5432 ni 11434.

Probá «¿Cuánto vale cantar truco en El Truco?», «¿Qué combinaciones existen en Poker?» y luego una pregunta de seguimiento. Revisá Modo de pruebas para contrastar los puntajes y el contexto seleccionado.

## Qué hace cada comando

- `npm run codespaces:preparar`: instalación y build, descarga del modelo si falta e indexación de la base de demo si falta o cambió su firma. Se ejecuta automáticamente al crear el entorno.
- `npm run codespaces:verificar`: usa Ollama y PostgreSQL reales para buscar Truco y Poker; muestra dimensiones, puntajes, IDs seleccionados y tiempo. No consume llamadas a OpenAI.
- `npm run codespaces:iniciar`: comprueba el índice, carga el modelo en memoria y arranca el servidor de React y la API. Reutiliza el modelo descargado y los vectores cuando no cambió el corpus, el troceado ni el modelo. Al reanudar el Codespace, esperá a que aparezca la URL: cargar el modelo en frío puede demorar alrededor de un minuto en la máquina de 2 núcleos, sin consumir llamadas a OpenAI.

La firma incluye el corpus, el código de indexación/troceado, el modelo y su digest de Ollama. El índice se reemplaza usando el programa original de consola, que prepara todos los embeddings antes de comenzar la transacción de reemplazo.

## Persistencia, acceso y cuota

El modelo se guarda bajo `.codespaces-data/ollama/`, dentro del workspace persistente y excluido de Git. PostgreSQL usa el volumen Docker `postgres-data` para conservar sus permisos, porque Codespaces ajusta los permisos del workspace. Ambos se conservan al detener/reanudar. Una reconstrucción completa puede eliminar los volúmenes Docker; en ese caso el comando de preparación vuelve a generar el índice usando el modelo guardado. **Eliminar el Codespace elimina su almacenamiento**. Una nueva instancia puede reconstruirse desde el corpus.

La preparación rechaza ejecutarse contra `localhost`, otra base o un modelo diferente: solo trabaja con los servicios `postgres/rag_demo` y `ollama` del entorno de prueba. Las credenciales de esa base son exclusivamente de desarrollo y los servicios no publican puertos.

El backend acepta el origen HTTPS exacto calculado a partir de `CODESPACE_NAME`, el puerto y `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. En Codespaces también admite el túnel de VS Code que entrega `Origin: https://localhost:PUERTO` y `Host: localhost:PUERTO`: deben coincidir exactamente, incluido el puerto. El puerto local puede cambiar sin modificar el puerto 3000 del backend. Esta excepción HTTPS está deshabilitada fuera de Codespaces; no admite dominios externos ni confía en `X-Forwarded-Host` enviado por el cliente. El uso local conserva loopback y la validación HTTP original.

Codespaces consume cuota de cómputo mientras está activo y almacenamiento mientras existe. Detenelo desde el menú de Codespaces cuando termines. La visibilidad privada exige iniciar sesión en GitHub para acceder a la aplicación. Este entorno sirve para la demostración; no configura un servicio de producción permanente. [Cuotas y facturación](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).

Al reanudar, abrí la terminal y ejecutá nuevamente `npm run codespaces:iniciar`. No necesitás repetir la instalación ni la indexación. El entorno de prueba tiene un cierre automático tras 30 minutos de inactividad.

## Si aparece un error

- **Falta `API_KEY`:** configurá el secreto con acceso al repositorio y detené/reiniciá el Codespace para que se inyecte. La recuperación puede probarse sin la clave, pero la generación y la interpretación de seguimientos la requieren.
- **Preparación interrumpida:** ejecutá nuevamente `npm run codespaces:preparar`. El índice existente se reutiliza si su firma y cantidad de fragmentos coinciden.
- **403 Origen no permitido:** abrí el puerto 3000 del Codespace actual o usá el puerto local reenviado por VS Code. Para un túnel HTTPS de localhost, `Origin` y `Host` deben coincidir; no se autoriza un dominio de otro Codespace. Después de actualizar el backend, reiniciá `npm run codespaces:iniciar`; este cambio no requiere reindexar.
- **401 al abrir el enlace `app.github.dev`:** pertenece al acceso privado de GitHub. Se puede acceder desde VS Code conectado al Codespace mediante el puerto local reenviado (por ejemplo, `http://127.0.0.1:3001/`). Ese enlace funciona en la PC conectada y mientras VS Code mantenga el túnel. Usá el puerto que indique Ports y mantené su visibilidad privada.
- **Sin cuota o permisos para Codespaces:** GitHub debe habilitar el entorno en tu cuenta. La CLI requiere el permiso `codespace`; crear y abrir el entorno desde el navegador también es posible.

## Prueba real del 4 de noviembre de 2026 (configuración anterior con Gemini)

Se comprobó el funcionamiento en un Codespace de 2 núcleos y 8 GB: build de React, 27 juegos, PostgreSQL/pgvector con 305 fragmentos, embeddings de Ollama y respuestas reales de Gemini. Se verificaron el origen HTTPS permitido, el rechazo de un origen ajeno, el cambio local de umbral, la abstención sin invocar al LLM cuando no hay selección y el envío/citado de los IDs seleccionados del mismo juego.

La secuencia «¿Cuándo puedo cantar truco en El Truco?» → «¿Y cuánto vale si lo aceptan o lo rechazan?» mantuvo el contexto y respondió los valores de truco, retruco y vale cuatro. Poker recuperó 8 candidatos, seleccionó los 11 fragmentos de la familia «Las jugadas del Poker» y respondió las 10 combinaciones documentadas.

En esa prueba, la carga en frío de `bge-m3` tardó unos 65 segundos; con el modelo cargado, las búsquedas completas tardaron entre 0,16 y 0,25 segundos. El inicio ahora adelanta esa carga antes de anunciar la URL. Gemini tardó aproximadamente entre 2,5 y 30 segundos y devolvió errores temporales `503` por alta demanda; las consultas pudieron completarse al reintentar. Son mediciones de esta prueba, no tiempos garantizados. La aplicación conserva el manejo de errores existente; no cambia automáticamente de modelo ni de plan de facturación.
