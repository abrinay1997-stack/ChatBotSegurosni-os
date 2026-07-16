import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export interface PromptManager {
  get(): { system: string; version: string; hash: string };
}

// Carga el prompt desde .md (no embebido en código). Versionado + A/B.
// NOTA build: tsc no copia .md a dist/; en prod copiar prompts/ al deploy o usar bundler.
export function createPromptManager(opts: { version: string; ab: "control" | "test" }): PromptManager {
  const version = opts.ab === "test" ? `${opts.version}-b` : opts.version;
  const path = new URL(`./prompts/${version.replace("-b", "")}.system.md`, import.meta.url);
  const system = readFileSync(path, "utf-8");
  const hash = createHash("sha256").update(system).digest("hex").slice(0, 16);
  return { get: () => ({ system, version, hash }) };
}
