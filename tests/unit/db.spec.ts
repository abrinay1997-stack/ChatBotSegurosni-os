import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, type DatabaseHandle } from "../../src/persistence/db.js";

import { TEST_DB_URL, hasTestDb } from "../helpers/testDb.js";

describe.skipIf(!hasTestDb)("createDatabase", () => {
  it("permite insertar y leer una sesión", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const chatId = randomUUID();
    const now = Date.now();
    await h.db.run(
      "INSERT INTO sessions (chat_id, history, quote_state, updated_at) VALUES ($1, $2, $3, $4)",
      [chatId, "[]", "{}", now],
    );
    const row = (await h.db.get("SELECT chat_id FROM sessions WHERE chat_id = $1", [chatId])) as { chat_id: string };
    expect(row.chat_id).toBe(chatId);
    h.close();
  });

  it("processed_updates idempotente con ON CONFLICT DO NOTHING", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const updateId = Math.floor(Math.random() * 1_000_000_000);
    const r1 = await h.db.run(
      "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
      [updateId, Date.now()],
    );
    const r2 = await h.db.run(
      "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
      [updateId, Date.now()],
    );
    expect(r1.rowCount).toBe(1);
    expect(r2.rowCount).toBe(0);
    h.close();
  });
});
