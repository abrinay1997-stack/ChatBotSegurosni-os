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
  makeShowPlansTool,
  makeRecommendPlanTool,
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
    makeShowPlansTool(kb),
    makeRecommendPlanTool(),
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
      // Registro interno y silencioso de cuándo arrancó el tratamiento de
      // datos de esta conversación — no se pide ni se muestra al cliente
      // (decisión de negocio documentada en el spec de este ciclo).
      if (session.consentParentAt == null) {
        await sm.setConsent(chatId);
      }
      const { system } = pm.get();
      const rag = await kb.retrieve(text, 3);
      const messages = buildMessages(session, system, rag);
      const tools = buildToolsForState(session, allTools);

      let reply: string;
      try {
        const result = await runToolLoop({
          provider: llm,
          tools,
          messages,
          ctx: { chatId } as never,
          maxRounds: 3,
        });
        cost.add(result.usage);
        reply = result.finalResponse ?? "No tengo respuesta para eso. ¿Querés que te derive a un humano?";
      } catch (e) {
        // El proveedor LLM (Groq/GLM) puede fallar por auth, rate limit o
        // timeout — se loguea el detalle para diagnosticar en los logs de
        // Netlify, pero al cliente le llega el mismo mensaje de siempre.
        logger.error("fallo llamando al proveedor LLM", { error: e instanceof Error ? e.message : String(e) });
        reply = "No tengo respuesta para eso. ¿Querés que te derive a un humano?";
      }

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
