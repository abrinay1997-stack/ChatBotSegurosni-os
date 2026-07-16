// Scrubber de PII panameño: CI (X-XXX-XXXX), teléfono (XXXX-XXXX), fecha (DD/MM/AAAA).
const CI_RE = /\b\d{1,2}-\d{3,4}-\d{3,4}\b/g;
const PHONE_RE = /\b\d{4}-\d{4}\b/g;
const DATE_RE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;

export function scrubPII(text: string): string {
  return text.replace(CI_RE, "[CI]").replace(PHONE_RE, "[TEL]").replace(DATE_RE, "[FECHA]");
}
