import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

export const masteringJobs = mysqlTable("mastering_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "uploading", "analyzing", "processing", "exporting", "done", "error"]).default("pending").notNull(),
  stage: varchar("stage", { length: 128 }),
  progress: int("progress").default(0),
  sourceKey: text("sourceKey"),
  sourceUrl: text("sourceUrl"),
  sourceFilename: varchar("sourceFilename", { length: 255 }),
  sourceMime: varchar("sourceMime", { length: 64 }),
  outputWavKey: text("outputWavKey"),
  outputWavUrl: text("outputWavUrl"),
  outputMp3Key: text("outputMp3Key"),
  outputMp3Url: text("outputMp3Url"),
  mixSettings: text("mixSettings"),
  analysisReport: text("analysisReport"),
  errorMsg: text("errorMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MasteringJob = typeof masteringJobs.$inferSelect;
export type InsertMasteringJob = typeof masteringJobs.$inferInsert;