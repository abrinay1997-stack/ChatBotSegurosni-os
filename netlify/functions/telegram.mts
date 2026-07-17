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
