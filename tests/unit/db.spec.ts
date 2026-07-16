import { describe, it, expect } from "vitest";
import { createDatabase, type DatabaseHandle } from "../../src/persistence/db.js";

describe("createDatabase", () => {
  it("crea tablas y permite insertar sesión", () => {
    const h: DatabaseHandle = createDatabase(":memory:");
    const now = Date.now();
    h.db.run(
      "INSERT INTO sessions (chat_id, history, quote_state, updated_at) VALUES (?, ?, ?, ?)",
      ["c1", "[]", "{}", now]
    );
    const row = h.db.get("SELECT chat_id FROM sessions WHERE chat_id = ?", [
      "c1",
    ]) as any;
    expect(row.chat_id).toBe("c1");
    h.close();
  });
  it("processed_updates idempotente con INSERT OR IGNORE", () => {
    const h: DatabaseHandle = createDatabase(":memory:");
    const r1 = h.db.run(
      "INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)",
      [1, Date.now()]
    );
    const r2 = h.db.run(
      "INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)",
      [1, Date.now()]
    );
    expect(r1.changes).toBe(1);
    expect(r2.changes).toBe(0);
    h.close();
  });
});
