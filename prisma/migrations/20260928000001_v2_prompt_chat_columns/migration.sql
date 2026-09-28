-- Repair: chat-thread columns that reached databases via `db push` drift and
-- were never captured in a migration. Fresh databases 500 without them.
ALTER TABLE "Prompt" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Prompt" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'build';
ALTER TABLE "Prompt" ADD COLUMN "modelId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Prompt" ADD COLUMN "modelLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Prompt" ADD COLUMN "error" TEXT NOT NULL DEFAULT '';
