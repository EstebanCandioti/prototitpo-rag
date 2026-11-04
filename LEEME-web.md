# Entre cartas · React + RAG local

La carpeta de Windows `D:\AAAIES\UDI 3\rag-propio` está montada en este entorno como `/media/sf_rag-propio`.

Para probarlo desde otra PC sin instalar los servicios, consultá [la configuración de Codespaces](./LEEME-codespaces.md). Incluye una base de demostración separada y Ollama en Docker.

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

1. Escribí una primera pregunta con **un solo juego** y presioná **Enter**. **Shift+Enter** agrega una línea. Primero `/api/detectar` identifica el nombre y devuelve su baraja revisada, sin embedding, SQL ni LLM. Después se obtiene el embedding local y se recuperan **8 candidatos** por defecto (ajustable hasta 16 en pruebas). Los candidatos ubican temas; el contexto final puede contener más fragmentos para completar sus secciones. Sin juego activo, si falta el nombre, o si se mencionan varios juegos, aparece un mensaje para reformular antes de invocar Ollama. Las preguntas siguientes pueden omitir el nombre y conservar el juego activo.
2. La misma consulta filtra los candidatos con el umbral, selecciona las secciones pertinentes y genera automáticamente la respuesta con los IDs del contexto final. Si no pasa ningún fragmento, aparece **No lo encuentro en los documentos** sin invocar al LLM para generar la respuesta. En seguimientos puede haberse hecho antes la llamada de interpretación. No hay botón de envío ni un segundo paso de confirmación en la experiencia principal.
3. **Fuentes consultadas** agrupa los fragmentos utilizados como contexto por tema, con juego, sección, URL y texto desplegable de cada fragmento. Los datos salen de SQL, no del texto del modelo. Se retira el pie libre «Fuente:» del LLM; las citas se presentan en este panel verificado. Si el modelo se abstiene, no se muestran fuentes.
4. En **Modo de pruebas** podés recuperar sin generar, ver los cuatro pasos de cada consulta (interpretación, búsqueda, selección y generación), ajustar el corte y generar por separado. También podés revisar la pregunta reformulada, la consulta usada para el embedding y el intercambio anterior usado para interpretarla. El umbral inicial viene de `/api/juegos`, que toma `UMBRAL` del `.env` (actualmente `0.55`). Se acepta similitud **mayor o igual** al corte. Moverlo no hace solicitudes de red ni modifica `.env`. La similitud no garantiza suficiencia: el prompt exige abstenerse si falta la regla.

Enter con una recuperación vigente reutiliza los fragmentos y envía `{ pregunta, ids, contexto?, preguntaResuelta? }` con los IDs del contexto seleccionado, incluidos los fragmentos añadidos para completar secciones. Esto permite probar otro corte o reintentar un error de generación sin repetir el embedding. El contexto y la reformulación quedan fijados con la recuperación: al regenerar no se usa la propia respuesta como intercambio anterior ni se vuelve a reformular. Los envíos simultáneos quedan bloqueados. Los botones por etapas pertenecen únicamente al panel de pruebas.

Cambiar pregunta o cantidad invalida la recuperación. Cambiar el umbral o el modo de contexto actualiza la selección localmente e invalida una respuesta previa para no conservar citas de otra selección. Las entradas quedan bloqueadas durante detección, búsqueda y generación; los errores permiten reintentar. La configuración se puede volver a cargar si el backend estaba apagado al iniciar.

## Selección del contexto: reglas generales y preguntas específicas

Se mantienen **8 candidatos** y el umbral inicial de la API (`UMBRAL=0.55` en el entorno actual). No es necesario aumentar siempre la cantidad: primero se localizan temas con la búsqueda vectorial y después se aprovecha la estructura existente del corpus.

- **Reglas generales / cómo se juega:** reúne las secciones básicas del mismo juego y origen, incluyendo preparación, objetivo, desarrollo y puntuación. Al menos un candidato debe superar el corte para habilitar esa cobertura.
- **Listados:** completa la sección temática padre y sus subsecciones. Si aparece una jugada de Poker, obtiene la familia «Las jugadas del Poker» una sola vez, con sus diez jugadas, sin repetirla por cada coincidencia.
- **Preguntas puntuales y procedimientos:** completa las continuaciones de las secciones específicas priorizadas. Un fragmento final de «Truco» permite traer el comienzo de esa misma sección, donde están los dos puntos del canto. Preguntar qué es un full conserva su definición sin cargar todas las jugadas.
- **Comparaciones:** reúne los conceptos y la introducción de su sección padre. Cuando se pregunta cuál gana o tiene mayor valor, conserva la familia temática completa para mantener el orden indicado por el documento. El prompt permite relacionar las definiciones y las jerarquías explícitas; no aporta reglas externas.

El alcance se determina con reglas de texto sencillas sobre la pregunta original o reformulada; no agrega otra llamada al LLM. La prioridad combina similitud, coincidencias de términos y respaldo de varios candidatos. Se muestra separada de la similitud original. Es una heurística revisable, no una garantía de relevancia para toda forma de preguntar.

El umbral se aplica a los candidatos que habilitan cada sección. Las continuaciones y subsecciones incluidas pueden no tener puntaje propio o quedar por debajo del corte; el panel las identifica como **incluidas para completar contexto**. Se conservan los puntajes originales, sin inventar similitudes para el texto añadido. Si ningún candidato pasa el corte, no se genera respuesta.

La selección se limita a **24.000 caracteres de texto fuente y 64 fragmentos únicos**. Se priorizan hasta 12 secciones para reglas generales, tres para listados/comparaciones y dos para preguntas puntuales/procedimientos. Se omiten secciones enteras si exceden el presupuesto, con el motivo visible en pruebas. Se deduplican los IDs y se unen las continuaciones en orden, retirando el solapamiento exacto al construir el prompt. La API valida nuevamente el juego, los IDs y el límite de texto antes de llamar al modelo.

**Modo de pruebas** distingue candidatos encontrados, candidatos que superan el corte, secciones elegidas y fragmentos del contexto final. Permite comparar **Completar secciones** con **Solo fragmentos candidatos** sin hacer un nuevo embedding ni invocar al LLM al cambiar la opción. También muestra la consulta usada para buscar, los IDs que se enviarán, las razones de selección/exclusión, los tiempos y la salida original del modelo. Cada intercambio del historial conserva su diagnóstico, incluido el corte y el modo que usó, aunque después se cambien los ajustes actuales.

El navegador envía `ampliar: true` a `POST /api/recuperar`. Además de `resultados`, la respuesta contiene `planContexto` (alcance, grupos, fragmentos, anclas y límites) y `tiempos`. La selección final es una función pura compartida entre Node y React. Las llamadas antiguas sin `ampliar` mantienen su recuperación original. El backend lee las secciones existentes de PostgreSQL: **no hay que reindexar**, cambiar el corpus ni regenerar embeddings.

La ampliación nunca cruza a otro juego o toma reglas del conocimiento general del modelo. Por ejemplo, el documento actual de Texas Hold’em no enumera las combinaciones de Poker; esa consulta debe seguir dando abstención hasta incorporar una fuente específica al corpus mediante el proceso habitual.

## Continuidad de la conversación

Después de una consulta podés preguntar, por ejemplo, «¿Y si no lo acepto?» sin repetir el nombre del juego. Las tres rutas POST aceptan un `contexto` opcional: `{ juego, pregunta?, respuesta? }`. El backend valida el juego contra el corpus, limita la pregunta anterior a 1000 caracteres y la respuesta a 4000; si se incluye una de estas dos, deben venir ambas. React recorta respuestas anteriores más largas y agrega una nota de recorte. No se conserva memoria en PostgreSQL ni se agregan servicios o dependencias.

- **Detección:** un juego mencionado explícitamente tiene prioridad. Mencionar otro juego descarta el intercambio anterior y cambia la baraja según los metadatos existentes. Mencionar varios sigue siendo un error. Sin nombre, se usa el juego activo validado.
- **Interpretación:** la primera consulta, una consulta con solo juego activo (sin intercambio previo) y la primera consulta de otro juego omiten esta etapa. Los seguimientos llaman a `POST /api/reformular` con `{ pregunta, contexto }`. El LLM recibe el último intercambio y debe devolver una pregunta independiente en JSON, sin responder reglas ni agregar condiciones. El backend valida la longitud y que conserve el juego; una salida inválida produce un error claro, sin buscar ni generar una respuesta.
- **Recuperación:** React envía la `preguntaResuelta` a `/api/recuperar`; ese texto explícito es el único que se convierte en embedding, sin concatenar la pregunta anterior ni incorporar la respuesta anterior. La búsqueda SQL sigue filtrando por el juego detectado a partir de la consulta original y su contexto validado. Las llamadas antiguas sin `preguntaResuelta` conservan la búsqueda contextual anterior. Cada pregunta nueva hace una recuperación; mover el umbral sigue filtrando sin repetir embedding ni llamadas al LLM.
- **Generación:** `/api/responder` recibe `{ pregunta, ids, contexto?, preguntaResuelta? }`. Con reformulación, el modelo recibe la pregunta original, su interpretación explícita y solo los fragmentos actuales seleccionados; no se vuelve a enviar la respuesta anterior. Sin reformulación se mantiene el armado compatible con la consola y las rutas anteriores. Solo los fragmentos fundamentan las reglas; el backend verifica IDs y juego en SQL. Son una llamada de respuesta en la primera consulta y dos llamadas en seguimientos (interpretación y respuesta), si hay fragmentos aceptados. Si no los hay, el seguimiento queda con una sola llamada de interpretación y se omite la generación.
- **Reintentos:** la reformulación se guarda en React para la pregunta vigente. Cambiar el umbral, cambiar la cantidad de fragmentos, regenerar o reintentar un fallo de Ollama/PostgreSQL después de interpretar no repiten esa llamada. Cambiar la pregunta o reiniciar la conversación descarta la reformulación. Si falla la propia interpretación, reintentar vuelve a pedirla.
- **Interfaz:** la última respuesta aparece en el globo. El historial plegable permite revisar hasta 10 intercambios con sus propias fuentes; al modelo se envía únicamente el último intercambio anterior. Los errores no se registran como respuestas. Una abstención sí se registra, con fuentes vacías. «Recuperar sin generar» no crea un intercambio, pero en seguimientos sí hace la llamada de interpretación antes de recuperar.
- **Reinicio:** «Nueva conversación» limpia juego, historial, pregunta, respuesta y recuperación. Mencionar otro juego también inicia un historial nuevo. La memoria vive solo en la pestaña y desaparece al recargar; no se envía el historial entero ni se guardan conversaciones en disco.

Para probar el seguimiento, preguntá «En el Truco, ¿cuánto vale el retruco?» y después «¿Y si no lo acepto?». Revisá en Modo de pruebas la pregunta reformulada y la consulta de búsqueda. Otro caso de prueba es «cuando puedo cantar truco en el truco?» seguido de «y cuanto vale?»: la reformulación debe preguntar por el valor del canto de truco y no por el valor de las cartas. La calidad del ranking se comprueba con Ollama/PostgreSQL activos; reformular no garantiza que un fragmento concreto entre en los primeros resultados.

## Archivos

- `frontend/src/App.tsx`: consulta, selección local, respuesta e historial con diagnóstico.
- `frontend/src/DepuracionConsulta.tsx`: los cuatro pasos de diagnóstico de cada consulta.
- `seleccionar-contexto.mjs`, `seleccionar-contexto.d.mts`: alcance de la pregunta, grupos de secciones y selección pura compartida con React.
- `contexto-respuesta.mjs`: continuaciones en orden, eliminación del solapamiento y limpieza del pie de citas sin recortar la respuesta.
- `contexto.test.mjs`, `evaluar-contexto.mjs`: regresiones del corpus y evaluación repetible offline o con el proveedor real.
- `frontend/src/JuegosSidebar.tsx`: lista de juegos en la barra lateral plegable, adaptable a escritorio y móvil.
- `frontend/src/Gaucho.tsx`: adaptador de estados, recursos y reemplazo SVG estático.
- `frontend/src/api.ts`, `types.ts`, `styles.css`: contrato HTTP local, tipos y diseño responsive.
- `frontend/vite.config.ts`, `tsconfig.json`, `package*.json`, `index.html`: configuración React + TypeScript + Vite y dependencias.
- `servidor-web.mjs`: arranque local, lectura del corpus, configuración e integración con los módulos originales.
- `web-handler.mjs`: rutas extraídas para probarlas con dependencias controladas, archivos de React, validación y fuentes estructuradas.
- `reformular-consulta.mjs`: prompt de interpretación del seguimiento, validación de JSON, longitud y juego. Reutiliza el proveedor del backend; React no llama al proveedor.
- `conversacion.mjs`: validación del contexto, detección con juego activo, consulta de búsqueda y armado compartido del prompt. `preguntar.mjs` usa este armado sin historial y conserva su funcionamiento de consola.
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

Tocar o enfocar el campo inicia la tira de cuatro cuadros, incluso antes de escribir o identificar un juego. La entrada dura **1000 ms** (250 ms por cuadro) y mantiene la pose atenta mientras se escribe; las pulsaciones no reinician la animación. Al salir se reproduce la inversa también durante **1000 ms**, con 250 ms por cuadro. El pensamiento se reproduce durante interpretación/búsqueda/generación (800, 220, 500, 240, 800 ms, en bucle solo mientras espera). Al recibir la respuesta se reproduce una sola vez el ciclo de mirada, dedos al ala y cierre del sombrero: **2,78 segundos** y nueve cuadros, con mazo rojo o azul. El último cuadro es la pose inicial de reposo y queda sostenido, mientras el texto y las fuentes siguen visibles. La animación se configura en `respuestaSombrero`, dentro de `frontend/src/secuencias-gaucho.ts`. El texto aparece al llegar la respuesta, sin esperar al reproductor.

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
npm run evaluar
```

`npm test` verifica detección, contrato HTTP, agrupación con el corpus real y React: corte sin nuevo embedding, modos de contexto sin llamadas adicionales, IDs ampliados enviados al backend, fuentes del mismo juego, límites, errores de PostgreSQL/Ollama/proveedor, continuidad con una o dos llamadas, caché de reformulación, historial y animaciones. Utiliza dependencias controladas: no llama al proveedor ni cambia la base.

`npm run evaluar` reproduce siete escenarios con textos del corpus: listado de Poker usando los ocho candidatos reportados, definición de full, comparación full/color, valor del truco con solo el fragmento final inicialmente recuperado, reglas generales de Texas y Truco, y abstención al pedir combinaciones ausentes del documento de Texas. No consulta servicios y no valida el ranking vectorial. Si se cambia o reindexa el corpus, hay que revisar los IDs de las reproducciones.

Para agregar una generación **real** con el proveedor configurado en `.env` (consume llamadas), usá:

```powershell
npm run evaluar:llm
npm run evaluar:llm -- --caso=comparación
```

Ese comando envía las preguntas de evaluación y las reglas del corpus al proveedor configurado. No modifica PostgreSQL ni usa conversaciones reales. El informe JSON muestra candidatos reproducidos, IDs seleccionados, tamaño del contexto, respuesta y comprobaciones básicas por caso. No reemplaza la evaluación manual de calidad.

Verificación final: build TypeScript/Vite correcto, detección original correcta, 32 pruebas de backend/contexto y 48 de React/animaciones aprobadas. Los siete casos de evaluación pasaron sus comprobaciones básicas con el proveedor real, incluyendo el listado de diez jugadas de Poker, la comparación full/color y la abstención de Texas. La cobertura general de los 27 juegos cabe dentro de los límites actuales. La comprobación de disponibilidad local devolvió `ECONNREFUSED` para PostgreSQL y Ollama desde este entorno. La validación del ranking real requiere ambos servicios accesibles en la máquina que tiene los datos. Aquí los estados de error de la interfaz se verifican con dependencias controladas; no hubo navegador disponible para inspección visual.

Para probar manualmente después de reiniciar el servidor, preguntá «¿Qué combinaciones de cartas existen en Poker?», luego «¿Qué es un full?» y después «¿Qué gana, full o color?». En Modo de pruebas compará los candidatos con el contexto final y verificá que al mover el corte no cambie el tiempo de búsqueda ni salga otra solicitud de recuperación. Con un corte que deje cero coincidencias, la generación debe quedar omitida.
