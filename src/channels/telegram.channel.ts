import { Bot } from "grammy";
import type { ChannelAdapter, NormalizedMessage, RateLimiter, SessionRepository } from "../shared/ports/index.js";

export type { RateLimiter };

export function createRateLimiter(opts: {
  msgsPerMin: number;
  quotesPerHour: number;
  globalQuotesPerMin: number;
}): RateLimiter {
  const msgs = new Map<string, number[]>();
  const quotes = new Map<string, number[]>();
  let globalQuotes: number[] = [];
  return {
    allowMessage(chatId) {
      const now = Date.now();
      const arr = (msgs.get(chatId) ?? []).filter((t) => now - t < 60_000);
      if (arr.length >= opts.msgsPerMin) return false;
      arr.push(now);
      msgs.set(chatId, arr);
      return true;
    },
    allowQuote(chatId) {
      const now = Date.now();
      const arr = (quotes.get(chatId) ?? []).filter((t) => now - t < 3_600_000);
      globalQuotes = globalQuotes.filter((t) => now - t < 60_000);
      if (arr.length >= opts.quotesPerHour || globalQuotes.length >= opts.globalQuotesPerMin) return false;
      arr.push(now);
      quotes.set(chatId, arr);
      globalQuotes.push(now);
      return true;
    },
  };
}

export interface TelegramChannel {
  bot: Bot;
  channel: ChannelAdapter;
  start(mode: "polling" | "webhook", url?: string): void;
}

export function createTelegramChannel(opts: {
  token: string;
  secret?: string;
  allowlist: string[];
  repo: SessionRepository;
  limiter: RateLimiter;
}): TelegramChannel {
  const bot = new Bot(opts.token);
  const channel: ChannelAdapter = {
    normalizeIn(update: unknown): NormalizedMessage | null {
      const u = update as { message?: { text?: string; chat: { id: number } }; update_id: number };
      if (!u.message?.text) return null;
      const chatId = String(u.message.chat.id);
      if (opts.allowlist.length && !opts.allowlist.includes(chatId)) return null;
      return { chatId, text: u.message.text, updateId: u.update_id };
    },
    async send(chatId, text) {
      await bot.api.sendMessage(chatId, text);
    },
  };
  return {
    bot,
    channel,
    start(mode, url) {
      if (mode === "polling") {
        bot.start();
        return;
      }
      if (url) bot.api.setWebhook(url, { secret_token: opts.secret });
    },
  };
}
