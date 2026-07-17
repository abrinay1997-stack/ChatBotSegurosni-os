import type { DatabaseHandle } from "../db.js";
import type { SessionRepository, Session } from "../../shared/ports/index.js";

export function createSessionRepository(handle: DatabaseHandle): SessionRepository {
  return {
    async get(chatId) {
      const row = (await handle.db.get("SELECT * FROM sessions WHERE chat_id = $1", [chatId])) as {
        chat_id: string; history: string | null; quote_state: string | null;
        consent_parent_at: number | null; updated_at: number | null;
      } | undefined;
      if (!row) return null;
      return {
        chatId: row.chat_id,
        history: JSON.parse(row.history ?? "[]"),
        quoteState: JSON.parse(row.quote_state ?? "{}"),
        consentParentAt: row.consent_parent_at ?? null,
        updatedAt: row.updated_at ?? 0,
      } as Session;
    },
    async save(s) {
      await handle.db.run(
        "INSERT INTO sessions (chat_id, history, quote_state, consent_parent_at, updated_at) VALUES ($1,$2,$3,$4,$5) " +
        "ON CONFLICT(chat_id) DO UPDATE SET history=excluded.history, quote_state=excluded.quote_state, consent_parent_at=excluded.consent_parent_at, updated_at=excluded.updated_at",
        [s.chatId, JSON.stringify(s.history), JSON.stringify(s.quoteState), s.consentParentAt, s.updatedAt],
      );
    },
    async markProcessed(updateId) {
      const r = await handle.db.run(
        "INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT (update_id) DO NOTHING",
        [updateId, Date.now()],
      );
      return r.rowCount > 0;
    },
  };
}
