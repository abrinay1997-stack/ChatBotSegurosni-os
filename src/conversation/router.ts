import type { ChatMessage, Session, KnowledgeChunk } from "../shared/ports/index.js";
import type { Tool } from "../brain/tools/registry.js";

type Msg = ChatMessage & { content: string };

// Tools que requieren consentimiento parental previo.
const GATED = new Set(["calculateQuote"]);

export function buildToolsForState(session: Session, allTools: Tool[]): Tool[] {
  const consented = session.consentParentAt != null;
  return allTools.filter((t) => !GATED.has(t.name) || consented);
}

// Arma los mensajes para el LLM. El RAG va SIEMPRE en un mensaje user con
// delimitadores (===CONTEXTO===), NUNCA en el system prompt (anti-patrón del bot de referencia).
export function buildMessages(session: Session, system: string, ragChunks: KnowledgeChunk[]): Msg[] {
  const msgs: Msg[] = [{ role: "system", content: system }];
  const lastUser = session.history[session.history.length - 1];

  if (ragChunks.length && session.history.length && lastUser) {
    const ctx = ragChunks.map((c) => `--- ${c.source} ---\n${c.text}`).join("\n\n");
    // Historial más viejo primero (orden cronológico), la pregunta actual
    // (con el contexto RAG inyectado) siempre al final.
    msgs.push(...session.history.slice(0, -1).map((m) => ({ role: m.role as Msg["role"], content: m.content })));
    msgs.push({
      role: "user",
      content: `===CONTEXTO===\n${ctx}\n===FIN CONTEXTO===\n\nPregunta del usuario (último mensaje): ${lastUser.content}`,
    });
  } else {
    msgs.push(...session.history.map((m) => ({ role: m.role as Msg["role"], content: m.content })));
  }
  return msgs;
}
