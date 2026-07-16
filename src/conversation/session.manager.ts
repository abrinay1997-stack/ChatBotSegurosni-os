import { encode } from "gpt-tokenizer";
import type { SessionRepository, Session } from "../shared/ports/index.js";

export interface SessionManager {
  load(chatId: string): Promise<Session | null>;
  appendTurn(chatId: string, role: string, content: string): Promise<void>;
  setQuoteState(chatId: string, state: Record<string, unknown>): Promise<void>;
  setConsent(chatId: string): Promise<void>;
}

export function createSessionManager(repo: SessionRepository, opts: { maxContextTokens: number }): SessionManager {
  const tokens = (s: string) => encode(s).length;

  // Poda el history si excede 0.7 del contexto, manteniendo los últimos 4 turnos.
  // NUNCA toca quoteState (el wizard no pierde estado al podar).
  function prune(s: Session): Session {
    const total = s.history.reduce((a, m) => a + tokens(m.content), 0);
    if (total <= opts.maxContextTokens * 0.7) return s;
    s.history = s.history.slice(-4);
    return s;
  }

  async function loadOrNew(chatId: string): Promise<Session> {
    return (await repo.get(chatId)) ?? {
      chatId, history: [], quoteState: {}, consentParentAt: null, updatedAt: Date.now(),
    };
  }

  return {
    async load(chatId) { return repo.get(chatId); },
    async appendTurn(chatId, role, content) {
      const s = await loadOrNew(chatId);
      s.history.push({ role, content });
      prune(s);
      s.updatedAt = Date.now();
      await repo.save(s);
    },
    async setQuoteState(chatId, state) {
      const s = await loadOrNew(chatId);
      s.quoteState = state;
      s.updatedAt = Date.now();
      await repo.save(s);
    },
    async setConsent(chatId) {
      const s = await loadOrNew(chatId);
      s.consentParentAt = Date.now();
      s.updatedAt = Date.now();
      await repo.save(s);
    },
  };
}
