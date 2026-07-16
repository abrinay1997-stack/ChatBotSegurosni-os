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
