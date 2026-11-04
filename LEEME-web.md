# Entre cartas · React + RAG local

La carpeta de Windows `D:\AAAIES\UDI 3\rag-propio` está montada en este entorno como `/media/sf_rag-propio`.

Requiere Node 22.12 o posterior, PostgreSQL con pgvector y los datos ya indexados, y Ollama con el modelo de embeddings configurado. Se conserva `.env` en la raíz: no lo copies a `frontend/` ni uses variables `VITE_` para claves. No hay llamadas del navegador al proveedor de chat ni a Ollama.

## Instalación

Desde la raíz, en PowerShell o una terminal:

```powershell
npm ci
npm --prefix frontend ci --no-bin-links
```

En carpetas compartidas con Windows se usa `--no-bin-links` para evitar enlaces simbólicos. Los scripts ejecutan los archivos de Node directamente y también funcionan en Windows.

## Desarrollo

Iniciá PostgreSQL y Ollama como para los programas de consola. En una terminal:

```powershell
npm run web
```

En otra, desde la misma raíz:

```powershell
npm run dev
```

Abrí **http://127.0.0.1:5173**. Vite deriva `/api` al backend en `127.0.0.1:3000` (o `PUERTO_WEB` leído del `.env` de la raíz). `changeOrigin: false` conserva Host y Origin; el backend exige coincidencia exacta del origen HTTP con Host. No se agrega CORS abierto ni una excepción para cualquier origen. Ambos servidores escuchan en loopback. El puerto de Vite es fijo para no cambiar de URL silenciosamente.

## Uso normal / build local

Ejecutá estos comandos desde `D:\AAAIES\UDI 3\rag-propio` (la raíz). Si estás dentro de `frontend/`, `npm start` también deriva al servidor de la raíz, que lee el `.env` correcto.

```powershell
npm run build
npm start
```

Abrí **http://127.0.0.1:3000** (o `PUERTO_WEB`). El backend sirve `frontend/dist/` y las rutas `/api` en el mismo origen. Reconstruí el build después de cambiar React. `npm run web` y `npm start` ejecutan el mismo servidor. No se publica en servicios externos.

## Consulta y evaluación

La lista de juegos se consulta en la **barra lateral izquierda**, plegable con el botón **Juegos**. En pantallas amplias empieza abierta; en pantallas menores de 960 px se abre sobre el contenido y se puede cerrar con el botón, tocando fuera o con Escape. El juego de la consulta actual queda resaltado.

1. Escribí una pregunta con **un solo juego** y presioná **Enter**. **Shift+Enter** agrega una línea. Primero `/api/detectar` identifica el nombre y devuelve su baraja revisada, sin embedding, SQL ni LLM. Después se obtiene el embedding local y se recuperan hasta **2 fragmentos** por defecto. Si el nombre falta o hay varios, aparece un mensaje para reformular, antes de invocar Ollama.
2. La misma consulta filtra con el umbral y genera automáticamente la respuesta con los IDs aceptados. Si no pasa ningún fragmento, aparece **No lo encuentro en los documentos** sin invocar el LLM. No hay botón de envío ni un segundo paso de confirmación en la experiencia principal.
3. **Fuentes consultadas** muestra los fragmentos utilizados como contexto, con juego, sección y URL. Los datos salen de SQL, no del texto del modelo. Se retira el pie libre «Fuente:» del LLM; las citas se presentan en este panel verificado. Si el modelo se abstiene, no se muestran fuentes.
4. En **Modo de pruebas** podés recuperar sin generar, ver texto, puntajes y selección, ajustar el corte y generar por separado. El umbral inicial viene de `/api/juegos`, que toma `UMBRAL` del `.env` (actualmente `0.55`). Se acepta similitud **mayor o igual** al corte. Moverlo no hace solicitudes de red ni modifica `.env`. La similitud no garantiza suficiencia: se mantiene el prompt original que exige abstenerse si falta la regla.

Enter con una recuperación vigente reutiliza los fragmentos y envía solamente `{ pregunta, ids }` con la selección actual. Esto permite probar otro corte o reintentar un error de generación sin repetir el embedding. Los envíos simultáneos quedan bloqueados. Los botones por etapas pertenecen únicamente al panel de pruebas.

Cambiar pregunta o cantidad invalida la recuperación. Cambiar el umbral invalida una respuesta previa para no conservar citas de otra selección. Las entradas quedan bloqueadas durante detección, búsqueda y generación; los errores permiten reintentar. La configuración se puede volver a cargar si el backend estaba apagado al iniciar.

## Archivos

- `frontend/src/App.tsx`: consulta, selección local, respuesta y paneles desplegables.
- `frontend/src/JuegosSidebar.tsx`: lista de juegos en la barra lateral plegable, adaptable a escritorio y móvil.
- `frontend/src/Gaucho.tsx`: adaptador de estados, recursos y reemplazo SVG estático.
- `frontend/src/api.ts`, `types.ts`, `styles.css`: contrato HTTP local, tipos y diseño responsive.
- `frontend/vite.config.ts`, `tsconfig.json`, `package*.json`, `index.html`: configuración React + TypeScript + Vite y dependencias.
- `servidor-web.mjs`: arranque local, lectura del corpus, configuración e integración con los módulos originales.
- `web-handler.mjs`: rutas extraídas para probarlas con dependencias controladas, archivos de React, validación y fuentes estructuradas.
- `metadatos-juegos.mjs`: tabla revisada de barajas para las variantes del corpus. Continental, Remigio y barajas catalanas usan `general` hasta confirmar su tratamiento. No se clasifica con el LLM ni con resultados vectoriales.
- `web-handler.test.mjs`, `frontend/src/App.test.tsx`: pruebas de contrato HTTP e interacción React.

Las pruebas de sprites verifican poses, tiempos, foco del campo, mazos, cancelación, movimiento reducido y fallos de carga.

El corpus, esquema, indexación y programas de consola se conservan. Los módulos `api.mjs`, `buscar.mjs`, `leer-corpus.mjs` y `detectar-juego.mjs` se reutilizan sin cambios. El HTML previo queda en `web/` como referencia y ya no se sirve.

## Gaucho: animaciones conectadas

Se reutilizan los sprites y máscaras originales, y los dos atlas del nuevo cierre del sombrero, conservando sus carpetas de origen. Sus copias para Vite están en `frontend/public/animaciones/`. Los atlas se comprobaron idénticos a los que usa `gaucho-demo-conversacion/prueba.html`.

- `GauchoSprites.tsx`: reproductor con cancelación al cambiar de estado o desmontar. El RAG y el texto nunca esperan a que una animación termine.
- `recursos-gaucho.ts`: carga local y composición de las variantes azules con las mismas máscaras y textura del demo; no se redibuja el personaje ni se recolorea el resto de la escena.
- `secuencias-gaucho.ts`: copia explícita de los datos de `animacion.json` de cada carpeta. Permite revisar los parámetros sin tocar la lógica del RAG.
- `Gaucho.tsx`: contenedor y reemplazo SVG si no se pueden cargar los recursos. Conserva el catálogo opcional de imagen/video por estado.

El estado inicial usa el cuadro 0 de atención: cinco cartas en abanico y la cara tapada por el sombrero. `reposo.png` muestra esa misma pose mientras cargan los atlas.

Tocar o enfocar el campo inicia la tira de cuatro cuadros, incluso antes de escribir o identificar un juego. La entrada dura **1000 ms** (250 ms por cuadro) y mantiene la pose atenta mientras se escribe; las pulsaciones no reinician la animación. Al salir se reproduce la inversa también durante **1000 ms**, con 250 ms por cuadro. El pensamiento se reproduce durante búsqueda/generación (800, 220, 500, 240, 800 ms, en bucle solo mientras espera). Al recibir la respuesta se reproduce una sola vez el ciclo de mirada, dedos al ala y cierre del sombrero: **2,78 segundos** y nueve cuadros, con mazo rojo o azul. El último cuadro es la pose inicial de reposo y queda sostenido, mientras el texto y las fuentes siguen visibles. La animación se configura en `respuestaSombrero`, dentro de `frontend/src/secuencias-gaucho.ts`. El texto aparece al llegar la respuesta, sin esperar al reproductor.

Antes de buscar fragmentos, la detección temprana entrega la baraja al gaucho. Durante esa identificación conserva la pose y no comienza a pensar. Si corresponde un cambio de mazo, lo reproduce antes del gesto de pensamiento; la recuperación puede avanzar en paralelo para no sumar una espera artificial.

El cambio de mazo se ejecuta exclusivamente cuando los metadatos del juego consultado indican una familia distinta de la que se está mostrando: española → rojo; inglesa/francesa → azul. La tira se reproduce una sola vez, seis cuadros de 180 ms. Si cambia el estado durante la tira, continúa desde el cuadro actual. Atención, pensamiento y respuesta conservan el color elegido. Una categoría general no dispara cambios: conserva el mazo visible y permite todos los gestos sin adjudicarle una familia al juego. El rojo inicial es la pose de inicio solicitada, no una clasificación automática.

Los estados de ausencia y error mantienen la pose atenta. Se respeta `prefers-reduced-motion`, incluso si cambia durante la sesión.

La respuesta del demo no se copia: el globo siempre conserva el flujo del RAG real. Los bucles de preview de atención, respuesta y cambio de mazo no se usan en la aplicación.

Se usan los tiempos de los archivos, excepto la entrada y salida de atención, ajustadas a un segundo cada una. Falta definir si querés recursos propios para ausencia, error y baraja general, y confirmar el tratamiento de Continental, Remigio y barajas catalanas. Para nuevas hojas se necesitan archivo, tamaño de celda, secuencia, tiempos, bucles y criterio de interrupción.

Si el backend ya estaba abierto al incorporar esta ruta, reinicialo con `Ctrl+C` y `npm start`; luego recargá la página.

## Respuesta y cierre del sombrero: integrada en React

`gaucho-prueba-cierre-sombrero/prueba.html` permite revisar una propuesta nueva con ambos mazos: reutiliza la mirada entrecerrada de respuesta, agrega el gesto de dos dedos al ala y termina en el frame original de reposo. El texto permanece visible. Incluye atlas, PNG individuales, GIF/WebP, contactos, prompts, manifiesto y QA. React ya usa estos recursos desde `frontend/public/animaciones/respuesta-sombrero-rojo.png` y `respuesta-sombrero-azul.png`, con los mismos 2,78 s del visor. El visor independiente permite revisar y ajustar la velocidad localmente; ese control no modifica los tiempos de React.

## Verificación

```powershell
npm run build
npm test
```

Las pruebas usan respuestas y errores controlados, sin gastar llamadas al proveedor ni modificar la base. Comprueban detección, umbral de la API, 2 fragmentos iniciales, cambio de corte sin nueva recuperación, IDs enviados, fuentes, abstención, errores de servicios, reintento y Origin. La disponibilidad real de PostgreSQL/Ollama y la calidad de las respuestas requieren los servicios locales activos y los datos indexados.

Verificación realizada en este entorno: build TypeScript/Vite correcto; detección original correcta; 7 pruebas HTTP y 33 pruebas React aprobadas, incluida detección temprana, cambio de mazo antes del pensamiento y cierre del sombrero con respuesta y fuentes visibles. Se comprobó además el proxy real de Vite (origen local aceptado, origen ajeno rechazado), el HTML/JS/CSS de producción servido por el backend y que `.env` no sea accesible por HTTP. No hubo navegador disponible para revisión visual; no se invocó el proveedor real del LLM ni se alteraron los datos de PostgreSQL. Los errores de PostgreSQL/Ollama se verificaron mediante dependencias controladas.
