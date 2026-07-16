import type { Context } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import type { SessionManager } from "../session.manager.js";
import type { QuoteEngine } from "../../domain/quote/QuoteEngine.js";
import type { RateLimiter } from "../../shared/ports/index.js";

// Wizard de cotización guiado vía @grammyjs/conversations.
// Fija consentimiento parental antes de calcular (gate de compliance).
export function makeQuoteConversation(sm: SessionManager, engine: QuoteEngine, limiter?: RateLimiter) {
  return async function quoteConversation(conversation: Conversation<Context>, ctx: Context) {
    const chatId = String(ctx.chat!.id);
    if (limiter && !limiter.allowQuote(chatId)) {
      await ctx.reply("Límite de cotizaciones alcanzado. Esperá un momento o pedí que te derive a un asesor.");
      return;
    }
    await ctx.reply("Para cotizar necesito tu consentimiento para tratar datos de la cotización.");
    const consent = await conversation.waitFor(["message:text"]);
    if (!/^(s[ií]|si|yes|claro)/i.test(consent.message.text ?? "")) {
      await ctx.reply("Sin problema, no cotizo. Puedo ayudarte con otras dudas.");
      return;
    }
    await sm.setConsent(chatId);

    await ctx.reply("Edad del padre/tutor (18-70)?", {
      reply_markup: { keyboard: [[{ text: "18-30" }, { text: "31-40" }], [{ text: "41-50" }, { text: "51-70" }]] },
    });
    const edadBand = await conversation.waitFor(["message:text"]);
    const band = edadBand.message.text ?? "";
    const edadPadre = band === "18-30" ? 25 : band === "31-40" ? 35 : band === "41-50" ? 45 : 60;

    await ctx.reply("Edad del niño (0-17)?");
    const edadNinoMsg = await conversation.waitFor(["message:text"]);
    const edadNino = Math.max(0, Math.min(17, parseInt(edadNinoMsg.message.text ?? "5", 10) || 5));

    await ctx.reply("Monto de cobertura (1,000 - 200,000)?");
    const montoMsg = await conversation.waitFor(["message:text"]);
    const monto = Math.max(1000, Math.min(200000, parseInt(montoMsg.message.text ?? "10000", 10) || 10000));

    await ctx.reply("Plazo en años (1-20)?");
    const plazoMsg = await conversation.waitFor(["message:text"]);
    const plazo = Math.max(1, Math.min(20, parseInt(plazoMsg.message.text ?? "10", 10) || 10));

    const result = engine.calculate({ edadPadre, edadNino, montoCobertura: monto, plazo });
    await ctx.reply(
      `Cotización (DATOS DE EJEMPLO):\n` +
      `• Prima mensual: B/. ${result.primaMensual.toFixed(2)}\n` +
      `• Cobertura: B/. ${result.cobertura}\n` +
      `• Plazo: ${plazo} años\n\n${result.terms}`,
    );
  };
}
