import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.test")) {
  config({ path: ".env.test" });
  console.log("[setup.ts] DATABASE_URL_TEST loaded:", process.env.DATABASE_URL_TEST ? "yes" : "no");
}
