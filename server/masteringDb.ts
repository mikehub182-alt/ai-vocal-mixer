import { desc, eq } from "drizzle-orm";
import { masteringJobs, type InsertMasteringJob, type MasteringJob } from "../drizzle/schema";
import { getDb } from "./db";

export async function createJob(job: InsertMasteringJob): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(masteringJobs).values(job);
}

export async function getJob(id: string): Promise<MasteringJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(masteringJobs).where(eq(masteringJobs.id, id)).limit(1);
  return rows[0];
}

export async function updateJob(
  id: string,
  updates: Partial<Omit<MasteringJob, "id" | "userId" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(masteringJobs).set(updates).where(eq(masteringJobs.id, id));
}

export async function listUserJobs(userId: number, limit = 20): Promise<MasteringJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(masteringJobs)
    .where(eq(masteringJobs.userId, userId))
    .orderBy(desc(masteringJobs.createdAt))
    .limit(limit);
}
