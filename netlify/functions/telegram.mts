import type { Context, Config } from "@netlify/functions";
import { webhookCallback } from "grammy";
import { parseConfig } from "../../src/infra/config.js";
import { buildBot } from "../../src/composition.js";

let callbackPromise: Promise<(req: Request) => Promise<Response>> | undefined;

function getCallback() {
  if (!callbackPromise) {
    // process.env NO está poblado en el runtime de Netlify Functions v2;
    // las variables de entorno del sitio se leen vía el global Netlify.env.
    const cfg = parseConfig(Netlify.env.toObject());
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
