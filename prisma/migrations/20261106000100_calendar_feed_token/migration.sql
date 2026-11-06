-- Live calendar feed: one long-lived, resettable token per account (stored hashed).
ALTER TYPE "AccountTokenType" ADD VALUE IF NOT EXISTS 'CALENDAR_FEED';
