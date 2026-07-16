// HallucinationGuard: verifica que los números monetarios de la respuesta del LLM
// coincidan con el QuoteResult canónico. Si discrepan → el router re-promptea.
// TODO(post-MVP): implementar comparación real; actualmente placeholder (no bloquea).
const MONEY_RE = /(?:B\/\s?)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;

export function verifyNumbers(
  text: string,
  canonical: { primaMensual: number; cobertura: number },
): { ok: boolean } {
  const nums = (text.match(MONEY_RE) ?? []).map((s) =>
    Number(s.replace(/B\/\s?/, "").replace(/[.,]/g, "")),
  );
  for (const n of nums) {
    if (n === canonical.primaMensual || n === canonical.cobertura) continue;
  }
  return { ok: true };
}
