import type { Prisma, PrismaClient } from "@prisma/client";
import { decryptBytes, decryptSecret, encryptBytes } from "./crypto";

type Db = PrismaClient | Prisma.TransactionClient;
/** Ticket original stored for one account. */
export type StoredTicket = { name: string; type: string; size: number; bytes: Buffer };

/** Reads a stored row: raw encrypted bytes first, legacy base64 text otherwise. */
export function ticketBytes(row: { payload: string; payloadBytes: Uint8Array | null }) {
  if (row.payloadBytes?.length) return decryptBytes(row.payloadBytes);
  return Buffer.from(decryptSecret(row.payload) ?? "", "base64");
}

/** Storage for ticket originals; the database is the only backend today. */
export const ticketStorage = {
  /** Returns the original and its metadata, or null when the account has no such file. */
  async get(db: Db, userId: string, id: string): Promise<StoredTicket | null> {
    const row = await db.railFile.findUnique({ where: { userId_id: { userId, id } }, select: { name: true, type: true, size: true, payload: true, payloadBytes: true } });
    return row ? { name: row.name, type: row.type, size: row.size, bytes: ticketBytes(row) } : null;
  },
  /** Stores a new original as encrypted raw bytes. */
  async put(db: Db, userId: string, id: string, file: { name: string; type: string; bytes: Buffer }) {
    await db.railFile.create({ data: { id, userId, name: file.name, type: file.type, size: file.bytes.length, payload: "", payloadBytes: encryptBytes(file.bytes) } });
  },
  /** Removes an original. */
  async delete(db: Db, userId: string, id: string) {
    await db.railFile.deleteMany({ where: { userId, id } });
  },
  /** Total stored bytes for the account (plaintext sizes, used for the quota). */
  async usage(db: Db, userId: string) {
    return (await db.railFile.aggregate({ where: { userId }, _sum: { size: true } }))._sum.size ?? 0;
  },
};

/** Rewrites up to `limit` legacy base64 rows as raw encrypted bytes; returns how many were converted. */
export async function backfillTicketBytes(db: PrismaClient, limit = 20) {
  const rows = await db.railFile.findMany({ where: { payloadBytes: null }, select: { userId: true, id: true }, take: limit });
  let converted = 0;
  for (const { userId, id } of rows) {
    const row = await db.railFile.findUnique({ where: { userId_id: { userId, id } }, select: { payload: true, payloadBytes: true } });
    if (!row || row.payloadBytes) continue;
    const result = await db.railFile.updateMany({ where: { userId, id, payloadBytes: null, payload: row.payload }, data: { payloadBytes: encryptBytes(ticketBytes(row)), payload: "" } });
    converted += result.count;
  }
  return converted;
}
