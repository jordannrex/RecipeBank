import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

// Prisma v7: prisma.config.ts runs before Next.js loads env files, so we
// must load them explicitly. .env.local overrides .env (same as Next.js).
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
