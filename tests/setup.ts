import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.test")) {
  config({ path: ".env.test" });
}
