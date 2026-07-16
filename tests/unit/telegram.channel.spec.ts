import { describe, it, expect } from "vitest";
import { createTelegramChannel, createRateLimiter } from "../../src/channels/telegram.channel.js";

// El bot real usa channel.normalizeIn() en el handler de mensajes para aplicar
// el allowlist — antes de este fix, normalizeIn nunca se llamaba y el
// allowlist era código muerto.
describe("telegram channel: allowlist", () => {
  const limiter = createRateLimiter({ msgsPerMin: 20, quotesPerHour: 10, globalQuotesPerMin: 5 });

  it("sin allowlist configurado, deja pasar cualquier chat", () => {
    const { channel } = createTelegramChannel({ token: "t", allowlist: [], repo: {} as any, limiter });
    const update = { update_id: 1, message: { text: "hola", chat: { id: 999 } } };
    expect(channel.normalizeIn(update)).toEqual({ chatId: "999", text: "hola", updateId: 1 });
  });

  it("con allowlist configurado, bloquea chats fuera de la lista", () => {
    const { channel } = createTelegramChannel({ token: "t", allowlist: ["111"], repo: {} as any, limiter });
    const blocked = { update_id: 1, message: { text: "hola", chat: { id: 999 } } };
    expect(channel.normalizeIn(blocked)).toBeNull();
    const allowed = { update_id: 2, message: { text: "hola", chat: { id: 111 } } };
    expect(channel.normalizeIn(allowed)).toEqual({ chatId: "111", text: "hola", updateId: 2 });
  });
});
