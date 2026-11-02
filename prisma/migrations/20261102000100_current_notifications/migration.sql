CREATE TABLE "RailNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "payload" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RailNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RailNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RailNotification_userId_key_key" ON "RailNotification"("userId", "key");
CREATE INDEX "RailNotification_userId_dismissedAt_createdAt_idx" ON "RailNotification"("userId", "dismissedAt", "createdAt");
