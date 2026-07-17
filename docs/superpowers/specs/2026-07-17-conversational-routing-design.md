# Ruteo por intención + tono humano + contenido real (Juancito Ads) — Design

**Fecha:** 2026-07-17
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto

El bot hoy tiene dos caminos separados y desconectados:

- `/cotizar`: un wizard rígido (`@grammyjs/conversations`) que pregunta 4 datos
  en orden fijo, con estado persistido en Postgres (tabla `bot_conversations`,
  agregada en la migración a Netlify + Neon).
- Chat libre: el LLM puede en teoría llamar a `calculateQuote` como
  herramienta, pero sin ninguna guía sobre cuándo hacerlo ni con qué tono.

El usuario quiere preparar el bot para operar por WhatsApp (no se configura
en este ciclo, pero el diseño no debe asumir comandos tipo `/cotizar`, que no
existen en WhatsApp), con una experiencia de atención al cliente cálida y
humana, que reconozca la intención del cliente en texto libre y lo dirija a:
saber más sobre los planes, personalizar una recomendación, o cotizar.

En paralelo, se incorpora contenido real de un producto de seguro escolar de
accidentes de SURA, rebrandeado como **"Juancito Ads"** para este demo (no es
un proyecto oficial de SURA — ver sección de branding/contacto abajo).

Se descartó reemplazar el motor de cotización paramétrico existente por
precios fijos de Plan A/B/C: se mantiene la fórmula actual y su resultado se
etiqueta con el plan correspondiente según el monto de cobertura.

**Decisión de consentimiento (explícita, del usuario, no un descuido
técnico):** se elimina el paso de pedir consentimiento parental al cliente.
El producto sigue tratando datos de un menor (edad del hijo/a, situación
familiar), lo cual en general requiere consentimiento explícito e informado
bajo la ley de protección de datos ya citada en el prompt del sistema (Ley
81, Art. 48) — se le señaló este riesgo de compliance al usuario
explícitamente antes de que decidiera sacarlo. Queda documentado como deuda
de compliance pendiente (ver `docs/errors-learned.md` y el punto ya anotado
sobre gates de ARCO/KYC), no como algo a resolver en este ciclo.

## Decisión de arquitectura

- Se elimina el wizard completo: `@grammyjs/conversations`,
  `src/conversation/conversations/quote.ts`,
  `src/conversation/conversation.storage.ts`, la tabla `bot_conversations`
  (schema + `scripts/db-setup.ts`), y la dependencia `@grammyjs/conversations`
  + `@grammyjs/stateless-question` (esta última ya no se usaba en ningún
  lado, dependencia muerta).
- `/cotizar` deja de ser un comando con flujo propio: se convierte en un
  atajo que inyecta el texto "Quiero cotizar un seguro" al mismo handler de
  chat libre que procesa cualquier mensaje — así el comportamiento es
  idéntico si el cliente escribe `/cotizar` (Telegram) o "quiero cotizar"
  (cualquier canal, incluido WhatsApp a futuro).
- Se agregan dos herramientas nuevas al LLM, sin ningún gate de
  consentimiento (se eliminó ese gate, ver arriba):
  - `showPlans()`: sin parámetros, devuelve el resumen de Planes A/B/C desde
    la base de conocimiento (RAG), con contenido real de Juancito Ads.
  - `recommendPlan(edadNino, situacion)`: sugiere un plan según rangos fijos
    predefinidos (lógica determinística, no una opinión libre del LLM).
  - `calculateQuote` se mantiene con la misma fórmula paramétrica de siempre
    (edad × monto × plazo × tasa), pero su resultado ahora incluye a qué
    Plan (A/B/C) corresponde el monto de cobertura elegido.
- El prompt de sistema se reescribe: tono cálido/asertivo/humano, guía
  explícita sobre cuándo usar cada herramienta según lo que el cliente
  exprese, y una instrucción explícita y reforzada en la propia descripción
  de `calculateQuote`: **llamarla solo con valores que el cliente mencionó
  explícitamente en la conversación, nunca inventar ni asumir un dato
  faltante** — esto ataca directamente un bug ya observado en producción,
  donde el LLM inventó una cotización con datos que nadie le dio.
- Se mantiene silenciosamente (sin pedirlo ni mostrarlo al cliente) el
  registro de `consentParentAt` en la sesión, como marca de auditoría interna
  de cuándo arrancó el tratamiento de datos de esa conversación — decisión
  de compromiso: sin fricción para el cliente, pero sin borrar por completo
  el rastro por si hace falta para una auditoría futura.

## Branding y datos de contacto (Juancito Ads)

- El demo se presenta bajo la marca **"Juancito Ads"**, no como SURA ni
  afiliado a SURA — este NO es un proyecto oficial/autorizado por SURA.
- El contenido técnico real de SURA (coberturas, exclusiones, proceso de
  reclamación, términos) se usa como base de conocimiento real del producto.
- Los **datos de contacto son ficticios** (teléfono, email, dirección
  inventados con el mismo formato que los reales) — no se usan los números
  y correos reales de atención al cliente de SURA, para no dirigir consultas
  reales de clientes hacia las líneas de SURA bajo una marca que no es la
  suya.

## Componentes afectados

| Componente | Cambio |
|---|---|
| `src/composition.ts` | Se quita el wiring de `conversations()`/`createConversation`; `bot.command("cotizar", ...)` pasa a inyectar el mensaje al handler general en vez de `ctx.conversation.enter(...)`. |
| `src/conversation/conversations/quote.ts` | Eliminado. |
| `src/conversation/conversation.storage.ts` | Eliminado. |
| `src/persistence/schema.ts` | Se quita la tabla `botConversations`. |
| `scripts/db-setup.ts` | Se quita el `CREATE TABLE bot_conversations`. |
| `src/brain/tools/showPlans.tool.ts` (nuevo) | Herramienta de listado de planes vía RAG. |
| `src/brain/tools/recommendPlan.tool.ts` (nuevo) | Herramienta de recomendación por rangos. |
| `src/brain/tools/calculateQuote.tool.ts` | Se agrega el mapeo monto → Plan A/B/C al resultado. |
| `src/conversation/router.ts` | Se quita el gate de consentimiento sobre `calculateQuote` (`GATED`/`buildToolsForState` ya no oculta ninguna herramienta por consentimiento). |
| `src/brain/prompts/v1.system.ts` (o nueva versión) | Reescritura: tono cálido/asertivo, guía de ruteo por intención, instrucción anti-invención de datos. |
| `src/domain/knowledge/*.md` | Se agrega contenido real de Juancito Ads (coberturas, exclusiones, Plan A/B/C, contacto ficticio, proceso de reclamación) vía `scripts/seed-knowledge.ts`. |
| `package.json` | Se quitan `@grammyjs/conversations` y `@grammyjs/stateless-question`. |
| Tests | Se borran los tests atados al wizard; se agregan tests de contrato para `showPlans`/`recommendPlan`, y uno que confirme que `calculateQuote` ya no depende de ningún gate. |

## Flujo de datos

1. Cualquier mensaje (texto libre, o `/cotizar` convertido a texto) llega al
   mismo handler `message:text` de siempre.
2. El LLM, guiado por el prompt reescrito, decide qué herramienta usar según
   lo que el cliente expresó: `showPlans`/`lookupKnowledge` para preguntas
   informativas, `recommendPlan` si duda entre opciones, `calculateQuote`
   cuando ya tiene los 4 datos reales para una cotización.
3. Si falta algún dato para `calculateQuote`, el LLM sigue preguntando de
   forma natural — nunca completa con un valor asumido (instrucción
   reforzada en la propia herramienta).
4. El resto del pipeline (guardrails de entrada/salida, detección de
   angustia, RAG, control de presupuesto del LLM) no cambia.

## Nota sobre montos y rangos (datos de ejemplo)

El contenido real de SURA que se usa como base de conocimiento no incluye
los montos/precios exactos de cada Plan (la tabla de precios en la web de
SURA es interactiva y no se pudo extraer). Igual que el resto del motor de
cotización (ya marcado explícitamente como "DATOS DE EJEMPLO" en cada
respuesta), los rangos de monto que separan Plan A/B/C y la lógica de
`recommendPlan` van a usar valores ilustrativos definidos durante la
implementación, no precios reales de SURA. Esto es consistente con cómo ya
funciona el resto del bot, no es una excepción nueva.

## Casos borde

- **Cliente pide cotización sin dar ningún dato todavía:** el LLM pregunta
  conversacionalmente, no hay un "primer paso" fijo — puede empezar por
  cualquier dato según cómo fluya la charla.
- **Cliente pregunta por planes y cotización en el mismo mensaje:** el LLM
  puede llamar más de una herramienta en la misma ronda (ya soportado por
  `runToolLoop`, sin cambios ahí).
- **Riesgo residual de invención de datos:** la instrucción reforzada reduce
  el riesgo visto en producción, pero no lo elimina al 100% — es un
  guardrail a nivel de prompt, no una verificación estructural. Se acepta
  este riesgo residual para este ciclo; si reaparece en la práctica, un
  refuerzo futuro sería registrar explícitamente cada dato mencionado en
  `session.quoteState` (campo que ya existe en el schema) y validar contra
  eso antes de llamar a la herramienta — fuera de alcance de este ciclo.

## Testing

Se eliminan los tests atados al wizard (dejan de aplicar junto con el
código que borran). Se agregan tests de contrato (Groq grabado, mismo
patrón que los existentes) para `showPlans` y `recommendPlan`, y un test
unitario que confirme que `buildToolsForState`/el router ya no ocultan
`calculateQuote` por falta de consentimiento.

## Fuera de alcance de este ciclo

- Integración real de WhatsApp (el diseño la tiene en cuenta, pero no se
  construye ahora).
- Resolver la deuda de compliance de consentimiento explícito para datos de
  menores (documentada, decisión consciente de posponerla).
- Slot-filling estructural contra la invención de datos (queda como mejora
  futura si el riesgo residual se materializa en la práctica).
