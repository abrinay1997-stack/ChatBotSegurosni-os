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
