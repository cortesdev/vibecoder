ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

CREATE TABLE "AgentLearning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdById" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentLearning_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AgentLearning_scope_status_idx" ON "AgentLearning"("scope", "status");
CREATE INDEX "AgentLearning_status_createdAt_idx" ON "AgentLearning"("status", "createdAt");
CREATE INDEX "AgentLearning_createdById_idx" ON "AgentLearning"("createdById");
