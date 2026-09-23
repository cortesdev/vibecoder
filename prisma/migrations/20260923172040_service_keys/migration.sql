-- CreateTable
CREATE TABLE "ServiceKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary',
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceKey_userId_serviceSlug_idx" ON "ServiceKey"("userId", "serviceSlug");
