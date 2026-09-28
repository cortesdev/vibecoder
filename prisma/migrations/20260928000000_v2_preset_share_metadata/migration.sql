-- AlterTable: per-project active preset selection (nullable, no backfill needed)
ALTER TABLE "Project" ADD COLUMN "activePresetId" TEXT;

-- AlterTable: nullable JSON metadata on chat messages (attachment refs, export links)
ALTER TABLE "Prompt" ADD COLUMN "metadata" TEXT;

-- CreateTable: read-only preview snapshot shares (bearer token hashed, never stored)
CREATE TABLE "PreviewShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "PreviewShare_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PreviewShare_tokenHash_key" ON "PreviewShare"("tokenHash");

-- CreateIndex
CREATE INDEX "PreviewShare_projectId_idx" ON "PreviewShare"("projectId");
