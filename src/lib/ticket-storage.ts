import type { Prisma, PrismaClient } from "@prisma/client";
import { decryptBytes, encryptBytes } from "./crypto";

type Db = PrismaClient | Prisma.TransactionClient;
/** Ticket original stored for one account. */
export type StoredTicket = { name: string; type: string; size: number; bytes: Buffer };

/** Decrypts a stored row's raw encrypted bytes. */
export const ticketBytes = (row: { payloadBytes: Uint8Array }) => decryptBytes(row.payloadBytes);

/** Storage for ticket originals; the database is the only backend today. */
export const ticketStorage = {
  /** Returns the original and its metadata, or null when the account has no such file. */
  async get(db: Db, userId: string, id: string): Promise<StoredTicket | null> {
    const row = await db.railFile.findUnique({ where: { userId_id: { userId, id } }, select: { name: true, type: true, size: true, payloadBytes: true } });
    return row ? { name: row.name, type: row.type, size: row.size, bytes: ticketBytes(row) } : null;
  },
  /** Stores a new original as encrypted raw bytes. */
  async put(db: Db, userId: string, id: string, file: { name: string; type: string; bytes: Buffer }) {
    await db.railFile.create({ data: { id, userId, name: file.name, type: file.type, size: file.bytes.length, payloadBytes: encryptBytes(file.bytes) } });
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
