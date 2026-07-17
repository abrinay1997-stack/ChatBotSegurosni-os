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
