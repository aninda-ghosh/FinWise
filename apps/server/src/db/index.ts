import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://finwise:finwise@localhost:5432/finwise";

const client = postgres(DATABASE_URL);

const db = drizzle(client, { schema });

export function getDb() {
  return db;
}

export function getSql() {
  return client;
}

export type DB = typeof db;
