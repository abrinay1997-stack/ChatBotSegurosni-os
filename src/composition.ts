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

  bot.use(conversations({ storage: createPgConversationStorage(db) as never }) as never);
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
