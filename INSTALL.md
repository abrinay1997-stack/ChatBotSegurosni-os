# Instalación — ChatBotSeguros

## Requisitos

- Node.js 20 o superior
- Un bot de Telegram (token vía [@BotFather](https://t.me/BotFather))
- Una API key de [Groq](https://console.groq.com) (proveedor por defecto) o de GLM/Zhipu
- Un proyecto de [Neon](https://neon.tech) (Postgres gratuito). Se puede crear vía
  dashboard o con el CLI oficial (`npx neonctl projects create --name <nombre>`).
  Recomendado: 3 ramas separadas (`dev`, `test`, `production`) usando el
  branching nativo de Neon, para no mezclar datos de desarrollo/tests con
  producción — ver `docs/superpowers/plans/2026-07-16-netlify-neon-migration.md`,
  Tarea 1.

## 1. Clonar e instalar dependencias

```bash
git clone <url-del-repo>
cd ChatBotSeguros
npm install
```

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Sí | Token del bot, de @BotFather |
| `GROQ_API_KEY` | Sí (si `LLM_PROVIDER=groq`) | API key de Groq |
| `GLM_API_KEY` | Sí (si `LLM_PROVIDER=glm`) | API key de GLM/Zhipu |
| `LLM_PROVIDER` | No (default `groq`) | `groq` o `glm` |
| `TELEGRAM_WEBHOOK_SECRET` | Solo en producción (Netlify) | Secreto para validar el webhook de Telegram |
| `TELEGRAM_ALLOWLIST` | No | `chat_id`s permitidos separados por coma; vacío = sin restricción |
| `DATABASE_URL` | Sí | Connection string de Postgres (rama `dev` de Neon en local) |
| `LLM_DAILY_BUDGET_USD` | No (default `5`) | Presupuesto diario del LLM antes de derivar a humano |
| `NODE_ENV` | No (default `development`) | `development` = polling local, `production` = webhook en Netlify |
| `PORT` | No (default `3000`) | Sin uso — no hay servidor HTTP propio, ver nota sobre `/metrics` más abajo |

> Con `GROQ_API_KEY` vacía igual se puede probar el flujo de cotización: el comando
> `/cotizar` es un wizard determinista que no llama al LLM. Todo lo que sea
> conversación libre (guardrails, RAG, tool-calling) sí necesita la API key.

## 3. Crear las tablas en Neon (una vez por rama)

```bash
npm run db:setup    # crea tablas (idempotente, CREATE TABLE IF NOT EXISTS)
npm run db:seed     # siembra la knowledge base desde src/domain/knowledge/*.md
```

Para apuntar a una rama distinta de la de `.env` (ej. `test` o `production`),
sobreescribí `DATABASE_URL` en la línea de comando:

```bash
DATABASE_URL="<connection string de esa rama>" npm run db:setup
```

## 4. Correr en desarrollo (polling, sin webhook)

```bash
npm run dev
```

Buscá el bot en Telegram (por el username configurado en @BotFather) y probá `/cotizar`
o escribile directamente. Este modo no necesita `TELEGRAM_WEBHOOK_SECRET` ni URL
pública — funciona igual con `DATABASE_URL` apuntando a Neon.

## 5. Tests y typecheck

```bash
npm run typecheck   # 0 errores esperado
npm test            # suite completa (unit + contract + e2e), contra la rama `test` de Neon
```

Los tests que tocan la base de datos usan `DATABASE_URL_TEST` (cargado desde
`.env.test`, ver Tarea 1 del plan de migración) para no pisar datos de `dev`.

## 6. Producción (Netlify)

El bot corre como funciones serverless en `netlify/functions/` (formato Netlify
Functions v2 — `Request`/`Response` web-estándar), no como proceso persistente:

- `netlify/functions/telegram.mts` — recibe el webhook de Telegram en `/telegram`
- `netlify/functions/health.mts` — health check en `/health`

Puntos a tener en cuenta si se vuelve a desplegar desde cero (ver
`docs/errors-learned.md` para el detalle de cada uno):

- Las funciones leen configuración con `Netlify.env.toObject()`, **no**
  `process.env` — el runtime de Netlify Functions v2 no lo puebla.
- Al configurar las variables de entorno del sitio (dashboard o vía API), no
  hace falta marcar ninguna como "secret" — ese flag, en la práctica, puede
  hacer que la variable no llegue al runtime de la función.
- El wizard de cotización usa `@grammyjs/conversations`, cuyo motor reejecuta
  la función de la conversación completa en cada mensaje (replay). Cualquier
  código nuevo dentro del wizard que tenga efectos secundarios (DB, límites en
  memoria, etc.) tiene que ir envuelto en `conversation.external(...)`.

Pasos de deploy (dashboard de Netlify o vía su MCP):

1. Crear el sitio, conectarlo al repo, y configurar la **rama de producción**
   a la rama que se quiera desplegar (no necesariamente `main`).
2. Configurar las 9 variables de entorno del sitio (mismas que en `.env`, más
   `TELEGRAM_WEBHOOK_SECRET` generado — ej. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   — y `DATABASE_URL` apuntando a la rama `production` de Neon).
3. Crear las tablas en esa rama de Neon (`npm run db:setup` / `db:seed` con
   `DATABASE_URL` de `production`).
4. Deployar (push a la rama conectada, o trigger manual).
5. Verificar `curl https://<sitio>.netlify.app/health` → `ok`.
6. Configurar el webhook de Telegram:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<sitio>.netlify.app/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

**Importante:** configurar el webhook apaga el modo polling — Telegram solo
entrega actualizaciones por un canal a la vez. Si corrés `npm run dev` (polling)
después de configurar el webhook, no vas a recibir mensajes hasta que borres
el webhook (`curl ".../deleteWebhook"`).

## 7. Alternativa: Docker / VPS propio (polling, sin Netlify)

```bash
docker compose up --build
```

Corre el bot en modo polling dentro de un contenedor — alternativa a Netlify
si se prefiere un VPS propio en vez de serverless. Necesita las mismas
variables de entorno de `.env`, apuntando `DATABASE_URL` a Neon igual que en
desarrollo.

## Notas

- `docs/errors-learned.md` documenta bugs reales encontrados durante el
  desarrollo y la migración a Netlify + Neon (con causa raíz y prevención),
  y la deuda técnica pendiente antes de manejar datos personales reales (PII)
  de menores/padres: gates de ARCO/KYC, entre otros.
- El rate limiter (mensajes/cotizaciones por hora) vive en memoria del
  proceso — en Netlify, cada invocación fría de una función tiene su propio
  contador, así que el límite es "mejor esfuerzo" en vez de exacto en
  producción (decisión documentada en
  `docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md`).
- `/metrics` (Prometheus) existía en la versión Railway del bot y se eliminó
  en la migración a Netlify — no encaja con el modelo serverless sin
  infraestructura adicional (pushgateway). No hay reemplazo por ahora.
