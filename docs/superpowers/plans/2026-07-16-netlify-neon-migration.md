# Migración a Netlify + Neon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar Railway (proceso persistente) + SQLite local por Netlify Functions (serverless) + Neon (Postgres gratuito con scale-to-zero), sin costo fijo mensual, preservando el flujo de desarrollo local en polling.

**Architecture:** `src/index.ts` (polling, dev local) y una nueva función serverless `netlify/functions/telegram.mts` (webhook, producción) comparten la misma composición de dependencias vía `src/composition.ts::buildBot()`. La persistencia pasa de `better-sqlite3` a `@neondatabase/serverless` (driver HTTP, sin pool de conexiones) vía `drizzle-orm/neon-http`. El RAG pasa de FTS5 (SQLite) a full-text search nativo de Postgres. El estado del wizard `/cotizar` (`@grammyjs/conversations`) pasa de memoria de proceso a una tabla Postgres, porque en serverless cada mensaje puede caer en una invocación distinta.

**Tech Stack:** Netlify Functions v2 (`Request`/`Response` web-estándar), Neon (Postgres), `@neondatabase/serverless`, `drizzle-orm/neon-http`, grammY (`webhookCallback(bot, "std/http")`), Vitest.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md`.
- Un solo Postgres (Neon) para dev/test/producción, usando branching de Neon (decisión explícita del usuario).
- Rate limiter permanece en memoria (degradación aceptada para el MVP, decisión explícita del usuario) — no se migra a Postgres en este plan.
- `/metrics` (Prometheus) se elimina, no se migra.
- Node 20+, TypeScript estricto (`tsconfig.json` ya configurado), ESM (`"type": "module"`).
- Cada test que toca la base de datos usa un `chat_id`/`key` único (`crypto.randomUUID()`), nunca literales fijos como `"c1"` — la suite corre contra una rama Postgres real compartida (`test`), y los tests pueden ejecutarse en paralelo entre archivos.
- Commits frecuentes, uno por tarea completada, siguiendo el estilo de mensajes ya usado en el repo (`git log --oneline` para referencia).

---

### Task 1: Provisionar Neon (manual, sin código) — ✅ COMPLETADA 2026-07-16

Ejecutada vía `neonctl` (CLI oficial de Neon) en vez de manualmente por el dashboard —
más rápido y reproducible. Datos para referencia de la Tarea 8:

- Proyecto: `chatbot-seguros`, `project-id: divine-dew-54950769`, región `aws-us-east-1`.
- Rama `production` (default del proyecto): sin branch-id propio adicional, es la rama base.
- Rama `dev`: `branch-id: br-flat-shadow-avagwd0k` — connection string ya en `.env` local.
- Rama `test`: `branch-id: br-cold-lab-avttsn20` — connection string ya en `.env.test` local.
- Para obtener el connection string de `production` en la Tarea 8:
  `npx neonctl connection-string --project-id divine-dew-54950769` (sin `--branch-id` devuelve la rama por defecto).

<details>
<summary>Pasos originales (referencia, ya no hace falta seguirlos manualmente)</summary>

**Files:** ninguno (esto es un paso operativo, no de código). Al final se edita `.env` y se crea `.env.test` (no versionados).

**Interfaces:**
- Produces: tres connection strings de Postgres (ramas `production`, `dev`, `test` de un mismo proyecto Neon), usados por todas las tareas siguientes vía `DATABASE_URL` / `DATABASE_URL_TEST`.

- [ ] **Paso 1: Crear proyecto en Neon**

Ir a https://console.neon.tech, iniciar sesión (con GitHub para simplificar). Crear un proyecto nuevo:
- Nombre: `chatbot-seguros`
- Región: la más cercana a los usuarios reales del bot (si no hay preferencia, `aws-us-east-1`).

Esto crea automáticamente una rama por defecto llamada `production` con una base `neondb`.

- [ ] **Paso 2: Copiar el connection string de `production`**

En el dashboard del proyecto → **Connection Details** → copiar el connection string (formato `postgresql://usuario:password@host/neondb?sslmode=require`). **No usar el "pooled connection"** (PgBouncer) — el driver HTTP de Neon (`@neondatabase/serverless`) no lo necesita, cada query ya es una request HTTP independiente sin conexión persistente que agotar.

Guardar este string aparte (por ejemplo, en un gestor de contraseñas o nota temporal) — se usa en la Tarea 8 para configurar las variables de entorno de Netlify. **No lo pegues en el repo.**

- [ ] **Paso 3: Crear las ramas `dev` y `test`**

En el dashboard → **Branches** → **New Branch** (dos veces):
- Rama `dev` (branch off de `production`)
- Rama `test` (branch off de `production`)

Copiar el connection string de cada una (mismo lugar: Connection Details, seleccionando la rama correspondiente arriba).

- [ ] **Paso 4: Configurar `.env` y `.env.test` locales**

Editar `.env` (ya existe en el repo, con `TELEGRAM_BOT_TOKEN` y `GROQ_API_KEY` ya configurados) y reemplazar la línea `DATABASE_URL`:

```
DATABASE_URL=postgresql://<usuario>:<password>@<host-de-la-rama-dev>/neondb?sslmode=require
```

Crear un archivo nuevo `.env.test` (mismo directorio raíz del repo) con:

```
DATABASE_URL_TEST=postgresql://<usuario>:<password>@<host-de-la-rama-test>/neondb?sslmode=require
```

- [ ] **Paso 5: Confirmar que `.env.test` está ignorado por git**

Leer `.gitignore` y verificar que cubre `.env.test` además de `.env`. Si no lo cubre (hoy solo tiene la línea literal `.env`), reemplazar esa línea por el patrón `.env*` para cubrir ambos archivos automáticamente:

```bash
git diff --stat .gitignore  # antes de commitear, confirmar visualmente el cambio
```

Editar `.gitignore`: cambiar la línea `.env` por `.env*`.

- [ ] **Paso 6: Verificar que las variables cargan**

```bash
node -e "require('dotenv').config(); console.log('DATABASE_URL:', !!process.env.DATABASE_URL)"
```

Expected: `DATABASE_URL: true`

```bash
node -e "require('dotenv').config({path:'.env.test'}); console.log('DATABASE_URL_TEST:', !!process.env.DATABASE_URL_TEST)"
```

Expected: `DATABASE_URL_TEST: true`

- [ ] **Paso 7: Commit**

```bash
git add .gitignore
git commit -m "chore: prepara .gitignore para .env.test (Neon)"
```

(`.env` y `.env.test` mismos NO se commitean — solo el cambio en `.gitignore`.)

</details>

---

### Task 2: Schema Postgres y conexión a Neon

**Files:**
- Modify: `src/persistence/schema.ts` (reescritura completa)
- Modify: `src/persistence/db.ts` (reescritura completa)
- Create: `scripts/db-setup.ts`
- Create: `tests/setup.ts`
- Modify: `vitest.config.ts`
- Modify: `tests/unit/db.spec.ts` (reescritura completa)
- Modify: `package.json` (agregar `@neondatabase/serverless`, quitar la creación de directorio ya no aplica)

**Interfaces:**
- Consumes: nada (es la base de la capa de persistencia).
- Produces: `DatabaseHandle { db: { run(sql, params?): Promise<{rowCount:number}>, get(sql, params?): Promise<unknown>, all(sql, params?): Promise<unknown[]> }, close(): void }`, exportado desde `src/persistence/db.ts`, consumido por todas las tareas siguientes.

- [ ] **Paso 1: Instalar dependencias**

```bash
npm install @neondatabase/serverless
npm uninstall better-sqlite3 @types/better-sqlite3
```

- [ ] **Paso 2: Reescribir `src/persistence/schema.ts`**

```typescript
import { pgTable, text, bigint, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  chatId: text("chat_id").primaryKey(),
  history: text("history"),
  quoteState: text("quote_state"),
  consentParentAt: bigint("consent_parent_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const processedUpdates = pgTable("processed_updates", {
  updateId: integer("update_id").primaryKey(),
  processedAt: bigint("processed_at", { mode: "number" }),
});

export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chatId: text("chat_id").notNull(),
  quote: text("quote").notNull(),
  consentParentAt: bigint("consent_parent_at", { mode: "number" }),
  piiConsentAt: bigint("pii_consent_at", { mode: "number" }),
  retentionDays: integer("retention_days").notNull().default(90),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const promptVersions = pgTable("prompt_versions", {
  version: text("version").primaryKey(),
  hash: text("hash").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const knowledge = pgTable("knowledge", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  text: text("text").notNull(),
});

export const botConversations = pgTable("bot_conversations", {
  key: text("key").primaryKey(),
  state: text("state").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
```

Nota: `history`/`quoteState`/`quote`/`state` quedan como `text` (no `jsonb`) a propósito — el código de los repositorios sigue haciendo `JSON.stringify`/`JSON.parse` manualmente (no se usa el query builder de Drizzle en runtime, solo SQL crudo parametrizado), así que mantener `text` evita tener que tocar esa lógica. Los timestamps quedan como `bigint` (epoch milliseconds, no `timestamp`) porque el código existente ya trabaja con `Date.now()` como número plano en todos lados — usar `timestamp` obligaría a convertir `Date` ↔ `number` en cada punto de lectura/escritura sin ningún beneficio real.

- [ ] **Paso 3: Reescribir `src/persistence/db.ts`**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export interface DatabaseHandle {
  db: NeonHttpDatabase<typeof schema> & {
    run(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
    get(sql: string, params?: unknown[]): Promise<unknown>;
    all(sql: string, params?: unknown[]): Promise<unknown[]>;
  };
  close(): void;
}

export function createDatabase(url: string): DatabaseHandle {
  const sql = neon(url, { fullResults: true });
  const base = drizzle(sql, { schema });
  const db = base as DatabaseHandle["db"];

  db.run = async (text: string, params: unknown[] = []) => {
    const result = await sql.query(text, params);
    return { rowCount: (result as { rowCount: number | null }).rowCount ?? 0 };
  };
  db.get = async (text: string, params: unknown[] = []) => {
    const result = await sql.query(text, params);
    return (result as { rows: unknown[] }).rows[0];
  };
  db.all = async (text: string, params: unknown[] = []) => {
    const result = await sql.query(text, params);
    return (result as { rows: unknown[] }).rows;
  };

  // El driver HTTP de Neon no mantiene una conexión persistente que cerrar;
  // cada query es un request HTTP independiente. close() es un no-op que
  // preserva la interfaz que usan index.ts y los tests.
  return { db, close: () => {} };
}
```

- [ ] **Paso 4: Crear `scripts/db-setup.ts`**

Crea las tablas (idempotente, `CREATE TABLE IF NOT EXISTS`) en la rama de Neon que apunte `DATABASE_URL`. Se corre una vez por rama (dev, test, y luego production en la Tarea 8) — **no** corre en cada arranque del bot ni en cada invocación de la función serverless.

```typescript
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está seteada");
  const sql = neon(url);

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT PRIMARY KEY,
    history TEXT,
    quote_state TEXT,
    consent_parent_at BIGINT,
    updated_at BIGINT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS processed_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at BIGINT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id TEXT NOT NULL,
    quote TEXT NOT NULL,
    consent_parent_at BIGINT,
    pii_consent_at BIGINT,
    retention_days INTEGER NOT NULL DEFAULT 90,
    created_at BIGINT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS prompt_versions (
    version TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    text TEXT NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_search_idx ON knowledge USING GIN (to_tsvector('spanish', text))`;
  await sql`CREATE TABLE IF NOT EXISTS bot_conversations (
    key TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;

  console.log("Tablas creadas/verificadas en", url.replace(/:[^:@]+@/, ":***@"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Agregar el script a `package.json` (dentro de `"scripts"`):

```json
"db:setup": "tsx scripts/db-setup.ts"
```

Correr contra `dev` (usa `.env` automáticamente vía `dotenv/config`):

```bash
npm run db:setup
```

Expected: `Tablas creadas/verificadas en postgresql://***@...`

Correr contra `test`:

```bash
DATABASE_URL="$(node -e "require('dotenv').config({path:'.env.test'});console.log(process.env.DATABASE_URL_TEST)")" npm run db:setup
```

Expected: mismo mensaje de éxito, apuntando a la rama `test`.

- [ ] **Paso 5: Crear `tests/setup.ts`**

Carga `.env.test` (si existe) para que `process.env.DATABASE_URL_TEST` esté disponible en toda la suite.

```typescript
import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.test")) {
  config({ path: ".env.test" });
}
```

- [ ] **Paso 6: Wirear `tests/setup.ts` en `vitest.config.ts`**

Modificar `vitest.config.ts:4-10` agregando `setupFiles`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    setupFiles: ["./tests/setup.ts"],
    projects: [
      { test: { name: "unit", dir: "tests/unit", include: ["**/*.spec.ts"] } },
      { test: { name: "contract", dir: "tests/contract", include: ["**/*.spec.ts"] } },
      { test: { name: "e2e", dir: "tests/e2e", include: ["**/*.spec.ts"] } },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 90, branches: 90, functions: 90, lines: 90,
        perFile: true,
      },
    },
  },
});
```

- [ ] **Paso 7: Reescribir `tests/unit/db.spec.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, type DatabaseHandle } from "../../src/persistence/db.js";

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

describe("createDatabase", () => {
  it("permite insertar y leer una sesión", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const chatId = randomUUID();
    const now = Date.now();
    await h.db.run(
      "INSERT INTO sessions (chat_id, history, quote_state, updated_at) VALUES ($1, $2, $3, $4)",
      [chatId, "[]", "{}", now],
    );
    const row = (await h.db.get("SELECT chat_id FROM sessions WHERE chat_id = $1", [chatId])) as { chat_id: string };
    expect(row.chat_id).toBe(chatId);
    h.close();
  });

  it("processed_updates idempotente con ON CONFLICT DO NOTHING", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const updateId = Math.floor(Math.random() * 1_000_000_000);
    const r1 = await h.db.run(
      "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
      [updateId, Date.now()],
    );
    const r2 = await h.db.run(
      "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
      [updateId, Date.now()],
    );
    expect(r1.rowCount).toBe(1);
    expect(r2.rowCount).toBe(0);
    h.close();
  });
});
```

- [ ] **Paso 8: Correr los tests y verificar que pasan**

```bash
npx vitest run tests/unit/db.spec.ts
```

Expected: `2 passed`. Si falla con un error de conexión, revisar que `.env.test` tenga el connection string correcto de la rama `test` (Tarea 1, Paso 3-4).

- [ ] **Paso 9: Typecheck**

```bash
npm run typecheck
```

Expected: va a fallar todavía en `session.repository.ts` y `rag.ts` (usan `?` en vez de `$1`, y algunos siguen esperando el driver viejo) — **eso es esperado en este punto**, se arregla en las Tareas 3 y 4. Confirmar que el único error reportado está en esos dos archivos, no en `schema.ts`/`db.ts`/`db.spec.ts`.

- [ ] **Paso 10: Commit**

```bash
git add package.json package-lock.json src/persistence/schema.ts src/persistence/db.ts scripts/db-setup.ts tests/setup.ts vitest.config.ts tests/unit/db.spec.ts
git commit -m "feat(persistence): migra schema y conexión de SQLite a Neon (Postgres HTTP)"
```

---

### Task 3: SessionRepository a Postgres

**Files:**
- Modify: `src/persistence/repositories/session.repository.ts`
- Modify: `tests/unit/session.repository.spec.ts`
- Modify: `tests/unit/session.manager.spec.ts`
- Modify: `tests/e2e/flows.spec.ts`

**Interfaces:**
- Consumes: `DatabaseHandle` de `src/persistence/db.ts` (Tarea 2).
- Produces: `SessionRepository` (sin cambios de forma, ya definida en `src/shared/ports/index.ts`), consumido por `SessionManager` y por `composition.ts` en la Tarea 6.

- [ ] **Paso 1: Reescribir `src/persistence/repositories/session.repository.ts`**

Único cambio real: placeholders `?` → `$1,$2,...` y `await` en las tres queries (la interfaz ya era `async`, pero el driver viejo era síncrono por dentro). La cláusula `ON CONFLICT ... DO UPDATE SET col=excluded.col` no cambia — Postgres soporta la misma palabra clave `excluded` que SQLite.

```typescript
import type { DatabaseHandle } from "../db.js";
import type { SessionRepository, Session } from "../../shared/ports/index.js";

export function createSessionRepository(handle: DatabaseHandle): SessionRepository {
  return {
    async get(chatId) {
      const row = (await handle.db.get("SELECT * FROM sessions WHERE chat_id = $1", [chatId])) as {
        chat_id: string; history: string | null; quote_state: string | null;
        consent_parent_at: number | null; updated_at: number | null;
      } | undefined;
      if (!row) return null;
      return {
        chatId: row.chat_id,
        history: JSON.parse(row.history ?? "[]"),
        quoteState: JSON.parse(row.quote_state ?? "{}"),
        consentParentAt: row.consent_parent_at ?? null,
        updatedAt: row.updated_at ?? 0,
      } as Session;
    },
    async save(s) {
      await handle.db.run(
        "INSERT INTO sessions (chat_id, history, quote_state, consent_parent_at, updated_at) VALUES ($1,$2,$3,$4,$5) " +
        "ON CONFLICT(chat_id) DO UPDATE SET history=excluded.history, quote_state=excluded.quote_state, consent_parent_at=excluded.consent_parent_at, updated_at=excluded.updated_at",
        [s.chatId, JSON.stringify(s.history), JSON.stringify(s.quoteState), s.consentParentAt, s.updatedAt],
      );
    },
    async markProcessed(updateId) {
      const r = await handle.db.run(
        "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
        [updateId, Date.now()],
      );
      return r.rowCount > 0;
    },
  };
}
```

- [ ] **Paso 2: Reescribir `tests/unit/session.repository.spec.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

describe("SessionRepository", () => {
  it("save + get redondo", async () => {
    const h = createDatabase(TEST_DB_URL);
    const repo = createSessionRepository(h);
    const chatId = randomUUID();
    await repo.save({ chatId, history: [{ role: "user", content: "h" }], quoteState: { step: 1 }, consentParentAt: null, updatedAt: Date.now() });
    const s = await repo.get(chatId);
    expect(s?.history[0].content).toBe("h");
    expect(s?.quoteState.step).toBe(1);
  });
  it("markProcessed true la 1ra vez, false la 2da", async () => {
    const h = createDatabase(TEST_DB_URL);
    const repo = createSessionRepository(h);
    const updateId = Math.floor(Math.random() * 1_000_000_000);
    expect(await repo.markProcessed(updateId)).toBe(true);
    expect(await repo.markProcessed(updateId)).toBe(false);
  });
});
```

- [ ] **Paso 3: Actualizar `tests/unit/session.manager.spec.ts`**

Reemplazar `createDatabase(":memory:")` por `createDatabase(TEST_DB_URL)` y los `chat_id` literales (`"c1"`) por `randomUUID()`, para evitar colisiones entre tests que corren en paralelo contra la misma rama Postgres:

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

describe("SessionManager", () => {
  it("appendTurn + setQuoteState mantienen estado separado", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    const chatId = randomUUID();
    await sm.setQuoteState(chatId, { step: 2, edadPadre: 30 });
    await sm.appendTurn(chatId, "user", "hola");
    const s = await sm.load(chatId);
    expect(s?.quoteState.step).toBe(2);
    expect(s?.history[0].content).toBe("hola");
  });
  it("poda history pero NO quoteState", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 50 });
    const chatId = randomUUID();
    await sm.setQuoteState(chatId, { step: 1 });
    for (let i = 0; i < 20; i++) await sm.appendTurn(chatId, "user", "mensaje largo ".repeat(5));
    const s = await sm.load(chatId);
    expect(s?.history.length).toBeLessThan(20);
    expect(s?.quoteState.step).toBe(1);
  });
  it("setConsent marca consentParentAt", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const s = await sm.load(chatId);
    expect(s?.consentParentAt).not.toBeNull();
  });
});
```

- [ ] **Paso 4: Actualizar `tests/e2e/flows.spec.ts`**

Mismo tratamiento: `":memory:"` → `TEST_DB_URL`, `"chat-x"`/`"chat-y"`/`"chat-z"` → `randomUUID()`:

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import { buildToolsForState } from "../../src/conversation/router.js";
import { makeCalculateQuoteTool, makeGetProductInfoTool } from "../../src/brain/tools/index.js";
import tariffs from "../../src/domain/quote/tariffs.example.json" with { type: "json" };

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

// E2E: flujo consent + cotización contra la rama Postgres de test (sin red de Telegram/LLM).
describe("e2e: wizard + quote", () => {
  it("flujo consent + cotización produce prima", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const r = engine.calculate({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 });
    expect(r.primaMensual).toBeGreaterThan(0);
    const s = await sm.load(chatId);
    expect(s?.consentParentAt).not.toBeNull();
  });

  it("sin consentimiento, calculateQuote NO está disponible para el LLM", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.appendTurn(chatId, "user", "hola"); // crea sesión con consentParentAt: null
    const session = (await sm.load(chatId))!;
    const tools = buildToolsForState(session, [makeCalculateQuoteTool(engine), makeGetProductInfoTool()]);
    expect(tools.find((t) => t.name === "calculateQuote")).toBeUndefined();
    expect(tools.find((t) => t.name === "getProductInfo")).toBeDefined();
  });

  it("con consentimiento, calculateQuote SÍ está disponible", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const session = (await sm.load(chatId))!;
    const tools = buildToolsForState(session, [makeCalculateQuoteTool(engine), makeGetProductInfoTool()]);
    expect(tools.find((t) => t.name === "calculateQuote")).toBeDefined();
  });
});
```

- [ ] **Paso 5: Correr los tests afectados**

```bash
npx vitest run tests/unit/session.repository.spec.ts tests/unit/session.manager.spec.ts tests/e2e/flows.spec.ts
```

Expected: todos en verde (8 tests en total entre los tres archivos).

- [ ] **Paso 6: Commit**

```bash
git add src/persistence/repositories/session.repository.ts tests/unit/session.repository.spec.ts tests/unit/session.manager.spec.ts tests/e2e/flows.spec.ts
git commit -m "feat(persistence): SessionRepository a sintaxis Postgres (\$n placeholders)"
```

---

### Task 4: RAG a full-text search de Postgres

**Files:**
- Modify: `src/domain/knowledge/rag.ts` (reescritura completa, incluyendo renombrar `createFtsKnowledge` → `createPgKnowledge`)
- Create: `scripts/seed-knowledge.ts`
- Modify: `tests/unit/rag.spec.ts` (reescritura completa)

**Interfaces:**
- Consumes: `DatabaseHandle` (Tarea 2).
- Produces: `createPgKnowledge(handle: DatabaseHandle): KnowledgeRepository` (mismo contrato `KnowledgeRepository` de `src/shared/ports/index.ts`, sin cambios), consumido por `composition.ts` en la Tarea 6.

- [ ] **Paso 1: Reescribir `src/domain/knowledge/rag.ts`**

FTS5 (SQLite) no existe en Postgres — se reemplaza por `tsvector`/`websearch_to_tsquery`/`ts_rank`, ya indexado por el GIN de `scripts/db-setup.ts` (Tarea 2). `websearch_to_tsquery` acepta texto libre de usuarios sin tirar errores de sintaxis (a diferencia de `to_tsquery`), así que ya no hace falta la función `sanitizeFts5Query` que existía para blindar contra comillas/guiones/paréntesis — Postgres lo resuelve nativamente.

El chunking por sección markdown y el seed de contenido se separan del `retrieve()`: antes, `createFtsKnowledge` releía y reinsertaba los `.md` en cada llamada (barato en SQLite con un proceso persistente); en serverless eso correría en cada invocación fría, agregando latencia innecesaria a cada mensaje. El seed pasa a `scripts/seed-knowledge.ts`, corrido una vez por deploy, no en el hot path.

```typescript
import type { KnowledgeRepository } from "../../shared/ports/index.js";
import type { DatabaseHandle } from "../../persistence/db.js";

// RAG Fase 1: full-text search nativo de Postgres (tsvector + índice GIN), cero
// dependencias externas. El seed de contenido corre en scripts/seed-knowledge.ts,
// no acá — ver ese archivo para el chunking por sección markdown.
export function createPgKnowledge(handle: DatabaseHandle): KnowledgeRepository {
  return {
    async retrieve(query, k) {
      if (!query.trim()) return [];
      const rows = (await handle.db.all(
        `SELECT id, source, text FROM knowledge
         WHERE to_tsvector('spanish', text) @@ websearch_to_tsquery('spanish', $1)
         ORDER BY ts_rank(to_tsvector('spanish', text), websearch_to_tsquery('spanish', $1)) DESC
         LIMIT $2`,
        [query, k],
      )) as { id: string; source: string; text: string }[];
      return rows.map((r) => ({ id: r.id, source: r.source, text: r.text }));
    },
  };
}
```

- [ ] **Paso 2: Crear `scripts/seed-knowledge.ts`**

Reutiliza exactamente la misma lógica de chunking (por líneas que empiezan con `#`) que tenía `rag.ts` antes, ahora apuntada a insertar en Postgres. `ON CONFLICT (id) DO UPDATE` (no `DO NOTHING`) para que re-correr el seed después de editar un `.md` actualice el contenido en vez de dejarlo desactualizado.

```typescript
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..", "src", "domain", "knowledge");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está seteada");
  const sql = neon(url);

  for (const file of readdirSync(docsDir)) {
    if (!file.endsWith(".md")) continue;
    const src = join(docsDir, file);
    const content = readFileSync(src, "utf-8");
    let section = "";
    let title = file;

    const insert = async (text: string) => {
      const id = `${file}:${title}`;
      await sql`INSERT INTO knowledge (id, source, text) VALUES (${id}, ${src}, ${text.trim()})
                 ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`;
    };

    for (const line of content.split("\n")) {
      if (line.startsWith("#")) {
        if (section) await insert(section);
        title = line;
        section = "";
      }
      section += line + "\n";
    }
    if (section) await insert(section);
  }
  console.log("Knowledge base sembrada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Agregar a `package.json`:

```json
"db:seed": "tsx scripts/seed-knowledge.ts"
```

Correr contra `dev`:

```bash
npm run db:seed
```

Expected: `Knowledge base sembrada.`

- [ ] **Paso 3: Reescribir `tests/unit/rag.spec.ts`**

En vez de depender de los `.md` reales del producto (acopla el test al contenido, no a la lógica), el test inserta sus propios chunks de prueba directamente.

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createDatabase, type DatabaseHandle } from "../../src/persistence/db.js";
import { createPgKnowledge } from "../../src/domain/knowledge/rag.js";

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

async function insertChunk(id: string, source: string, text: string) {
  const sql = neon(TEST_DB_URL);
  await sql`INSERT INTO knowledge (id, source, text) VALUES (${id}, ${source}, ${text})
             ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`;
}

describe("PG knowledge (full-text search)", () => {
  it("recupera chunks por query", async () => {
    const id = randomUUID();
    await insertChunk(id, "test.md", "Para cotizar escribí quiero cotizar y el bot te guía.");
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const kb = createPgKnowledge(h);
    const chunks = await kb.retrieve("cotizar", 3);
    expect(chunks.some((c) => c.id === id)).toBe(true);
  });

  it("no revienta con texto libre (guiones, comillas, paréntesis, dos puntos)", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const kb = createPgKnowledge(h);
    for (const q of ["10-20 años", "edad: 25", "cobertura (niño)", '¿me ayudás con un "seguro"?', "   ", "!!!"]) {
      const chunks = await kb.retrieve(q, 3);
      expect(Array.isArray(chunks)).toBe(true);
    }
  });
});
```

- [ ] **Paso 4: Correr los tests**

```bash
npx vitest run tests/unit/rag.spec.ts
```

Expected: `2 passed`.

- [ ] **Paso 5: Commit**

```bash
git add package.json src/domain/knowledge/rag.ts scripts/seed-knowledge.ts tests/unit/rag.spec.ts
git commit -m "feat(knowledge): RAG a full-text search de Postgres (reemplaza FTS5 de SQLite)"
```

---

### Task 5: Persistencia del wizard (`/cotizar`)

**Files:**
- Create: `src/conversation/conversation.storage.ts`

**Interfaces:**
- Consumes: `DatabaseHandle` (Tarea 2), tipo `ConversationKeyStorage` de `@grammyjs/conversations`.
- Produces: `createPgConversationStorage(handle: DatabaseHandle): ConversationKeyStorage<Context, ConversationData>`, consumido por `composition.ts` en la Tarea 6 al llamar `conversations({ storage: ... })`.

Este es el cambio más importante de todo el plan (ver spec): sin esto, el wizard `/cotizar` pierde su estado entre mensajes en producción serverless, porque `@grammyjs/conversations` por defecto guarda en memoria del proceso.

- [ ] **Paso 1: Crear `src/conversation/conversation.storage.ts`**

```typescript
import type { Context } from "grammy";
import type { ConversationKeyStorage } from "@grammyjs/conversations";
import type { DatabaseHandle } from "../persistence/db.js";

export function createPgConversationStorage(handle: DatabaseHandle): ConversationKeyStorage<Context, unknown> {
  return {
    type: "key",
    adapter: {
      async read(key) {
        const row = (await handle.db.get("SELECT state FROM bot_conversations WHERE key = $1", [key])) as
          | { state: string }
          | undefined;
        return row ? JSON.parse(row.state) : undefined;
      },
      async write(key, state) {
        await handle.db.run(
          "INSERT INTO bot_conversations (key, state, updated_at) VALUES ($1,$2,$3) " +
          "ON CONFLICT (key) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at",
          [key, JSON.stringify(state), Date.now()],
        );
      },
      async delete(key) {
        await handle.db.run("DELETE FROM bot_conversations WHERE key = $1", [key]);
      },
    },
  };
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
npx tsc --noEmit src/conversation/conversation.storage.ts 2>&1 | head -30
```

Expected: puede marcar errores de módulos no resueltos por compilar un archivo aislado (normal, `tsc --noEmit` de un solo archivo no resuelve todo el proyecto) — lo que importa es que no haya errores de tipos en `ConversationKeyStorage` (forma del objeto retornado). Se valida de forma completa junto con el resto del proyecto en la Tarea 6 (`npm run typecheck`).

- [ ] **Paso 3: Commit**

```bash
git add src/conversation/conversation.storage.ts
git commit -m "feat(conversation): storage de Postgres para @grammyjs/conversations (wizard sobrevive entre invocaciones)"
```

---

### Task 6: Composition root compartido y limpieza (Railway, http.server, métricas)

**Files:**
- Create: `src/composition.ts`
- Modify: `src/index.ts` (reescritura completa, mucho más corto)
- Delete: `src/infra/http.server.ts`
- Modify: `package.json` (quitar `prom-client`)

**Interfaces:**
- Consumes: todos los módulos ya migrados (Tareas 2-5).
- Produces: `buildBot(cfg: Config): Promise<{ bot: Bot; db: DatabaseHandle }>`, consumido por `src/index.ts` (polling) y por `netlify/functions/telegram.mts` (Tarea 7).

- [ ] **Paso 1: Crear `src/composition.ts`**

Extrae todo el armado de dependencias que hoy vive en `src/index.ts` (líneas 32-121 del archivo actual), sacando la parte de arranque (`start()`, servidor HTTP, shutdown) que se queda en `index.ts`. Cambios respecto al original: `createFtsKnowledge(db, knowledgeDir)` → `createPgKnowledge(db)` (ya no necesita `docsDir`, el seed es un script aparte); se agrega `storage: createPgConversationStorage(db)` a `conversations()`.

```typescript
import { Bot } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { Config } from "./shared/ports/index.js";
import { createLogger, withConversation } from "./infra/logger.js";
import { createDatabase, type DatabaseHandle } from "./persistence/db.js";
import { createSessionRepository } from "./persistence/repositories/session.repository.js";
import { createSessionManager } from "./conversation/session.manager.js";
import { createQuoteEngine } from "./domain/quote/QuoteEngine.js";
import tariffs from "./domain/quote/tariffs.example.json" with { type: "json" };
import { createPgKnowledge } from "./domain/knowledge/rag.js";
import { createPromptManager } from "./brain/prompt.manager.js";
import { createGroqProvider } from "./brain/providers/groq.provider.js";
import { createGlmProvider } from "./brain/providers/glm.provider.js";
import { createCostGuard } from "./brain/cost.guard.js";
import {
  makeCalculateQuoteTool,
  makeLookupKnowledgeTool,
  makeGetProductInfoTool,
  makeEscalateToHumanTool,
  runToolLoop,
} from "./brain/tools/index.js";
import { buildToolsForState, buildMessages } from "./conversation/router.js";
import { makeQuoteConversation } from "./conversation/conversations/quote.js";
import { createPgConversationStorage } from "./conversation/conversation.storage.js";
import { scrubPII } from "./brain/guardrails/input.js";
import { checkOutput } from "./brain/guardrails/output.js";
import { detectDistress } from "./brain/guardrails/distress.js";
import { createTelegramChannel, createRateLimiter } from "./channels/telegram.channel.js";

export interface BuiltBot {
  bot: Bot;
  db: DatabaseHandle;
}

export async function buildBot(cfg: Config): Promise<BuiltBot> {
  const logger = createLogger(cfg.logLevel);
  const db = createDatabase(cfg.databaseUrl);
  const sessionRepo = createSessionRepository(db);
  const sm = createSessionManager(sessionRepo, { maxContextTokens: 6000 });
  const engine = createQuoteEngine(tariffs as never);

  const kb = createPgKnowledge(db);
  const pm = createPromptManager({ version: cfg.promptVersion, ab: cfg.promptAb });
  const llm = cfg.llmProvider === "groq"
    ? createGroqProvider({ apiKey: cfg.groqApiKey ?? "" })
    : createGlmProvider({ apiKey: cfg.glmApiKey ?? "" });
  // Precio real de Groq llama-3.3-70b-versatile: $0.59 / $0.79 por millón de tokens.
  const cost = createCostGuard({ budgetUsd: cfg.llmDailyBudgetUsd, pricePer1k: { input: 0.00059, output: 0.00079 } });
  const limiter = createRateLimiter({ msgsPerMin: 20, quotesPerHour: 10, globalQuotesPerMin: 5 });
  const { bot, channel } = createTelegramChannel({
    token: cfg.telegramBotToken,
    secret: cfg.telegramWebhookSecret,
    allowlist: cfg.telegramAllowlist,
    repo: sessionRepo,
    limiter,
  });

  const allTools = [
    makeCalculateQuoteTool(engine, limiter),
    makeLookupKnowledgeTool(kb),
    makeGetProductInfoTool(),
    makeEscalateToHumanTool(),
  ];

  bot.use(conversations({ storage: createPgConversationStorage(db) }) as never);
  bot.use(createConversation(makeQuoteConversation(sm, engine, limiter) as never, "quote") as never);

  bot.command("cotizar", async (ctx) => {
    await (ctx as never as { conversation: { enter: (n: string) => Promise<void> } }).conversation.enter("quote");
  });

  bot.on("message:text", async (ctx) => {
    const normalized = channel.normalizeIn(ctx.update);
    if (!normalized) return;
    const { chatId, text, updateId } = normalized;

    if (!(await sessionRepo.markProcessed(updateId))) return;
    if (!limiter.allowMessage(chatId)) {
      await channel.send(chatId, "Demasiados mensajes, espera un momento.");
      return;
    }

    await withConversation(chatId, async () => {
      await sm.appendTurn(chatId, "user", scrubPII(text));

      if (detectDistress(text)) {
        await channel.send(chatId, "Si es una emergencia, contactá a un asesor humano. Derivando.");
        return;
      }
      if (cost.isOpen()) {
        await channel.send(chatId, "Servicio temporalmente saturado, te derivamos a un humano.");
        return;
      }

      const session = await sm.load(chatId);
      if (!session) return;
      const { system } = pm.get();
      const rag = await kb.retrieve(text, 3);
      const messages = buildMessages(session, system, rag);
      const tools = buildToolsForState(session, allTools);
      const result = await runToolLoop({
        provider: llm,
        tools,
        messages,
        ctx: { chatId } as never,
        maxRounds: 3,
      });
      cost.add(result.usage);

      let reply = result.finalResponse ?? "No tengo respuesta para eso. ¿Querés que te derive a un humano?";
      const out = checkOutput(reply);
      if (!out.ok) reply = "No puedo responder eso. ¿Te derivo a un asesor?";
      await sm.appendTurn(chatId, "assistant", reply);
      await channel.send(chatId, reply);
    });
  });

  logger.info("bot compuesto", { provider: cfg.llmProvider, env: cfg.nodeEnv });
  return { bot, db };
}
```

- [ ] **Paso 2: Reescribir `src/index.ts`**

Se elimina la rama de webhook/Railway (`RAILWAY_PUBLIC_DOMAIN`) y el servidor HTTP — en producción, el webhook lo maneja `netlify/functions/telegram.mts` (Tarea 7), no este proceso. `index.ts` queda solo para polling (uso local/dev, o un VPS propio si el usuario elige esa vía más adelante).

```typescript
import "dotenv/config";
import { parseConfig } from "./infra/config.js";
import { buildBot } from "./composition.js";

async function main() {
  const cfg = parseConfig(process.env);
  const { bot, db } = await buildBot(cfg);

  await bot.init();
  bot.start();

  const shutdown = () => {
    bot.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Paso 3: Eliminar `src/infra/http.server.ts` y la dependencia `prom-client`**

```bash
rm src/infra/http.server.ts
npm uninstall prom-client
```

- [ ] **Paso 4: Typecheck completo**

```bash
npm run typecheck
```

Expected: `0 errores`. Si aparece un error de tipos en `conversations({ storage: ... })`, revisar que `ConversationKeyStorage<Context, unknown>` de la Tarea 5 sea compatible con lo que `conversations()` espera — puede necesitar un cast `as never` puntual siguiendo el patrón ya usado en el resto de este archivo para las interacciones con grammY.

- [ ] **Paso 5: Correr toda la suite**

```bash
npm test
```

Expected: todos los tests pasan (los que tocan DB, contra la rama `test` de Neon).

- [ ] **Paso 6: Smoke test manual en polling**

```bash
npm run dev
```

Esperar el log `"bot compuesto"` y `"bot iniciado"` (o el que quede tras el cambio), sin errores. Escribirle al bot en Telegram y probar `/cotizar` de punta a punta (las 4 preguntas del wizard) — confirma que la persistencia del wizard en Postgres (Tarea 5) funciona igual que antes en memoria. Detener con Ctrl+C.

- [ ] **Paso 7: Commit**

```bash
git add src/composition.ts src/index.ts package.json package-lock.json
git rm src/infra/http.server.ts
git commit -m "refactor: extrae composition root compartido, quita Railway/http-server/métricas"
```

---

### Task 7: Netlify Functions (webhook de producción)

**Files:**
- Create: `netlify/functions/telegram.mts`
- Create: `netlify/functions/health.mts`
- Create: `netlify.toml`
- Create: `public/index.html`
- Modify: `.gitignore` (agregar `.netlify`)
- Modify: `package.json` (agregar `@netlify/functions` como devDependency)

**Interfaces:**
- Consumes: `buildBot()` de `src/composition.ts` (Tarea 6), `parseConfig` de `src/infra/config.ts`.
- Produces: dos endpoints HTTP en producción: `/telegram` (webhook) y `/health`.

Confirmado contra la documentación oficial de Netlify (vía su MCP): el formato vigente de Netlify Functions es v2, con archivos `.mts` y firma `(req: Request, context: Context) => Response` — no el formato clásico estilo AWS Lambda. grammY no tiene un adaptador `"netlify"` propio, pero su adaptador `"std/http"` tiene exactamente esa firma.

- [ ] **Paso 1: Instalar tipos de Netlify**

```bash
npm install --save-dev @netlify/functions
```

- [ ] **Paso 2: Crear `netlify/functions/telegram.mts`**

La inicialización (armar el bot, memoizada en `callbackPromise`) queda envuelta en `getCallback()` — se reutiliza entre invocaciones dentro del mismo contenedor "caliente" de Netlify, pero sin ejecutar lógica a nivel de módulo fuera de una función.

```typescript
import type { Context, Config } from "@netlify/functions";
import { webhookCallback } from "grammy";
import { parseConfig } from "../../src/infra/config.js";
import { buildBot } from "../../src/composition.js";

let callbackPromise: Promise<(req: Request) => Promise<Response>> | undefined;

function getCallback() {
  if (!callbackPromise) {
    const cfg = parseConfig(process.env);
    callbackPromise = buildBot(cfg).then(async ({ bot }) => {
      await bot.init();
      return webhookCallback(bot, "std/http", { secretToken: cfg.telegramWebhookSecret });
    });
  }
  return callbackPromise;
}

export default async (req: Request, context: Context) => {
  const cb = await getCallback();
  return cb(req);
};

export const config: Config = {
  path: "/telegram",
};
```

- [ ] **Paso 3: Crear `netlify/functions/health.mts`**

```typescript
import type { Context, Config } from "@netlify/functions";
import { parseConfig } from "../../src/infra/config.js";
import { createDatabase } from "../../src/persistence/db.js";

export default async (req: Request, context: Context) => {
  try {
    const cfg = parseConfig(process.env);
    const db = createDatabase(cfg.databaseUrl);
    await db.db.get("SELECT 1", []);
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("db-down", { status: 500 });
  }
};

export const config: Config = {
  path: "/health",
};
```

- [ ] **Paso 4: Crear `netlify.toml`**

```toml
[build]
  publish = "public"

[functions]
  node_bundler = "esbuild"
```

- [ ] **Paso 5: Crear `public/index.html`**

Netlify necesita un directorio `publish` aunque el sitio sea solo funciones (no hay frontend).

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>ChatBotSeguros</title></head>
<body>
  <p>Este sitio expone únicamente funciones serverless de un bot de Telegram. No hay contenido público.</p>
</body>
</html>
```

- [ ] **Paso 6: Actualizar `.gitignore`**

Agregar la línea `.netlify` (carpeta de caché/estado local de la CLI de Netlify, no es código de usuario).

- [ ] **Paso 7: Typecheck**

```bash
npm run typecheck
```

Expected: `0 errores`. Los archivos `.mts` bajo `netlify/functions/` quedan cubiertos por `tsconfig.json` (su `include` ya cubre todo el repo salvo lo excluido explícitamente); si `tsc` se queja de no encontrar `@netlify/functions`, confirmar que el Paso 1 instaló el paquete correctamente.

- [ ] **Paso 8: Commit**

```bash
git add netlify/functions/telegram.mts netlify/functions/health.mts netlify.toml public/index.html .gitignore package.json package-lock.json
git commit -m "feat(netlify): funciones serverless para webhook de Telegram y health check"
```

---

### Task 8: Deploy a Netlify

**Files:** ninguno (tarea operativa; usa las herramientas MCP de Netlify ya conectadas en este entorno).

**Interfaces:**
- Consumes: el repo con todos los cambios de las Tareas 1-7 ya pusheados a GitHub.
- Produces: un sitio de Netlify en producción, sirviendo `/telegram` y `/health`, con el webhook de Telegram apuntando ahí.

- [ ] **Paso 1: Pushear la rama con todos los cambios a GitHub**

```bash
git push origin <nombre-de-la-rama>
```

- [ ] **Paso 2: Crear el sitio en Netlify**

Usar la herramienta `netlify-project-services-updater` con `operation: "create-new-project"`, `teamSlug: "bukoflowpanama"`, `name: "chatbot-seguros"` (o el nombre disponible más parecido si ya existe).

- [ ] **Paso 3: Conectar el sitio al repo de GitHub**

Esto requiere autorización desde el dashboard de Netlify (Site settings → Build & deploy → Link repository) — es un paso que el usuario debe confirmar manualmente en el navegador, ya que involucra dar permisos de OAuth entre Netlify y GitHub.

- [ ] **Paso 4: Configurar las variables de entorno del sitio**

Usar `netlify-project-services-updater` con `operation: "manage-env-vars"` para cada variable (una llamada por variable, `upsertEnvVar: true`, `newVarContext: "production"`):

- `TELEGRAM_BOT_TOKEN` (el mismo valor que ya está en `.env` local)
- `TELEGRAM_WEBHOOK_SECRET` (generar un valor random nuevo, ej. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `GROQ_API_KEY` (mismo valor que en `.env` local)
- `LLM_PROVIDER=groq`
- `DATABASE_URL` (el connection string de la rama **production** de Neon, guardado en la Tarea 1, Paso 2 — NO el de `dev`)
- `NODE_ENV=production`
- `LLM_DAILY_BUDGET_USD=5`
- `PROMPT_VERSION=v1`
- `PROMPT_AB=control`

- [ ] **Paso 5: Crear las tablas en la rama `production` de Neon**

```bash
DATABASE_URL="<connection string de production>" npm run db:setup
DATABASE_URL="<connection string de production>" npm run db:seed
```

- [ ] **Paso 6: Deployar**

Usar `netlify-deploy-services-updater` con `operation: "deploy-site"`, pasando el `siteId` obtenido en el Paso 2.

- [ ] **Paso 7: Verificar el health check**

```bash
curl -s https://<nombre-del-sitio>.netlify.app/health
```

Expected: `ok`

- [ ] **Paso 8: Configurar el webhook de Telegram**

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<nombre-del-sitio>.netlify.app/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`

- [ ] **Paso 9: Smoke test end-to-end**

Escribirle al bot en Telegram (mensaje libre + `/cotizar` completo). Confirmar que responde y que el wizard completa las 4 preguntas sin perder el estado (validación real de la Tarea 5 en producción, no solo en polling local).

Revisar los logs de la función en el dashboard de Netlify (Functions → telegram → Logs) si algo falla.

---

### Task 9: Limpieza de dependencias y actualización de documentación

**Files:**
- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `INSTALL.md`
- Modify: `README.md`

**Interfaces:** ninguna — esta tarea no cambia comportamiento, solo documentación y config de un camino de despliegue alternativo (Docker/VPS en polling) que se mantiene disponible.

- [ ] **Paso 1: Actualizar `Dockerfile`**

Ya no hay servidor HTTP (Tarea 6 lo eliminó), así que no hace falta `EXPOSE 3000`. El proceso sigue siendo válido como forma alternativa de correr el bot en polling en un VPS propio (documentado en la conversación con el usuario como opción a $0).

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

- [ ] **Paso 2: Actualizar `.env.example`**

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_ALLOWLIST=        # chat_ids separados por coma; vacío = sin allowlist en dev
LLM_PROVIDER=groq          # groq | glm
GROQ_API_KEY=
GLM_API_KEY=
DATABASE_URL=              # connection string de Postgres (Neon), ver INSTALL.md
LLM_DAILY_BUDGET_USD=5
LLM_PROVIDER_RESIDENT_ONLY=false
PROMPT_VERSION=v1
PROMPT_AB=control
LOG_LEVEL=info
NODE_ENV=development
PORT=3000
```

- [ ] **Paso 3: Actualizar `INSTALL.md`**

Reemplazar las secciones que mencionan SQLite/Railway/`/health`/`/metrics` por las instrucciones de Neon + Netlify. Reescribir el archivo completo:

```markdown
# Instalación — ChatBotSeguros

## Requisitos

- Node.js 20 o superior
- Un bot de Telegram (token vía [@BotFather](https://t.me/BotFather))
- Una API key de [Groq](https://console.groq.com) (proveedor por defecto) o de GLM/Zhipu
- Un proyecto de [Neon](https://neon.tech) (Postgres gratuito) — ver `docs/superpowers/plans/2026-07-16-netlify-neon-migration.md`, Tarea 1, para el setup paso a paso (incluye crear las ramas `dev`/`test`/`production`)

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
| `PORT` | No (default `3000`) | Sin uso desde que se quitó el servidor HTTP propio (ver migración a Netlify) |

## 3. Crear las tablas en Neon (una vez por rama)

```bash
npm run db:setup
npm run db:seed
```

## 4. Correr en desarrollo (polling, sin webhook)

```bash
npm run dev
```

Buscá el bot en Telegram (por el username configurado en @BotFather) y probá `/cotizar`
o escribile directamente.

## 5. Tests y typecheck

```bash
npm run typecheck   # 0 errores esperado
npm test            # suite completa (unit + contract + e2e), contra la rama `test` de Neon
```

## 6. Producción (Netlify)

El bot se despliega como funciones serverless en Netlify (`netlify/functions/`), no como
proceso persistente. Ver `docs/superpowers/plans/2026-07-16-netlify-neon-migration.md`,
Tarea 8, para los pasos completos de deploy.

## 7. Alternativa: Docker / VPS propio (polling, sin Netlify)

```bash
docker compose up --build
```

Corre el bot en modo polling dentro de un contenedor — sirve como alternativa a Netlify
si preferís un VPS propio en vez de serverless. Necesita las mismas variables de entorno
de `.env`, apuntando `DATABASE_URL` a Neon igual que en desarrollo.

## Notas

- `docs/errors-learned.md` documenta la deuda técnica pendiente antes de manejar
  datos personales reales (PII) de menores/padres: gates de ARCO/KYC, entre otros.
- El rate limiter (mensajes/cotizaciones por hora) vive en memoria del proceso — en
  Netlify, cada invocación fría tiene su propio contador, así que el límite es "mejor
  esfuerzo" en vez de exacto en producción (decisión documentada en el spec de esta
  migración).
```

- [ ] **Paso 4: Actualizar `README.md`**

```markdown
# ChatBotSeguros

Chatbot conversacional de **seguro educacional infantil** (cobertura de educación de los hijos si los padres fallecen).

## Estado

MVP funcional. Desarrollo local en polling (SQLite reemplazado por Neon/Postgres);
producción en Netlify Functions (webhook serverless).

## Documentación

- Spec de diseño original: [`docs/superpowers/specs/2026-07-15-chatbot-seguros-design.md`](docs/superpowers/specs/2026-07-15-chatbot-seguros-design.md)
- Plan de implementación del MVP (23 tareas TDD): [`docs/superpowers/plans/2026-07-15-chatbot-seguros-mvp.md`](docs/superpowers/plans/2026-07-15-chatbot-seguros-mvp.md)
- Spec de la migración a Netlify + Neon: [`docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md`](docs/superpowers/specs/2026-07-16-netlify-neon-migration-design.md)
- Plan de la migración a Netlify + Neon: [`docs/superpowers/plans/2026-07-16-netlify-neon-migration.md`](docs/superpowers/plans/2026-07-16-netlify-neon-migration.md)
- Instalación: [`INSTALL.md`](INSTALL.md)

## Stack

Node 20 + TypeScript + grammY + Groq/GLM + Neon (Postgres) vía Drizzle + Zod + vitest + pino.
Producción: Netlify Functions (webhook). Desarrollo local: polling.
```

- [ ] **Paso 5: Commit**

```bash
git add Dockerfile .env.example INSTALL.md README.md
git commit -m "docs: actualiza documentación para Netlify + Neon (reemplaza Railway + SQLite)"
```

---

## Self-Review (hecho por quien escribió este plan)

- **Cobertura del spec:** las 6 filas de la tabla "Componentes afectados" del spec están cubiertas (schema.ts/db.ts → Tarea 2, session.repository.ts → Tarea 3, rag.ts → Tarea 4, conversations() storage → Tarea 5, index.ts/http.server.ts/metrics → Tarea 6, netlify/functions → Tarea 7). El flujo de datos y los casos borde del spec (idempotencia, cold start, secret del webhook) quedan verificados en la Tarea 8 (smoke test end-to-end). Testing (rama Neon dedicada) resuelto en la Tarea 1 + estrategia de `chat_id` único en el Global Constraints.
- **Correcciones sobre la marcha:** el spec fue corregido dos veces durante la escritura de este plan (adaptador de grammY: ni `"netlify"` ni `"aws-lambda-async"`, sino `"std/http"` con formato Netlify Functions v2 — confirmado contra el MCP oficial de Netlify; driver de Neon: `@neondatabase/serverless` HTTP, no `postgres-js` TCP — confirmado contra los tipos instalados).
- **Nombres consistentes entre tareas:** `createPgKnowledge` (Tarea 4) es el nombre usado en `composition.ts` (Tarea 6) — verificado. `createPgConversationStorage` (Tarea 5) es el nombre usado en `composition.ts` (Tarea 6) — verificado. `DatabaseHandle` (Tarea 2) es el tipo consumido sin cambios de forma por Tareas 3, 4, 5, 6, 7.
