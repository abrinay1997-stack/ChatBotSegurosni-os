// Eval runner — JOB NOCTURNO (no corre en CI de PR).
//
// Corre los casos de evals/cases.yaml con juez LLM (Gemini 2.5 Flash, proveedor
// distinto al del bot para evitar self-preference) y produce una señal con banda
// de tolerancia. Requiere GEMINI_API_KEY. No se invoca desde `npm test`.
//
// Uso: node --import tsx src/eval/runner.ts   (con GEMINI_API_KEY en env)
//
// TODO(post-MVP): implementar el loop de casos contra el bot en :memory: + juez.
// Por ahora es un esqueleto documentado, sin gate determinista bloqueante en CI.

export async function runEval(): Promise<{ passed: number; failed: number; safetyFailures: number }> {
  // eslint-disable-next-line no-console
  console.log("eval runner: esqueleto, ver evals/cases.yaml para los casos definidos.");
  return { passed: 0, failed: 0, safetyFailures: 0 };
}

runEval().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
