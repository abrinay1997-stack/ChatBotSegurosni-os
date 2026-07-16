// tsc no copia archivos .md — prompt.manager.ts los lee en runtime desde
// dist/brain/prompts/, así que hay que copiarlos a mano después del build.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/brain/prompts", { recursive: true });
cpSync("src/brain/prompts", "dist/brain/prompts", { recursive: true });
