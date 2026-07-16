import { createServer } from "node:http";
import { collectDefaultMetrics, register } from "prom-client";
import type { DatabaseHandle } from "../persistence/db.js";
import type { LLMProvider } from "../shared/ports/index.js";

collectDefaultMetrics();

export interface HttpDeps {
  port: number;
  db: DatabaseHandle;
  llm: LLMProvider;
  webhookSecret?: string;
  onUpdate?: (body: any, secret?: string) => Promise<void>;
}

export function startHttp(deps: HttpDeps) {
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      try {
        deps.db.db.get("SELECT 1", []);
        res.end("ok");
      } catch {
        res.statusCode = 500;
        res.end("db-down");
      }
      return;
    }
    if (req.url === "/metrics") {
      res.setHeader("content-type", register.contentType);
      res.end(await register.metrics());
      return;
    }
    if (req.url === "/telegram" && req.method === "POST" && deps.onUpdate) {
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (deps.webhookSecret && secret !== deps.webhookSecret) {
        res.statusCode = 401;
        res.end("bad-secret");
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          await deps.onUpdate!(JSON.parse(body), secret as string | undefined);
          res.end("ok");
        } catch {
          res.statusCode = 500;
          res.end("err");
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end("nf");
  });
  server.listen(deps.port);
  return server;
}
