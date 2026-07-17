# ChatBotSeguros

Chatbot conversacional de **seguro educacional infantil** (cobertura de educación de los hijos si los padres fallecen).

## Estado

MVP funcional, en producción en Netlify (webhook) con Postgres (Neon) como
base de datos. Desarrollo local en modo polling.

## Documentación

- Spec de diseño original: [`docs/superpowers/specs/2026-07-15-chatbot-seguros-design.md`](docs/superpowers/specs/2026-07-15-chatbot-seguros-design.md)
- Plan de implementación del MVP (23 tareas TDD): [`docs/superpowers/plans/2026-07-15-chatbot-seguros-mvp.md`](docs/superpowers/plans/2026-07-15-chatbot-seguros-mvp.md)
- Spec de la migración a Netlify + Neon: [`docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md`](docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md)
- Plan de la migración a Netlify + Neon: [`docs/superpowers/plans/2026-07-16-netlify-neon-migration.md`](docs/superpowers/plans/2026-07-16-netlify-neon-migration.md)
- Instalación y deploy: [`INSTALL.md`](INSTALL.md)
- Bugs encontrados y su causa raíz: [`docs/errors-learned.md`](docs/errors-learned.md)

## Stack

Node 20 + TypeScript + grammY + Groq/GLM + Neon (Postgres) vía Drizzle + Zod + vitest + pino.
Producción: Netlify Functions v2 (webhook). Desarrollo local: polling, sin webhook.
