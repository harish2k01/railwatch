-- Plan 1.4a: raw encrypted ticket bytes, nullable until new writes and the backfill fill it.
ALTER TABLE "RailFile" ADD COLUMN "payloadBytes" BYTEA;
