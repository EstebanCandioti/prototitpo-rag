# Consumo de Entre cartas con GPT-6 Luna · 8 de noviembre de 2026

Se repitieron los 11 escenarios del [informe anterior de Gemini](./costos-2026-11-04.md) con el prompt, el corpus y la selección de contexto actuales. Fueron 11 llamadas reales a `gpt-6-luna`: el caso sin candidatos de la primera pregunta no llamó al modelo, mientras que los dos seguimientos requirieron interpretación. Los candidatos se reprodujeron a partir de los casos de evaluación, por lo que esta medición no consulta PostgreSQL ni Ollama y no valida el ranking vectorial.

Los tokens provienen del campo `usage` devuelto por OpenAI. Los tokens de salida facturable incluyen los de razonamiento: no se suman dos veces. Los importes son cálculos con las tarifas estándar publicadas, no una factura de la cuenta. Se tomó una muestra por escenario; las respuestas y los consumos pueden variar al repetirlos.

Tarifas verificadas: entrada USD 0,10 por millón; lectura de caché USD 0,01; escritura de caché de 30 minutos USD 0,125; salida USD 0,50. [Precio de GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Fórmula: `[(entrada - lectura - escritura) × 0,10 + lectura × 0,01 + escritura × 0,125 + salida × 0,50] / 1.000.000`. La proyección por mil supone mil repeticiones con exactamente el mismo consumo; no es un promedio estadístico de las preguntas posibles.

| Caso | Llamadas | Tokens de entrada | Tokens de salida facturable | USD por consulta | USD por 1.000 comparables |
|---|---:|---:|---:|---:|---:|
| Puntual: definición de full | 1 | 616 | 40 | 0,000081600 | 0,081600 |
| Puntual: puntos del truco | 1 | 1.205 | 88 | 0,000194550 | 0,194550 |
| Listado: combinaciones de Poker | 1 | 1.651 | 256 | 0,000334300 | 0,334300 |
| Comparación: full o color | 1 | 1.648 | 123 | 0,000267425 | 0,267425 |
| Procedimiento: calcular el envido | 1 | 1.179 | 171 | 0,000232800 | 0,232800 |
| General: reglas de Texas | 1 | 2.474 | 789 | 0,000703675 | 0,703675 |
| General: reglas de Truco | 1 | 5.047 | 884 | 0,001072800 | 1,072800 |
| Abstención del modelo: combinaciones de Texas | 1 | 720 | 45 | 0,000094500 | 0,094500 |
| Seguimiento: ¿y cuánto vale? | 2 | 1.556 | 234 | 0,000302525 | 0,302525 |
| Sin candidatos aceptados: primera pregunta | 0 | 0 | 0 | 0,000000000 | 0,000000 |
| Sin candidatos aceptados: seguimiento | 1 | 356 | 67 | 0,000069100 | 0,069100 |

En esta ejecución no hubo lecturas de caché. Algunas llamadas escribieron un prefijo en caché, incluido en los importes de la tabla. Una lectura futura puede resultar más barata si reutiliza un prefijo suficientemente largo y todavía disponible, pero no está garantizada. [Guía de prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

La misma sesión ilustrativa del informe de Gemini, de 50 consultas (20 puntuales de Truco, 10 listados de Poker, 10 generales de Truco y 10 seguimientos breves), equivale aquí a **USD 0,02098725**, aproximadamente 2,1 centavos, si cada caso repitiera este consumo. La proyección de Gemini fue USD 0,04892 con una muestra del 4 de noviembre; la diferencia combina tarifas y comportamiento de modelos distintos, y no predice todas las preguntas futuras.

Ollama sigue produciendo los embeddings localmente: no se cobra una API de embeddings en esta configuración. No se incluyen electricidad, hardware, PostgreSQL, alojamiento, impuestos ni conversión de moneda.

Los contadores por llamada, el detalle de razonamiento y caché, y las respuestas están en [el informe JSON](./costos-openai-2026-11-08.json). Para repetir la medición desde la raíz del proyecto:

```powershell
node --env-file=.env medir-costos-openai.mjs
```

El comando hace llamadas reales a OpenAI y sobrescribe el informe JSON. Puede filtrarse un caso con `--caso=texto`.
