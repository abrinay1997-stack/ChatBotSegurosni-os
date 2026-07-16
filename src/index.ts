import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseConfig } from "./infra/config.js";
import { createLogger, withConversation } from "./infra/logger.js";
import { createDatabase } from "./persistence/db.js";
import { createSessionRepository } from "./persistence/repositories/session.repository.js";
import { createSessionManager } from "./conversation/session.manager.js";
import { createQuoteEngine } from "./domain/quote/QuoteEngine.js";
import tariffs from "./domain/quote/tariffs.example.json" with { type: "json" };
import { createFtsKnowledge } from "./domain/knowledge/rag.js";
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
import { scrubPII } from "./brain/guardrails/input.js";
import { checkOutput } from "./brain/guardrails/output.js";
import { detectDistress } from "./brain/guardrails/distress.js";
import { createTelegramChannel, createRateLimiter } from "./channels/telegram.channel.js";
import { startHttp } from "./infra/http.server.js";
import { conversations, createConversation } from "@grammyjs/conversations";

async function main() {
  const cfg = parseConfig(process.env);
  const logger = createLogger(cfg.logLevel);
  const db = createDatabase(cfg.databaseUrl);
  const sessionRepo = createSessionRepository(db);
  const sm = createSessionManager(sessionRepo, { maxContextTokens: 6000 });
  const engine = createQuoteEngine(tariffs as never);

  const here = dirname(fileURLToPath(import.meta.url));
  const knowledgeDir = join(here, "domain", "knowledge");
  const kb = createFtsKnowledge(db, knowledgeDir);
  const pm = createPromptManager({ version: cfg.promptVersion, ab: cfg.promptAb });
  const llm = cfg.llmProvider === "groq"
    ? createGroqProvider({ apiKey: cfg.groqApiKey ?? "" })
    : createGlmProvider({ apiKey: cfg.glmApiKey ?? "" });
  // Precio real de Groq llama-3.3-70b-versatile: $0.59 / $0.79 por millón de
  // tokens (input/output) — los valores anteriores (0.17/0.43 por MIL) eran
  // ~300-500x más caros que el real y disparaban el budget guard casi de inmediato.
  const cost = createCostGuard({ budgetUsd: cfg.llmDailyBudgetUsd, pricePer1k: { input: 0.00059, output: 0.00079 } });
  const limiter = createRateLimiter({ msgsPerMin: 20, quotesPerHour: 10, globalQuotesPerMin: 5 });
  const { bot, channel, start } = createTelegramChannel({
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

  // Fix #2: registrar el wizard de cotización (grammY conversations).
  bot.use(conversations() as never);
  bot.use(createConversation(makeQuoteConversation(sm, engine, limiter) as never, "quote") as never);

  bot.command("cotizar", async (ctx) => {
    await (ctx as never as { conversation: { enter: (n: string) => Promise<void> } }).conversation.enter("quote");
  });

  // Fix #3: la lógica vive como middleware de grammY (no en un handleUpdate manual).
  // Polling y webhook ambos corren el pipeline vía bot.handleUpdate().
  bot.on("message:text", async (ctx) => {
    const normalized = channel.normalizeIn(ctx.update); // aplica allowlist de chats
    if (!normalized) return;
    const { chatId, text, updateId } = normalized;

    if (!(await sessionRepo.markProcessed(updateId))) return; // idempotencia
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
      const tools = buildToolsForState(session, allTools); // consent gate: sin consent → sin calculateQuote
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

  // Webhook handler: corre el update por todo el pipeline de middleware.
  async function handleUpdate(update: unknown) {
    await bot.handleUpdate(update as never);
  }

  start(
    cfg.nodeEnv === "production" ? "webhook" : "polling",
    cfg.nodeEnv === "production" ? `${process.env.RAILWAY_PUBLIC_DOMAIN ?? ""}/telegram` : undefined,
  );
  const http = startHttp({
    port: cfg.port,
    db,
    llm,
    webhookSecret: cfg.telegramWebhookSecret,
    onUpdate: handleUpdate,
  });

  const shutdown = () => {
    bot.stop();
    db.close();
    http.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  logger.info("bot iniciado", { provider: cfg.llmProvider, env: cfg.nodeEnv });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
