CREATE TABLE "RailMailbox" (
    "userId" TEXT NOT NULL,
    "inboundHash" TEXT,
    "inboundToken" TEXT,
    "gmail" TEXT,
    "imap" TEXT,
    "seen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "lastError" TEXT,
    "notice" TEXT,
    "lease" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RailMailbox_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "RailMailbox_inboundHash_key" ON "RailMailbox"("inboundHash");
ALTER TABLE "RailMailbox" ADD CONSTRAINT "RailMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
