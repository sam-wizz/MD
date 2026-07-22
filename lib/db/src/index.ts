import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type Db = NodePgDatabase<typeof schema>;

let poolInstance: pg.Pool | undefined;
let dbInstance: Db | undefined;

function createPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

function getPool(): pg.Pool {
  poolInstance ??= createPool();
  return poolInstance;
}

function getDb(): Db {
  dbInstance ??= drizzle(getPool(), { schema });
  return dbInstance;
}

// Lazy proxies keep API compatibility while avoiding hard failure at import time.
// This allows runtimes to boot routes that don't touch the database.
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const instance = getPool();
    const value = Reflect.get(instance as unknown as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as unknown as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export * from "./schema";
