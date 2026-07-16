// Bloquea secretos, rutas de código y números de cuenta en la salida del LLM.
const LEAK_RE = /(src\/|sk-[a-zA-Z0-9]{10}|process\.env|\b\d{4}-\d{4}-\d{4}-\d{4}\b)/g;

export function checkOutput(text: string): { ok: boolean; blocked?: string } {
  const m = text.match(LEAK_RE);
  return m ? { ok: false, blocked: m[0] } : { ok: true };
}
