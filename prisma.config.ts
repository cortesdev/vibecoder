import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

// Prisma ORM 8 config. The connection comes from DATABASE_URL — on the deploy
// platform it is provisioned and injected; locally, put it in .env.
export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.prisma",
    db: {
      connection: process.env.DATABASE_URL ?? "postgresql://localhost:5432/vibecoder",
    },
  }),
});
