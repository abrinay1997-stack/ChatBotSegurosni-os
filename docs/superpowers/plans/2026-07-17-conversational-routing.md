# Ruteo conversacional por intención + Juancito Ads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el wizard rígido de `/cotizar` por conversación libre guiada por el LLM (sin gate de consentimiento de cara al cliente), con dos herramientas nuevas (`showPlans`, `recommendPlan`), contenido real de un seguro escolar rebrandeado como "Juancito Ads", y un prompt de sistema con tono cálido y asertivo.

**Architecture:** Se elimina `@grammyjs/conversations` y toda su infraestructura (tabla `bot_conversations`, storage adapter). `/cotizar` pasa a ser un atajo que inyecta texto al mismo handler de chat libre. El LLM decide qué herramienta usar según lo que el cliente exprese, guiado por el prompt reescrito; `calculateQuote` mantiene su fórmula paramétrica pero ahora etiqueta el resultado con un Plan A/B/C.

**Tech Stack:** TypeScript, grammY (sin el plugin de conversations), Zod, vitest.

## Global Constraints

- Se elimina el gate de consentimiento parental de cara al cliente (decisión
  explícita del usuario, documentada como deuda de compliance en el spec).
  Se mantiene `sm.setConsent()` como registro interno silencioso — se llama
  automáticamente, no se pide ni se muestra al cliente.
- El motor de cotización paramétrico NO se reemplaza por precios fijos; se
  mantiene la fórmula existente y su resultado se etiqueta con un plan
  (A/B/C) según rangos de monto ya definidos en `tariffs.example.json`
  (`factorPorMonto`: 1000/50000/100000) — no se inventan rangos nuevos.
- El branding del demo es **"Juancito Ads"**, no SURA — no es un proyecto
  oficial ni autorizado por SURA.
- Los datos de contacto en el contenido de conocimiento son **ficticios**
  (mismo formato que los reales de SURA, valores inventados) — nunca los
  números/emails reales de atención al cliente de SURA.
- El contenido de coberturas/exclusiones se escribe parafraseado y resumido
  a partir de la información que dio el usuario — no se reproduce texto
  extenso verbatim de ninguna fuente.
- `calculateQuote` solo se llama con valores que el cliente mencionó
  explícitamente en la conversación — nunca con datos inventados o asumidos
  (instrucción reforzada tanto en la descripción de la herramienta como en
  el prompt de sistema).
- Cada tarea debe dejar `npm run typecheck` en 0 errores y `npm test` en
  verde antes de pasar a la siguiente.

---

### Task 1: Eliminar el wizard de `/cotizar`

**Files:**
- Delete: `src/conversation/conversations/quote.ts`
- Delete: `src/conversation/conversation.storage.ts`
- Modify: `src/persistence/schema.ts` (quitar tabla `botConversations`)
- Modify: `scripts/db-setup.ts` (quitar `CREATE TABLE bot_conversations`)
- Modify: `package.json` (quitar `@grammyjs/conversations` y `@grammyjs/stateless-question`)
- Modify: `src/composition.ts` (reescritura completa)

**Interfaces:**
- Consumes: nada nuevo — usa exactamente lo que `composition.ts` ya importaba antes (`createSessionRepository`, `createSessionManager`, `createQuoteEngine`, `createPgKnowledge`, `createPromptManager`, proveedores LLM, `createCostGuard`, tools existentes, `buildToolsForState`/`buildMessages`, guardrails, `createTelegramChannel`/`createRateLimiter`).
- Produces: `buildBot(cfg: Config): Promise<BuiltBot>` (misma firma de siempre — `BuiltBot = { bot: Bot; db: DatabaseHandle }`), y una función interna `handleText(chatId: string, text: string, updateId: number): Promise<void>` que las Tareas 4/5 no necesitan tocar directamente (solo agregan tools al array `allTools`).

- [ ] **Paso 1: Borrar los archivos del wizard**

```bash
rm src/conversation/conversations/quote.ts
rm src/conversation/conversation.storage.ts
```

- [ ] **Paso 2: Quitar la tabla `bot_conversations` del schema**

En `src/persistence/schema.ts`, borrar este bloque completo (queda al final del archivo):

```typescript
export const botConversations = pgTable("bot_conversations", {
  key: text("key").primaryKey(),
  state: text("state").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
```

- [ ] **Paso 3: Quitar la tabla del script de setup**

En `scripts/db-setup.ts`, borrar este bloque (va después de la creación del índice de `knowledge`):

```typescript
  await sql`CREATE TABLE IF NOT EXISTS bot_conversations (
    key TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;
```

(La tabla ya creada en Neon puede quedar huérfana sin problema — no hace falta un `DROP TABLE`, no la va a usar nadie más. Si se quiere prolijidad, se puede borrar a mano desde el dashboard de Neon, pero no es parte de este plan.)

- [ ] **Paso 4: Quitar las dependencias de `package.json`**

```bash
npm uninstall @grammyjs/conversations @grammyjs/stateless-question
```

- [ ] **Paso 5: Reescribir `src/composition.ts`**

```typescript
import { Bot } from "grammy";
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

  async function handleText(chatId: string, text: string, updateId: number) {
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
  }

  // /cotizar deja de ser un flujo aparte: inyecta el mismo texto que
  // escribiría un cliente en cualquier canal (incluido WhatsApp, donde no
  // hay comandos), y sigue exactamente el mismo camino que un mensaje
  // normal — respeta el allowlist vía channel.normalizeIn, igual que
  // cualquier otro update.
  bot.command("cotizar", async (ctx) => {
    const normalized = channel.normalizeIn(ctx.update);
    if (!normalized) return;
    await handleText(normalized.chatId, "Quiero cotizar un seguro.", normalized.updateId);
  });

  bot.on("message:text", async (ctx) => {
    const normalized = channel.normalizeIn(ctx.update);
    if (!normalized) return;
    await handleText(normalized.chatId, normalized.text, normalized.updateId);
  });

  logger.info("bot compuesto", { provider: cfg.llmProvider, env: cfg.nodeEnv });
  return { bot, db };
}
```

- [ ] **Paso 6: Typecheck**

```bash
npm run typecheck
```

Expected: van a fallar `tests/unit/router.spec.ts`, `tests/e2e/redteam.spec.ts` y `tests/e2e/flows.spec.ts` en la Tarea 2 (todavía prueban el gate de consentimiento que se saca ahí) — **eso es esperado en este punto**, no se arregla en esta tarea. Confirmá que el único lugar que rompe typecheck/tests en este momento es por esos archivos (si `composition.ts` en sí no compila, hay que revisar el paso 5).

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "refactor: elimina el wizard rígido de /cotizar (reemplazado por chat libre)"
```

---

### Task 2: Eliminar el gate de consentimiento

**Files:**
- Modify: `src/conversation/router.ts`
- Delete: `tests/e2e/redteam.spec.ts`
- Modify: `tests/unit/router.spec.ts`
- Modify: `tests/e2e/flows.spec.ts`

**Interfaces:**
- Consumes: `Session`, `Tool[]` (sin cambios de forma).
- Produces: `buildToolsForState(session: Session, allTools: Tool[]): Tool[]` sigue existiendo con la misma firma (para no tener que tocar `composition.ts` de nuevo), pero ahora siempre devuelve `allTools` sin filtrar.

- [ ] **Paso 1: Simplificar `buildToolsForState` en `src/conversation/router.ts`**

Reemplazar el archivo completo:

```typescript
import type { ChatMessage, Session, KnowledgeChunk } from "../shared/ports/index.js";
import type { Tool } from "../brain/tools/registry.js";

type Msg = ChatMessage & { content: string };

// Ya no hay tools gateadas por consentimiento (decisión de negocio: se saca
// el gate de cara al cliente, ver docs/superpowers/specs/2026-07-17-...).
// Se mantiene la firma de la función (session, allTools) para no tener que
// tocar composition.ts si en el futuro se necesita gatear algo de nuevo.
export function buildToolsForState(_session: Session, allTools: Tool[]): Tool[] {
  return allTools;
}

// Arma los mensajes para el LLM. El RAG va SIEMPRE en un mensaje user con
// delimitadores (===CONTEXTO===), NUNCA en el system prompt (anti-patrón del bot de referencia).
export function buildMessages(session: Session, system: string, ragChunks: KnowledgeChunk[]): Msg[] {
  const msgs: Msg[] = [{ role: "system", content: system }];
  const lastUser = session.history[session.history.length - 1];

  if (ragChunks.length && session.history.length && lastUser) {
    const ctx = ragChunks.map((c) => `--- ${c.source} ---\n${c.text}`).join("\n\n");
    msgs.push(...session.history.slice(0, -1).map((m) => ({ role: m.role as Msg["role"], content: m.content })));
    msgs.push({
      role: "user",
      content: `===CONTEXTO===\n${ctx}\n===FIN CONTEXTO===\n\nPregunta del usuario (último mensaje): ${lastUser.content}`,
    });
  } else {
    msgs.push(...session.history.map((m) => ({ role: m.role as Msg["role"], content: m.content })));
  }
  return msgs;
}
```

- [ ] **Paso 2: Borrar el test de red-team (invariante que ya no existe)**

```bash
rm tests/e2e/redteam.spec.ts
```

- [ ] **Paso 3: Actualizar `tests/unit/router.spec.ts`**

Reemplazar el archivo completo:

```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../../src/brain/tools/registry.js";
import { buildToolsForState, buildMessages } from "../../src/conversation/router.js";
import type { Session } from "../../src/shared/ports/index.js";

const calc = defineTool({ name: "calculateQuote", description: "", inputSchema: z.object({}), handler: async () => ({}) });
const faq = defineTool({ name: "getProductInfo", description: "", inputSchema: z.object({}), handler: async () => ({}) });

describe("router", () => {
  it("buildToolsForState devuelve siempre todas las tools (sin gate)", () => {
    const session = { consentParentAt: null } as unknown as Session;
    const tools = buildToolsForState(session, [calc, faq]);
    expect(tools.map((t) => t.name)).toContain("calculateQuote");
    expect(tools.map((t) => t.name)).toContain("getProductInfo");
  });
  it("buildMessages pone RAG en user msg con delimitadores, no en system", () => {
    const empty = { history: [], quoteState: {} } as unknown as Session;
    const msgs = buildMessages(empty, "SYSTEM", [{ id: "1", source: "faq", text: "cotiza" }]);
    const sys = msgs.find((m) => m.role === "system");
    expect(sys?.content).toBe("SYSTEM");
    const user = msgs.find((m) => m.role === "user");
    expect(user).toBeUndefined();

    const withQuery = { history: [{ role: "user", content: "pregunta" }], quoteState: {} } as unknown as Session;
    const msgs2 = buildMessages(withQuery, "SYSTEM", [{ id: "1", source: "faq", text: "info" }]);
    expect(msgs2.some((m) => m.content.includes("===CONTEXTO==="))).toBe(true);
  });
  it("con RAG e historial de varios turnos, mantiene orden cronológico (el turno actual va al final)", () => {
    const session = {
      history: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "hola, ¿en qué te ayudo?" },
        { role: "user", content: "pregunta actual" },
      ],
      quoteState: {},
    } as unknown as Session;
    const msgs = buildMessages(session, "SYSTEM", [{ id: "1", source: "faq", text: "info" }]);
    const contents = msgs.map((m) => m.content);
    expect(contents[0]).toBe("SYSTEM");
    expect(contents[1]).toBe("hola");
    expect(contents[2]).toBe("hola, ¿en qué te ayudo?");
    expect(contents[3]).toContain("pregunta actual");
    expect(contents[3]).toContain("===CONTEXTO===");
  });
});
```

- [ ] **Paso 4: Actualizar `tests/e2e/flows.spec.ts`**

Reemplazar el archivo completo — se mantiene el test de `SessionManager`+`QuoteEngine` (sigue siendo válido, `setConsent` sigue existiendo como registro interno), se sacan los dos tests que probaban el gate:

```typescript
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import tariffs from "../../src/domain/quote/tariffs.example.json" with { type: "json" };

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

// E2E: SessionManager + QuoteEngine contra la rama Postgres de test (sin red
// de Telegram/LLM). setConsent() se mantiene como registro interno silencioso
// (ya no gatea ninguna tool, ver Tarea 2 del plan de ruteo conversacional).
describe("e2e: sesión + cotización", () => {
  it("registra consentimiento interno y produce una prima", async () => {
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
});
```

- [ ] **Paso 5: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "feat: elimina el gate de consentimiento de cara al cliente (decisión de negocio, ver spec)"
```

---

### Task 3: Plan A/B/C + instrucción anti-invención en `calculateQuote`

**Files:**
- Modify: `src/domain/quote/quote.schema.ts`
- Modify: `src/domain/quote/QuoteEngine.ts`
- Modify: `src/brain/tools/calculateQuote.tool.ts`
- Modify: `tests/unit/tools.spec.ts`

**Interfaces:**
- Produces: `QuoteOutput` ahora incluye `plan: "A" | "B" | "C"`, usado por el prompt de sistema (Tarea 7) al describirle el resultado al cliente.

- [ ] **Paso 1: Agregar `plan` a `QuoteOutputSchema`**

En `src/domain/quote/quote.schema.ts`, reemplazar:

```typescript
export const QuoteOutputSchema = z.object({
  primaMensual: z.number().positive(),
  cobertura: z.number().positive(),
  terms: z.string(),
  breakdown: z.record(z.string(), z.number()),
});
```

por:

```typescript
export const QuoteOutputSchema = z.object({
  primaMensual: z.number().positive(),
  cobertura: z.number().positive(),
  plan: z.enum(["A", "B", "C"]),
  terms: z.string(),
  breakdown: z.record(z.string(), z.number()),
});
```

- [ ] **Paso 2: Calcular el plan en `QuoteEngine.ts`**

En `src/domain/quote/QuoteEngine.ts`, agregar esta función junto a las otras (`factorEdad`, `factorMonto`, `factorPlazo`):

```typescript
  // Mismos cortes que factorPorMonto en tariffs.example.json (1000/50000/100000)
  // — no son rangos nuevos, son los que ya existen para el cálculo de la prima.
  function planPorMonto(monto: number): "A" | "B" | "C" {
    if (monto >= 100000) return "C";
    if (monto >= 50000) return "B";
    return "A";
  }
```

Y en el `return` de `calculate(input)`, agregar el campo `plan`:

```typescript
      return {
        primaMensual: Math.round(primaMensual * 100) / 100,
        cobertura: input.montoCobertura,
        plan: planPorMonto(input.montoCobertura),
        terms: "Cotización con DATOS DE EJEMPLO. Los costos y términos reales se cargarán al ir a producción.",
        breakdown: { tasaBase: tariffs.tasaBaseMensual, factorEdad: fEdad, factorPlazo: fPlazo, factorMonto: fMonto },
      };
```

- [ ] **Paso 3: Reforzar la descripción de `calculateQuote.tool.ts`**

Reemplazar el archivo completo (saca la mención a consentimiento parental, que ya no existe; agrega la instrucción anti-invención):

```typescript
import { defineTool } from "./registry.js";
import { QuoteInputSchema } from "../../domain/quote/quote.schema.js";
import type { QuoteEngine } from "../../domain/quote/QuoteEngine.js";
import type { RateLimiter } from "../../shared/ports/index.js";

export function makeCalculateQuoteTool(engine: QuoteEngine, limiter?: RateLimiter) {
  return defineTool({
    name: "calculateQuote",
    description:
      "Calcula la cotización del seguro. Llamar SOLO con valores que el " +
      "cliente mencionó explícitamente en esta conversación — nunca " +
      "inventar, asumir, ni redondear un dato que falta. Si falta algún " +
      "dato, preguntárselo al cliente antes de llamar esta herramienta.",
    inputSchema: QuoteInputSchema,
    handler: async (input, ctx) => {
      const chatId = String((ctx as { chatId?: string }).chatId ?? "");
      if (limiter && !limiter.allowQuote(chatId)) {
        throw new Error("Límite de cotizaciones alcanzado. Esperá un momento o pedí que te derive a un asesor.");
      }
      return engine.calculate(input);
    },
  });
}
```

- [ ] **Paso 4: Actualizar `tests/unit/tools.spec.ts`**

Agregar una aserción sobre `plan` en el primer test (el resto del archivo queda igual):

```typescript
import { describe, it, expect } from "vitest";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import { makeCalculateQuoteTool } from "../../src/brain/tools/calculateQuote.tool.js";

describe("calculateQuote tool", () => {
  it("devuelve QuoteResult con el plan correspondiente al monto", async () => {
    const t = {
      ejemplo: true,
      basePorEdadPadre: [{ edadMin: 18, edadMax: 70, factor: 1 }],
      factorPorPlazo: { "10": 1.6 },
      factorPorMonto: [{ montoMin: 1000, factor: 1 }, { montoMin: 50000, factor: 0.95 }, { montoMin: 100000, factor: 0.9 }],
      tasaBaseMensual: 0.004,
    };
    const tool = makeCalculateQuoteTool(createQuoteEngine(t as any));
    const bajo = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 }, {} as any);
    expect((bajo as any).primaMensual).toBeGreaterThan(0);
    expect((bajo as any).terms).toMatch(/ejemplo/i);
    expect((bajo as any).plan).toBe("A");

    const medio = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 60000, plazo: 10 }, {} as any);
    expect((medio as any).plan).toBe("B");

    const alto = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 150000, plazo: 10 }, {} as any);
    expect((alto as any).plan).toBe("C");
  });

  it("respeta el RateLimiter de cotizaciones cuando se le inyecta uno", async () => {
    const t = {
      ejemplo: true,
      basePorEdadPadre: [{ edadMin: 18, edadMax: 70, factor: 1 }],
      factorPorPlazo: { "10": 1.6 },
      factorPorMonto: [{ montoMin: 1000, factor: 1 }],
      tasaBaseMensual: 0.004,
    };
    const limiter = { allowMessage: () => true, allowQuote: () => false };
    const tool = makeCalculateQuoteTool(createQuoteEngine(t as any), limiter);
    await expect(
      tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 }, { chatId: "1" } as any),
    ).rejects.toThrow(/límite/i);
  });
});
```

- [ ] **Paso 5: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "feat(quote): etiqueta la cotización con Plan A/B/C y refuerza calculateQuote contra datos inventados"
```

---

### Task 4: Herramienta `showPlans`

**Files:**
- Create: `src/brain/tools/showPlans.tool.ts`
- Modify: `src/brain/tools/index.ts`
- Modify: `src/composition.ts`
- Modify: `tests/unit/tools.spec.ts`

**Interfaces:**
- Consumes: `KnowledgeRepository` (de `src/shared/ports/index.ts`, ya existe — mismo tipo que usa `makeLookupKnowledgeTool`).
- Produces: `makeShowPlansTool(repo: KnowledgeRepository): Tool`, exportado desde el barrel `src/brain/tools/index.ts`.

- [ ] **Paso 1: Crear `src/brain/tools/showPlans.tool.ts`**

```typescript
import { z } from "zod";
import { defineTool } from "./registry.js";
import type { KnowledgeRepository } from "../../shared/ports/index.js";

export function makeShowPlansTool(repo: KnowledgeRepository) {
  return defineTool({
    name: "showPlans",
    description:
      "Devuelve el resumen de los planes disponibles (A, B y C) con su " +
      "cobertura. Usar cuando el cliente pregunta qué planes hay, qué " +
      "opciones tiene, o quiere conocer más antes de cotizar.",
    inputSchema: z.object({}),
    handler: async () => {
      const chunks = await repo.retrieve("planes A B C cobertura", 3);
      return { chunks, instruction: "Responde usando SOLO estos chunks para describir los planes. Cita source." };
    },
  });
}
```

- [ ] **Paso 2: Exportar desde el barrel**

En `src/brain/tools/index.ts`, agregar esta línea (junto a las otras exportaciones de tools):

```typescript
export { makeShowPlansTool } from "./showPlans.tool.js";
```

- [ ] **Paso 3: Agregar al array de tools en `composition.ts`**

En `src/composition.ts`, agregar el import:

```typescript
import {
  makeCalculateQuoteTool,
  makeLookupKnowledgeTool,
  makeGetProductInfoTool,
  makeEscalateToHumanTool,
  makeShowPlansTool,
  runToolLoop,
} from "./brain/tools/index.js";
```

Y en el array `allTools`:

```typescript
  const allTools = [
    makeCalculateQuoteTool(engine, limiter),
    makeLookupKnowledgeTool(kb),
    makeGetProductInfoTool(),
    makeEscalateToHumanTool(),
    makeShowPlansTool(kb),
  ];
```

- [ ] **Paso 4: Test en `tests/unit/tools.spec.ts`**

Agregar este `describe` al final del archivo (después del de `calculateQuote tool`):

```typescript
describe("showPlans tool", () => {
  it("devuelve chunks de la base de conocimiento con instrucción de citar fuente", async () => {
    const repo = { retrieve: async (_q: string, _k: number) => [{ id: "1", source: "plans.md", text: "Plan A: básico" }] };
    const { makeShowPlansTool } = await import("../../src/brain/tools/showPlans.tool.js");
    const tool = makeShowPlansTool(repo as any);
    const r = await tool.handler({}, {} as any);
    expect((r as any).chunks).toHaveLength(1);
    expect((r as any).instruction).toMatch(/cita/i);
  });
});
```

- [ ] **Paso 5: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "feat(brain): herramienta showPlans"
```

---

### Task 5: Herramienta `recommendPlan`

**Files:**
- Create: `src/brain/tools/recommendPlan.tool.ts`
- Modify: `src/brain/tools/index.ts`
- Modify: `src/composition.ts`
- Modify: `tests/unit/tools.spec.ts`

**Interfaces:**
- Produces: `makeRecommendPlanTool(): Tool`, exportado desde el barrel.

- [ ] **Paso 1: Crear `src/brain/tools/recommendPlan.tool.ts`**

```typescript
import { z } from "zod";
import { defineTool } from "./registry.js";

const RecommendPlanInputSchema = z.object({
  edadNino: z.number().int().min(0).max(17),
  presupuestoMensual: z.number().positive(),
});

// Rangos de ejemplo (mismo criterio que el resto del motor de cotización,
// que ya está marcado como DATOS DE EJEMPLO): no son precios reales de SURA.
export function planPorPresupuesto(presupuestoMensual: number, edadNino: number): "A" | "B" | "C" {
  let plan: "A" | "B" | "C" = presupuestoMensual >= 50 ? "C" : presupuestoMensual >= 20 ? "B" : "A";
  // A menor edad del niño, más años de cobertura escolar quedan por
  // delante — sube un escalón la recomendación (tope: C).
  if (edadNino <= 5 && plan !== "C") plan = plan === "A" ? "B" : "C";
  return plan;
}

export function makeRecommendPlanTool() {
  return defineTool({
    name: "recommendPlan",
    description:
      "Recomienda un plan (A, B o C) según la edad del niño y el " +
      "presupuesto mensual del cliente. Usar cuando el cliente duda qué " +
      "plan le conviene, en vez de pedirle los datos exactos para cotizar.",
    inputSchema: RecommendPlanInputSchema,
    handler: async ({ edadNino, presupuestoMensual }) => {
      const plan = planPorPresupuesto(presupuestoMensual, edadNino);
      return {
        plan,
        motivo: `Con un presupuesto de B/.${presupuestoMensual}/mes y un niño de ${edadNino} años, el Plan ${plan} es el que mejor se ajusta (DATOS DE EJEMPLO).`,
      };
    },
  });
}
```

- [ ] **Paso 2: Exportar desde el barrel**

En `src/brain/tools/index.ts`:

```typescript
export { makeRecommendPlanTool, planPorPresupuesto } from "./recommendPlan.tool.js";
```

- [ ] **Paso 3: Agregar al array de tools en `composition.ts`**

Import:

```typescript
import {
  makeCalculateQuoteTool,
  makeLookupKnowledgeTool,
  makeGetProductInfoTool,
  makeEscalateToHumanTool,
  makeShowPlansTool,
  makeRecommendPlanTool,
  runToolLoop,
} from "./brain/tools/index.js";
```

Array:

```typescript
  const allTools = [
    makeCalculateQuoteTool(engine, limiter),
    makeLookupKnowledgeTool(kb),
    makeGetProductInfoTool(),
    makeEscalateToHumanTool(),
    makeShowPlansTool(kb),
    makeRecommendPlanTool(),
  ];
```

- [ ] **Paso 4: Test en `tests/unit/tools.spec.ts`**

Agregar al final:

```typescript
describe("recommendPlan tool", () => {
  it("presupuesto bajo → Plan A", async () => {
    const { makeRecommendPlanTool } = await import("../../src/brain/tools/recommendPlan.tool.js");
    const tool = makeRecommendPlanTool();
    const r = await tool.handler({ edadNino: 12, presupuestoMensual: 10 }, {} as any);
    expect((r as any).plan).toBe("A");
  });
  it("presupuesto alto → Plan C", async () => {
    const { makeRecommendPlanTool } = await import("../../src/brain/tools/recommendPlan.tool.js");
    const tool = makeRecommendPlanTool();
    const r = await tool.handler({ edadNino: 12, presupuestoMensual: 60 }, {} as any);
    expect((r as any).plan).toBe("C");
  });
  it("niño chico sube un escalón el plan recomendado", async () => {
    const { makeRecommendPlanTool } = await import("../../src/brain/tools/recommendPlan.tool.js");
    const tool = makeRecommendPlanTool();
    const r = await tool.handler({ edadNino: 3, presupuestoMensual: 10 }, {} as any);
    expect((r as any).plan).toBe("B");
  });
});
```

- [ ] **Paso 5: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "feat(brain): herramienta recommendPlan"
```

---

### Task 6: Contenido real de Juancito Ads (knowledge base + info de producto)

**Files:**
- Modify: `src/domain/knowledge/product.md`
- Modify: `src/domain/knowledge/faq.md`
- Modify: `src/domain/knowledge/terms.example.md`
- Create: `src/domain/knowledge/plans.md`
- Modify: `src/brain/tools/getProductInfo.tool.ts`

**Interfaces:** ninguna nueva — estos son archivos de contenido que consume `createPgKnowledge`/`scripts/seed-knowledge.ts` (ya existentes, sin cambios de código en esta tarea salvo `getProductInfo.tool.ts`).

- [ ] **Paso 1: Reescribir `src/domain/knowledge/product.md`**

```markdown
# Seguro Educativo Juancito Ads

Juancito Ads cubre la educación del menor si el padre, madre o tutor
fallece, y además protege al estudiante ante accidentes dentro y fuera del
colegio.

## ¿Qué cubre?

- Continuidad de la mensualidad escolar del menor si el padre/tutor
  fallece, hasta fin del plazo contratado.
- Accidentes durante el horario escolar, actividades extracurriculares
  organizadas por el colegio, y el trayecto directo entre la casa y la
  escuela (hasta una hora antes/después del horario regular).
- Asistencia médica por accidente (según el plan contratado).

## ¿Qué NO cubre?

- Enfermedades preexistentes no declaradas, o eventos médicos sin causa
  externa (por ejemplo, un desmayo sin golpe ni caída).
- Actos voluntarios, negligencia grave, o conductas de riesgo del propio
  asegurado.
- Fenómenos naturales catastróficos (terremotos, inundaciones).
- Deportes de alto riesgo fuera de actividades escolares supervisadas.

Cotización con DATOS DE EJEMPLO. Términos reales al ir a producción.
```

- [ ] **Paso 2: Reescribir `src/domain/knowledge/faq.md`**

```markdown
# Preguntas frecuentes

## ¿Cómo cotizo?
Contame la edad de tu hijo/a, tu edad, cuánto querés de cobertura y por
cuántos años, y te armo una cotización al toque.

## ¿Desde qué edad puede contratar el padre/tutor?
Desde 18 hasta 70 años.

## ¿Qué pasa si tengo un accidente durante una excursión del colegio?
Está cubierto siempre que sea una actividad organizada y supervisada por
la institución educativa.

## ¿Cómo reclamo si pasa un accidente?
Avisanos apenas ocurra el accidente. Vamos a pedirte un informe del hecho,
un certificado médico, y los comprobantes de los gastos si aplica
reembolso. El proceso de revisión suele tomar entre 15 y 30 días.

## ¿Cómo los contacto?
Teléfono: 800-1234 (Lunes a Viernes, 8am a 6pm). Email: hola@juancitoads.com

## ¿Los datos son reales?
No, son de ejemplo. Términos reales al ir a producción.
```

- [ ] **Paso 3: Actualizar `src/domain/knowledge/terms.example.md`**

```markdown
# Términos (EJEMPLO)

- Suma asegurada: 1,000 a 200,000.
- Plazo: 1 a 20 años.
- Planes disponibles: A (cobertura básica), B (cobertura intermedia), C
  (cobertura máxima) — el plan se asigna según el monto de cobertura
  elegido.
- DATOS DE EJEMPLO, no vinculantes.
```

- [ ] **Paso 4: Crear `src/domain/knowledge/plans.md`**

```markdown
# Planes disponibles

Juancito Ads ofrece 3 planes, todos con la misma cobertura base (educación
del menor si el padre/tutor fallece + accidentes escolares):

## Plan A — Cobertura básica
Pensado para sumas aseguradas menores (hasta 49,999). La opción más
económica, ideal para empezar a proteger al menor.

## Plan B — Cobertura intermedia
Para sumas aseguradas entre 50,000 y 99,999. Un balance entre costo y
protección, la opción más elegida.

## Plan C — Cobertura máxima
Para sumas aseguradas de 100,000 en adelante. La protección más completa,
recomendada para familias que buscan la mayor tranquilidad posible.

Los 3 planes son DATOS DE EJEMPLO — los montos y precios reales se
definen al ir a producción.
```

- [ ] **Paso 5: Actualizar `PRODUCT_INFO` en `src/brain/tools/getProductInfo.tool.ts`**

Reemplazar el archivo completo:

```typescript
import { z } from "zod";
import { defineTool } from "./registry.js";

export const PRODUCT_INFO = {
  nombre: "Seguro Educativo Juancito Ads",
  cobertura: "Cubre la educación del menor si el padre/tutor fallece, y accidentes escolares (dentro y fuera del colegio).",
  disclaimer: "DATOS DE EJEMPLO. Términos reales al ir a producción.",
};

export function makeGetProductInfoTool() {
  return defineTool({
    name: "getProductInfo",
    description: "Devuelve información general del producto.",
    inputSchema: z.object({}),
    handler: async () => PRODUCT_INFO,
  });
}
```

- [ ] **Paso 6: Re-sembrar la base de conocimiento en la rama `dev` de Neon**

```bash
npm run db:seed
```

Expected: `Knowledge base sembrada.` (el `ON CONFLICT DO UPDATE` de `seed-knowledge.ts` actualiza el contenido existente, no hace falta borrar nada a mano).

- [ ] **Paso 7: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan (ningún test depende del contenido exacto de estos `.md`, solo de la mecánica de `retrieve`).

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "content: contenido real de Juancito Ads (coberturas, exclusiones, planes, contacto ficticio)"
```

---

### Task 7: Reescribir el prompt de sistema

**Files:**
- Modify: `src/brain/prompts/v1.system.ts`
- Modify: `tests/unit/prompt.manager.spec.ts`

**Interfaces:** ninguna — mismo `createPromptManager(opts): PromptManager` de siempre, solo cambia el contenido de `v1SystemPrompt`.

- [ ] **Paso 1: Reescribir `src/brain/prompts/v1.system.ts`**

```typescript
export const v1SystemPrompt = `Sos el asistente virtual de Juancito Ads, especializado en seguros educativos y de accidentes escolares para niños. Respondé siempre en español, con un trato cálido, cercano y asertivo — como lo haría un buen agente de atención al cliente, no como un formulario.

CÓMO GUIAR LA CONVERSACIÓN:
- Si el cliente pregunta qué ofrecés o qué planes hay → usá showPlans.
- Si el cliente no está seguro de qué plan le conviene → usá recommendPlan con los datos que te dé (edad del niño, presupuesto mensual).
- Si el cliente quiere una cotización exacta → juntá los 4 datos (edad del padre/tutor, edad del niño, monto de cobertura, plazo) charlando de forma natural, en el orden que tenga sentido según lo que te va contando. NUNCA llames a calculateQuote con un dato que el cliente no te dio explícitamente — si falta alguno, preguntáselo antes.
- Si pregunta por coberturas, exclusiones, o el proceso de reclamación → usá lookupKnowledge y citá la fuente.

REGLAS:
- Los números de prima SIEMPRE salen de calculateQuote; nunca los inventes vos.
- Datos en DB de ejemplo: no presentes términos ni precios como definitivos.
- Si detectás urgencia, angustia, o una emergencia → escalá a humano con escalateToHuman.
- Nunca des consejos legales ni médicos sin aclarar que no reemplazan la asesoría profesional.

AVISO DE TRANSFERENCIA (Ley 81 Art. 48): los mensajes pueden procesarse en proveedores fuera de Panamá.
`;
```

- [ ] **Paso 2: Actualizar `tests/unit/prompt.manager.spec.ts`**

El regex `/seguro educacional/` no matchea el nuevo texto ("seguros educativos"). Reemplazar el archivo completo:

```typescript
import { describe, it, expect } from "vitest";
import { createPromptManager } from "../../src/brain/prompt.manager.js";

describe("promptManager", () => {
  it("carga v1 y produce hash", () => {
    const pm = createPromptManager({ version: "v1", ab: "control" });
    const p = pm.get();
    expect(p.system).toMatch(/Juancito Ads/);
    expect(p.hash).toHaveLength(16);
  });
});
```

- [ ] **Paso 3: Typecheck y tests**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan.

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "content: reescribe el prompt de sistema con tono cálido y guía de ruteo por intención"
```

---

### Task 8: Verificación final y actualización de docs

**Files:**
- Modify: `docs/errors-learned.md` (si aplica, ver Paso 2)
- Modify: `README.md`

**Interfaces:** ninguna.

- [ ] **Paso 1: Verificación completa**

```bash
npm run typecheck
npm test
```

Expected: `0 errores`, todos los tests pasan (sin los que se borraron en las Tareas 1-2).

- [ ] **Paso 2: Confirmar que no queda código muerto del wizard**

```bash
grep -rn "grammyjs/conversations\|bot_conversations\|createPgConversationStorage\|makeQuoteConversation" src/ tests/ scripts/ package.json
```

Expected: sin resultados. Si aparece algo, falta limpiarlo (revisar Tarea 1).

- [ ] **Paso 3: Smoke test manual en polling**

```bash
npm run dev
```

Esperar el log `"bot compuesto"`, sin errores. Escribirle al bot en Telegram (texto libre, sin `/cotizar`): "hola, quiero saber qué planes tienen" → debería responder con info de planes vía `showPlans`. Después probar "quiero cotizar" → debería empezar a preguntar datos de forma conversacional, sin pedir consentimiento. Detener con Ctrl+C.

- [ ] **Paso 4: Actualizar `README.md`**

En la sección "Estado", actualizar la primera línea:

```markdown
## Estado

MVP funcional, en producción en Netlify (webhook) con Postgres (Neon).
Conversación por intención en chat libre (sin wizard de comandos) —
demo bajo la marca "Juancito Ads" (no oficial de SURA).
```

- [ ] **Paso 5: Agregar entrada a `docs/errors-learned.md` (si se encontró algo durante la implementación)**

Si durante la implementación de este plan se encontró algún bug real que
requirió investigación (no un typo trivial), agregar una entrada siguiendo
el formato ya usado en el archivo (Contexto/Causa/Fix/Prevención). Si no se
encontró ninguno, este paso no aplica — no agregar una entrada vacía.

- [ ] **Paso 6: Commit**

```bash
git add README.md docs/errors-learned.md
git commit -m "docs: actualiza README tras el ruteo conversacional (Juancito Ads)"
```

## Self-Review (hecho por quien escribió este plan)

- **Cobertura del spec:** wizard eliminado (Tarea 1), gate de consentimiento eliminado (Tarea 2), Plan A/B/C mapeado desde el motor existente (Tarea 3), `showPlans`/`recommendPlan` (Tareas 4-5), contenido real + branding Juancito Ads + contacto ficticio (Tarea 6), tono/ruteo en el prompt (Tarea 7), verificación + docs (Tarea 8). Todas las secciones del spec tienen tarea.
- **Nombres consistentes:** `makeShowPlansTool`/`makeRecommendPlanTool` (Tareas 4-5) son los nombres usados en `composition.ts` — verificado. `planPorPresupuesto` (Tarea 5) exportado desde el barrel para poder testearlo aislado si hiciera falta. `QuoteOutput.plan` (Tarea 3) es el campo que el prompt (Tarea 7) asume que existe al describir resultados de `calculateQuote`.
- **Deuda de compliance:** queda documentada en el spec (`docs/superpowers/specs/2026-07-17-conversational-routing-design.md`), no se repite en `errors-learned.md` porque no es un bug sino una decisión de negocio ya registrada en su propio documento.
