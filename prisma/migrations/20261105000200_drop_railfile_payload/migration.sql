-- Plan 1.4c: every row holds raw encrypted bytes (backfill confirmed 0 legacy rows on 2026-11-05).
-- SET NOT NULL fails, and rolls the migration back, if any legacy row remains.
ALTER TABLE "RailFile" ALTER COLUMN "payloadBytes" SET NOT NULL;
ALTER TABLE "RailFile" DROP COLUMN "payload";
