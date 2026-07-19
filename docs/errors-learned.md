# Lecciones aprendidas / Anti-patrones

## [2026-07-15] Bot de referencia `telegram-ai-bot` — anti-patrones a NO heredar

**Contexto:** se usó `telegram-ai-bot` como referencia de patrones para ChatbotSeguros.
**Anti-patrones encontrados:**

1. **Refresh token por chat** (`index.js:269`): credenciales OAuth gestionadas por chat en memoria.
   - **Prevención:** secretos solo en `.env` + vaulting; nunca por chat.
2. **Prompt secreto embebido** (`index.js:284`): `SYSTEM_PROMPT` hardcodeado en el código.
   - **Prevención:** prompt externo en `src/brain/prompts/v1.system.md`, versionado, sin secretos.
3. **RAG concatenado al system prompt** (`messageProcessor.js:48`): contexto recuperado inyectado en system.
   - **Prevención:** RAG va en mensaje `user` con delimitadores `===CONTEXTO===` (ver `router.ts`).
4. **`JSON.parse` frágil de intención** (`intentDetector.js:52-73`): clasificación por JSON forzado.
   - **Prevención:** tool-calling nativo (ver `registry.ts`).
5. **Sin rate-limit ni auth de webhook.**
   - **Prevención:** `createRateLimiter` + validación `X-Telegram-Bot-Api-Secret-Token` (ver `telegram.channel.ts`, `http.server.ts`).
6. **Secretos filtrados** en archivo `env` (sin punto) — commiteado potencialmente.
   - **Prevención:** revocar y regenerar; `gitleaks`/`trufflehog` en pre-commit + pipeline; grep de secretos en prompts en CI.

## [2026-07-15] TypeScript 7 instalado por defecto

**Contexto:** `npm install -D typescript` sin pin resolvió a v7, violando el constraint "TS 5.x".
**Causa:** el brief no pinteó versión; `latest` = v7.
**Fix:** pinar `typescript ^5.6` (commit `1a2de62`).
**Prevención:** siempre pinear majors en deps que el plan asume (también `zod ^3.23` porque el plan introspecciona internas de Zod v3 `_def`).

## [2026-07-15] Regex distress no matcheaba "falleció"

**Contexto:** `fallec[ií]o` no matchea "falleció" (termina en `ó`).
**Fix:** `fallec[ií][oó]` (commit `b1c183c`).
**Prevención:** testear casos con acentos reales del español.

## [2026-07-17] `npm install` sin pin resolvió una versión vieja de `@neondatabase/serverless`

**Contexto:** migración de SQLite a Neon (Postgres). El plan especificaba `sql.query(text, params)` como API para queries parametrizadas crudas.
**Error:** `npm install @neondatabase/serverless` (sin versión) resolvió `^0.10.4`, una versión que no tiene el método `.query()`. El implementador lo detectó y lo esquivó con `(sql as any)(text, params)`, ocultando el problema real en vez de resolverlo.
**Causa raíz:** no pinear versión al instalar; el paquete tenía releases más nuevas (`1.1.0`) con la API documentada.
**Fix:** bump a `^1.1.0`, uso de `sql.query()` sin casts (commit `7ed5bc7`).
**Prevención:** cuando el plan asume una API específica de una librería, verificar contra la versión real instalada antes de escribir código alrededor — un cast `as any` que "hace que compile" suele estar tapando una versión equivocada, no un problema real de tipos.

## [2026-07-17] Netlify Functions v2: `process.env` no está poblado, hay que usar `Netlify.env`

**Contexto:** deploy a Netlify Functions (webhook de Telegram + health check).
**Error:** `/health` devolvía `db-down` en producción. `parseConfig(process.env)` no encontraba `DATABASE_URL`, caía al default SQLite (`./data/chatbot.db`), y `neon()` lo rechazaba como URL inválida.
**Causa raíz:** en el runtime de Netlify Functions v2, las variables de entorno del sitio NO se inyectan en `process.env` — solo están disponibles vía el global `Netlify.env.get()/.toObject()`. La documentación oficial de Netlify (vía su MCP) ya lo advertía ("ONLY use `Netlify.env.*`") pero se pasó por alto al escribir el código inicial.
**Fix:** `parseConfig(Netlify.env.toObject())` en `netlify/functions/*.mts`, en vez de `process.env` (commit `e71cf39`). `src/index.ts` (polling local) sigue usando `process.env` normal, ahí sí lo puebla `dotenv/config`.
**Prevención:** cuando una plataforma serverless tiene guías propias sobre cómo leer configuración/env vars, seguirlas literalmente — `process.env` "funciona en todos lados" es una asunción que no vale para todos los runtimes serverless.

## [2026-07-17] Netlify Functions (MCP `manage-env-vars`): pasar `newVarContext`/`newVarScopes` explícitos rompe el guardado en silencio

**Contexto:** configuración de las 9 env vars de producción del sitio de Netlify vía la herramienta MCP.
**Error:** cada llamada a `manage-env-vars` con `upsertEnvVar: true` devolvía `"Environment variable upserted"` (éxito), pero `getAllEnvVars` mostraba la lista vacía — ninguna variable llegaba realmente al runtime de la función (confirmado con un `env_keys` de diagnóstico en `/health`).
**Causa raíz:** pasar `newVarContext: "all"` / `newVarScopes: ["all"]` (o `["functions","runtime"]`) explícitamente hacía que el guardado fallara silenciosamente pese al mensaje de éxito. Sin esos parámetros (dejando los defaults de la herramienta), el guardado funcionó correctamente.
**Fix:** omitir `newVarContext`/`newVarScopes` en las llamadas a `manage-env-vars` (solo `siteId`, `upsertEnvVar`, `envVarKey`, `envVarValue`).
**Segundo hallazgo relacionado:** las variables con `envVarIsSecret: true` tampoco llegaban al runtime (ni la key aparecía en `Netlify.env.toObject()`), pese al mismo "éxito" reportado. Se resolvió seteándolas sin ese flag — siguen siendo privadas del sitio, el flag "secret" es una capa extra de Netlify (redacción en logs/UI) que no era necesaria acá.
**Prevención:** con esta herramienta MCP en particular, no confiar en el mensaje de "upserted" — verificar siempre con `getAllEnvVars` (o un endpoint de diagnóstico) después de escribir. No pasar `newVarContext`/`newVarScopes`/`envVarIsSecret` a menos que se confirme primero que sí persisten con esos parámetros.

## [2026-07-17] Serverless: un `.md` leído con `readFileSync` en runtime no se empaqueta

**Contexto:** el prompt de sistema del bot vivía en `src/brain/prompts/v1.system.md`, cargado con `readFileSync` relativo a `import.meta.url` — funcionaba en polling local y en el build de Docker (con un script `copy-prompts.mjs` que copiaba el `.md` a `dist/`).
**Error:** en producción (Netlify Functions), cada mensaje devolvía 502; los logs mostraban `ENOENT: no such file or directory, open '/var/task/netlify/functions/prompts/v1.system.md'`.
**Causa raíz:** el bundler de Netlify Functions (esbuild) solo sigue imports de código (`.ts`/`.js`) para armar el bundle de la función — no copia archivos no-JS referenciados solo vía `readFileSync` en runtime, aunque el build de `tsc`/Docker sí los tenía (por el script de copia manual).
**Fix:** el prompt pasa a ser una constante exportada desde un módulo `.ts` (`src/brain/prompts/v1.system.ts`) en vez de un archivo `.md` leído en runtime (commit `b359418`). Se elimina `scripts/copy-prompts.mjs`, ya innecesario.
**Prevención:** cualquier asset no-JS que el código lea con `fs` en runtime (prompts, plantillas, datos estáticos) es un riesgo de portabilidad entre bundlers/runtimes distintos (tsc vs esbuild vs Docker). Si el proyecto puede terminar en más de un target de deploy, preferir constantes de código sobre lectura de archivo en runtime, o configurar explícitamente el bundling de esos assets (`included_files` de Netlify, `esbuild.loader`, etc.) y probarlo en el runtime real antes de darlo por hecho.

## [2026-07-17] `@grammyjs/conversations`: efectos secundarios sin `conversation.external()` se ejecutan una vez por mensaje, no una vez por conversación

**Contexto:** el wizard `/cotizar` (`quote.ts`) llama a `limiter.allowQuote(chatId)` (rate limiter en memoria) y `sm.setConsent(chatId)` (escritura a Postgres) como código plano dentro de la función de la conversación.
**Error:** en producción (serverless, sin proceso persistente), el wizard se cortaba en silencio después de la 2da o 3ra pregunta, sin ninguna excepción en los logs. Reproducido de forma determinística contra la base de datos: `bot_conversations` pasaba a 0 filas antes de llegar a "Monto de cobertura".
**Causa raíz:** el motor de `@grammyjs/conversations` reejecuta la función de la conversación **completa desde el inicio** en cada mensaje nuevo, usando checkpoints cacheados para saltarse los `ctx.reply()`/`conversation.waitFor()` ya resueltos (así reconstruye en qué pregunta iba sin volver a mandar mensajes duplicados). Pero cualquier código plano que NO pase por esos métodos especiales del motor —como una llamada a un objeto propio (`limiter.allowQuote`, una escritura a DB)— se re-ejecuta de verdad en cada replay. Con `globalQuotesPerMin: 5` configurado, un solo wizard de 5 pasos agotaba el límite global él solo, y la rama `if (!allowed) return` cortaba la conversación sin dejar rastro de error.
**Fix:** envolver ambas llamadas en `conversation.external(() => ...)`, que el motor garantiza ejecutar una sola vez y cachear el resultado para replays futuros (commit `6a23bfb`).
**Prevención:** dentro de una función de conversación de `@grammyjs/conversations`, cualquier código que no sea puro/determinístico (I/O, `Date.now()`, `Math.random()`, llamadas a objetos con estado propio) tiene que pasar por `conversation.external()` (o los helpers `conversation.now()`/`.random()`/`.log()` para esos casos comunes) — nunca ejecutarse como código plano entre `waitFor`s. Esto no se manifiesta en polling local con un solo proceso de larga duración (ahí "replay" y "primera ejecución" coinciden lo suficientemente seguido como para no notarse), pero sí en cualquier entorno donde el proceso se reinicia o distribuye entre mensajes.

## [2026-07-17] Bot en producción respondía siempre el mismo fallback genérico — proveedor LLM sin cuota, error tragado en silencio

**Contexto:** primer webhook de Telegram registrado contra el deploy de producción (`chatbot-seguros.netlify.app`). El bot respondía a todo, pero siempre con el mismo texto ("No tengo respuesta para eso"), sin importar el mensaje.
**Error:** ningún error visible — `finalResponse` llegaba `undefined` desde `runToolLoop` sin ninguna excepción.
**Causa raíz doble:** (1) `parseOpenAIResponse` (`openai-response.ts`) nunca revisaba `res.ok` ni `json.error` — un fallo HTTP de Groq/GLM se parseaba igual que una respuesta válida vacía, indistinguible de "el modelo no supo responder". (2) La causa real detrás de ese fallo era un `429` de Groq: cuota diaria de tokens (`on_demand`, 100k TPD) agotada, en parte por las pruebas de reproducción corridas contra la misma API key durante el diagnóstico.
**Fix:** `parseOpenAIResponse` ahora lanza un error explícito si `res.ok === false` o `json.error` existe (commit `ed453f3`). `composition.ts` separa el mensaje de "proveedor caído" del de "respuesta vacía genuina" (commit `6910ac5`). Se agregó fallback automático a NVIDIA (`moonshotai/kimi-k2.6`) vía `createFallbackProvider` para que un 429/5xx del proveedor primario no tumbe la respuesta al cliente.
**Prevención:** cualquier wrapper de una API HTTP que parsee `res.json()` sin chequear `res.ok` primero puede convertir un error real en un "éxito vacío" — especialmente peligroso combinado con un `??` de fallback más abajo en la cadena, que enmascara el problema con un mensaje que suena a límite del modelo (no del proveedor). Diagnosticar reproduciendo el pipeline completo fuera del runtime de producción (Bun/Node local con las mismas credenciales y el mismo flujo real) antes de sospechar de la lógica de negocio — acá descartó RAG, tools, prompt y sesión en un solo paso.
**Archivos:** `src/brain/providers/openai-response.ts`, `src/composition.ts:97-115`, `src/brain/providers/fallback.provider.ts`, `src/brain/providers/nvidia.provider.ts`.

## [2026-07-19] Bot de clientes se caía en mensajes con tool-calling — 502 Bad Gateway por timeout del LLM en serverless

**Contexto:** con NVIDIA `meta/llama-3.1-70b-instruct` como proveedor primario, el bot contestaba el primer mensaje simple pero se quedaba mudo en los siguientes (los que disparan herramientas: "qué cubre", "quiero cotizar").
**Error:** `getWebhookInfo` mostraba `last_error_message: "Wrong response from the webhook: 502 Bad Gateway"`. No había excepción en el código.
**Causa raíz:** una sola llamada a NVIDIA 70b mide **~12.8s**, y las funciones de Netlify (sincrónicas) cortan a los **10s** → 502. Telegram interpreta el 502 como entrega fallida y no muestra respuesta. El `runToolLoop` puede encadenar hasta 3 llamadas, así que hasta un modelo apenas lento revienta el presupuesto de tiempo. Groq 70b (0.85s) y NVIDIA 8b (1.7s) sí entran; NVIDIA 70b no.
**Fix:** default del provider NVIDIA cambiado a `meta/llama-3.1-8b-instruct` (rápido), configurable vía `NVIDIA_MODEL`. Config de producción: `LLM_PROVIDER=groq` (primario, rápido y buena calidad) + `LLM_FALLBACK_PROVIDER=nvidia` (respaldo 8b, rápido, sin límite de cuota). Nunca hay timeout.
**Prevención:** en serverless con timeout corto (Netlify 10s, Lambda configurable), la latencia del LLM es una restricción de arquitectura, no un detalle. Medir `time_total` de cada modelo candidato ANTES de ponerlo en producción, y multiplicar por el máximo de rondas del tool-loop. Un modelo "mejor" pero lento es peor que uno rápido si tumba la request entera. El síntoma (bot mudo) es idéntico al de cuota agotada — distinguir mirando `getWebhookInfo` (502 = timeout/crash de la función; sin error = otra cosa).
**Archivos:** `src/brain/providers/nvidia.provider.ts`, `src/infra/config.ts`, `src/composition.ts:50-54`.
