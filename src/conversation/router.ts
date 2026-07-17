import type { ChatMessage, Session, KnowledgeChunk } from "../shared/ports/index.js";
import type { Tool } from "../brain/tools/registry.js";

type Msg = ChatMessage & { content: string };

// Ya no hay tools gateadas por consentimiento (decisión de negocio: se saca
// el gate de cara al cliente, ver docs/superpowers/specs/2026-07-17-...).
// Se mantiene la firma de la función (session, allTools) para no tener que
// tocar composition.ts si en el futuro se necesita gatear algo de nuevo.
export function buildToolsForState(_session: Session, allTools: Tool[]): Tool[] {
  return allTools;
}

// Arma los mensajes para el LLM. El RAG va SIEMPRE en un mensaje user con
// delimitadores (===CONTEXTO===), NUNCA en el system prompt (anti-patrón del bot de referencia).
export function buildMessages(session: Session, system: string, ragChunks: KnowledgeChunk[]): Msg[] {
  const msgs: Msg[] = [{ role: "system", content: system }];
  const lastUser = session.history[session.history.length - 1];

  if (ragChunks.length && session.history.length && lastUser) {
    const ctx = ragChunks.map((c) => `--- ${c.source} ---\n${c.text}`).join("\n\n");
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
