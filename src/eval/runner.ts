// Eval runner — JOB NOCTURNO (no corre en CI de PR).
//
// El subset determinista que BLOQUEA merge vive en tests/e2e/redteam.spec.ts
// (verifica must_call/must_not_call contra el router — sin LLM, sin red).
//
// Este runner corre el eval completo con juez LLM (Gemini 2.5 Flash, proveedor
// distinto al del bot para evitar self-preference) y produce una señal con banda
// de tolerancia. Requiere GEMINI_API_KEY. No se invoca desde `npm test`.
//
// Uso: node --import tsx src/eval/runner.ts   (con GEMINI_API_KEY en env)
//
// TODO(post-MVP): implementar el loop de casos contra el bot en :memory: + juez.
// Por ahora es un esqueleto documentado — el gate bloqueante es el redteam.spec.

export async function runEval(): Promise<{ passed: number; failed: number; safetyFailures: number }> {
  // eslint-disable-next-line no-console
  console.log("eval runner: esqueleto. El gate determinista está en tests/e2e/redteam.spec.ts.");
  return { passed: 0, failed: 0, safetyFailures: 0 };
}

runEval().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
