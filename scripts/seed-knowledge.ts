import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..", "src", "domain", "knowledge");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está seteada");
  const sql = neon(url);

  for (const file of readdirSync(docsDir)) {
    if (!file.endsWith(".md")) continue;
    const src = join(docsDir, file);
    // Normaliza CRLF→LF: en checkouts de Windows (autocrlf) los .md quedan
    // con \r\n, y como el id de cada chunk es "${file}:${title}", un \r
    // colado en el título rompe el ON CONFLICT — cada re-seed generaba
    // filas duplicadas en vez de actualizar las existentes.
    const content = readFileSync(src, "utf-8").replace(/\r\n/g, "\n");
    let section = "";
    let title = file;

    const insert = async (text: string) => {
      const id = `${file}:${title}`;
      // "source" es lo que el LLM cita textualmente al usuario (ver
      // lookupKnowledge.tool.ts: "Cita source") — nunca la ruta absoluta
      // del archivo en el filesystem del servidor, solo el nombre del
      // documento.
      await sql`INSERT INTO knowledge (id, source, text) VALUES (${id}, ${file}, ${text.trim()})
                 ON CONFLICT (id) DO UPDATE SET source = EXCLUDED.source, text = EXCLUDED.text`;
    };

    for (const line of content.split("\n")) {
      if (line.startsWith("#")) {
        if (section) await insert(section);
        title = line;
        section = "";
      }
      section += line + "\n";
    }
    if (section) await insert(section);
  }
  console.log("Knowledge base sembrada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
