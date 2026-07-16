# Migración a Netlify + Neon (Postgres gratuito) — Design

**Fecha:** 2026-07-16
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto

El MVP de ChatBotSeguros (23 tareas completas, mergeado a `main`) fue diseñado
pensando en Railway como hosting de producción: proceso Node persistente,
SQLite local (`better-sqlite3`), modo webhook detrás de
`RAILWAY_PUBLIC_DOMAIN`. Railway tiene un costo fijo (~$5/mes).

El usuario preguntó si se podía evitar ese costo usando en cambio los
servicios que ya tiene conectados en este entorno: Netlify (hosting) y
Supabase (Postgres). Se descartó Supabase por su comportamiento de
auto-pausa en el plan gratis (el proyecto se pausa tras ~7 días de
inactividad y requiere reactivación manual desde el dashboard; a los 90
días pausado se borra). Se eligió **Neon** como alternativa: mismo Postgres,
mismo plan gratis, pero con *scale-to-zero* transparente (el cómputo se
apaga por inactividad y se despierta solo en la siguiente conexión, sin
intervención humana).

## Decisión de arquitectura

- **Hosting de producción:** Netlify Functions (serverless), reemplazando
  Railway.
- **Base de datos:** Neon (Postgres), reemplazando `better-sqlite3`.
  Un solo proyecto de Neon para todo (dev, test y producción), usando el
  sistema de *branching* de Neon para separar los tres entornos con datos
  aislados — decisión explícita del usuario (prefiere un solo Postgres real
  antes que un motor embebido tipo PGlite para desarrollo local).
- **Desarrollo local:** sigue siendo `npm run dev` en modo *polling*, sin
  cambios de flujo — solo cambia `DATABASE_URL` para apuntar a la rama
  `dev` de Neon en vez de un archivo SQLite.
- **Producción:** un entrypoint nuevo, serverless, que recibe el webhook de
  Telegram vía Netlify Functions.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/persistence/schema.ts` | `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core`. Los tipos de columna cambian (ej. `integer({mode:"timestamp_ms"})` → `timestamp`). |
| `src/persistence/db.ts` | Driver `better-sqlite3` (síncrono) → `postgres` / `drizzle-orm/postgres-js` (async). Cambia la firma de `db.run/get/all` a `Promise`. Se elimina la creación de directorio local (`mkdirSync`), ya no aplica. |
| `src/persistence/repositories/session.repository.ts` | `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (única diferencia de sintaxis SQL real en este archivo). Los `await` ya existen (la interfaz siempre fue async), pero hay que confirmar que el driver nuevo los honra correctamente. |
| `src/domain/knowledge/rag.ts` | Reescritura completa del mecanismo de búsqueda: FTS5 (exclusivo de SQLite) → búsqueda de texto completo nativa de Postgres (`tsvector` + índice GIN + `websearch_to_tsquery` o `plainto_tsquery`). Mismo contrato (`KnowledgeRepository.retrieve`), motor distinto. |
| `src/index.ts` | Se elimina la rama de arranque en modo webhook/Railway (`RAILWAY_PUBLIC_DOMAIN`). Queda solo modo polling, para uso local/dev. Se agrega `storage` persistente (Postgres) a `conversations()` (ver más abajo). |
| `netlify/functions/telegram.ts` (nuevo) | Entry point serverless. Arma la misma composición de dependencias que `src/index.ts` (posiblemente extraída a una función compartida `buildBot()` para no duplicar) y expone `webhookCallback(bot, "netlify")`. |
| `netlify/functions/health.ts` (nuevo) | Reemplaza el `/health` de `http.server.ts`: chequeo simple de conexión a Neon. |
| `src/infra/http.server.ts` | Se elimina. Netlify enruta cada función directamente, no hace falta un servidor HTTP propio. |
| `/metrics` (Prometheus, `prom-client`) | Se elimina, no se migra. Prometheus asume un proceso vivo para acumular y exponer métricas; en serverless cada invocación es efímera, y migrar esto requeriría infraestructura adicional (pushgateway) fuera de alcance para el MVP. Si se necesita observabilidad más adelante, evaluar Netlify Analytics o function logs. |
| `bot.use(conversations())` en `src/index.ts` y en el entrypoint de Netlify | Se pasa un `storage` custom (adaptador a Postgres) en vez del default en memoria del plugin. **Este es el cambio más importante y menos obvio de toda la migración**: hoy el wizard `/cotizar` guarda en qué paso va en memoria del proceso. Funciona en polling (proceso único de larga duración) pero se rompe en serverless: cada mensaje del wizard puede caer en una invocación distinta de la función, sin memoria de la anterior. Sin este cambio, `/cotizar` fallaría después del primer mensaje en producción. |
| `package.json` | Se agrega `postgres` (o `pg`) + se quita `better-sqlite3` y `@types/better-sqlite3` como dependencias de producción (pueden quedar si algún test los sigue usando, a decidir en el plan). |

## Flujo de datos

**Local (dev, polling — sin cambios de flujo para el usuario):**
Telegram → `bot.start()` (long-polling) → mismo pipeline (guardrails → RAG →
LLM → tools → respuesta), ahora leyendo/escribiendo en la rama `dev` de Neon.

**Producción (Netlify, webhook):**
Telegram → POST a la URL de la función → `netlify/functions/telegram.ts`
arma el bot → `webhookCallback` corre el mismo pipeline → la respuesta se
manda a Telegram vía `bot.api.sendMessage` (llamada HTTP aparte, no en el
body de retorno) → la función termina.

## Casos borde

- **Timeout de función (10s en el plan gratis de Netlify).** El pipeline
  actual (guardrails → RAG → Groq → hasta 3 rondas de tool-calling) entra
  holgado en el caso normal. No se sobre-resuelve de entrada (YAGNI); si en
  producción se observan timeouts, ajustar `maxRounds` o evaluar plan pago.
- **Idempotencia ante reintentos de Telegram.** Ya cubierta por
  `sessionRepo.markProcessed(updateId)`; sigue funcionando igual en
  serverless.
- **Cold start de Neon.** La primera conexión tras inactividad tarda algo
  más (típicamente <1s), sin intervención manual. Entra dentro del límite
  de 10s de la función.
- **Secret del webhook.** Se sigue validando
  `x-telegram-bot-api-secret-token`, ahora dentro de la función de Netlify.

## Testing

Se usa una rama de Neon dedicada a tests (separada de `dev` y de
`production`), para que la suite nunca toque datos reales. La estrategia
exacta de aislamiento entre tests (transacciones con rollback vs. limpiar
tablas entre corridas) y el impacto en velocidad de la suite (hoy ~4s
contra SQLite en memoria; será más lento contra Postgres real por la red)
se define en el plan de implementación, no en este documento — no cambia
la arquitectura, es un detalle de ejecución.

## Fuera de alcance de esta migración

- No se migra `/metrics` (se elimina, ver tabla de componentes).
- No se resuelve la deuda de compliance (ARCO/KYC) documentada en
  `docs/errors-learned.md` — es independiente de esta migración de
  infraestructura.
- No se decide todavía si se mantiene o se elimina el soporte de modo
  polling a futuro; por ahora se conserva para desarrollo local.
