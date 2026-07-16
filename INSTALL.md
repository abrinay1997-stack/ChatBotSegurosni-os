# Instalación — ChatBotSeguros

## Requisitos

- Node.js 20 o superior
- Un bot de Telegram (token vía [@BotFather](https://t.me/BotFather))
- Una API key de [Groq](https://console.groq.com) (proveedor por defecto) o de GLM/Zhipu

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
| `TELEGRAM_WEBHOOK_SECRET` | Solo en producción | Secreto para validar el webhook de Telegram |
| `TELEGRAM_ALLOWLIST` | No | `chat_id`s permitidos separados por coma; vacío = sin restricción |
| `DATABASE_URL` | No (default `./data/chatbot.db`) | Ruta del SQLite |
| `LLM_DAILY_BUDGET_USD` | No (default `5`) | Presupuesto diario del LLM antes de derivar a humano |
| `NODE_ENV` | No (default `development`) | `development` = polling, `production` = webhook |
| `PORT` | No (default `3000`) | Puerto del servidor HTTP (`/health`, `/metrics`, `/telegram`) |

> Con `GROQ_API_KEY` vacía igual se puede probar el flujo de cotización: el comando
> `/cotizar` es un wizard determinista que no llama al LLM. Todo lo que sea
> conversación libre (guardrails, RAG, tool-calling) sí necesita la API key.

## 3. Correr en desarrollo (polling, sin webhook)

```bash
npm run dev
```

Buscá el bot en Telegram (por el username configurado en @BotFather) y probá `/cotizar`
o escribile directamente.

## 4. Tests y typecheck

```bash
npm run typecheck   # 0 errores esperado
npm test            # suite completa (unit + contract + e2e)
```

## 5. Build de producción

```bash
npm run build   # compila a dist/ y copia los prompts (.md) que tsc no copia solo
npm start        # node dist/index.js
```

En producción (`NODE_ENV=production`) el bot corre en modo **webhook**, no polling:
necesita `TELEGRAM_WEBHOOK_SECRET` configurado y una URL pública HTTPS (el código
usa `RAILWAY_PUBLIC_DOMAIN` si se despliega en [Railway](https://railway.app), que
tiene un plan Hobby de ~$5/mes suficiente para este bot).

## 6. Docker

```bash
docker compose up --build
```

Esto levanta el bot con el `.env` local y persiste el SQLite en `./data`. El
`Dockerfile` usa build multi-stage: una etapa instala todas las dependencias
(incluidas las de desarrollo, necesarias para compilar TypeScript) y compila;
la imagen final solo copia el `dist/` resultante e instala dependencias de
producción, así que queda liviana.

## Notas

- El bot usa SQLite por defecto (`better-sqlite3`); para más de una instancia
  corriendo en paralelo hay que migrar a Postgres (el schema usa Drizzle, que
  soporta ambos).
- `docs/errors-learned.md` documenta la deuda técnica pendiente antes de manejar
  datos personales reales (PII) de menores/padres: gates de ARCO/KYC, entre otros.
