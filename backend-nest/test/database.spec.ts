import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { databaseUrlFromEnv, loadDatabaseConfig } from "../src/config/database.config";
import { prepareDatabase } from "../src/database/prepare-database";

function sqliteUrl(path: string): string {
  return `sqlite:////${path.replace(/^\//, "")}`;
}

describe("Database lifecycle", () => {
  it("migrates a fresh database and is idempotent on restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sprintpoints-db-"));
    const path = join(directory, "fresh.sqlite3");
    const previous = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = sqliteUrl(path);
      await prepareDatabase(loadDatabaseConfig());
      await prepareDatabase(loadDatabaseConfig());

      const database = new Database(path);
      const ledger = database.prepare("SELECT count(*) AS count FROM nestjs_migrations").get() as { count: number };
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;
      database.close();
      expect(ledger.count).toBe(1);
      expect(tables.map((table) => table.name)).toEqual(
        expect.arrayContaining(["issues", "nestjs_migrations", "participants", "rooms", "votes"]),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses a database with unmanaged tables", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sprintpoints-db-"));
    const path = join(directory, "unmanaged.sqlite3");
    const previous = process.env.DATABASE_URL;
    try {
      const database = new Database(path);
      database.exec("CREATE TABLE keep_me(id INTEGER)");
      database.close();
      process.env.DATABASE_URL = sqliteUrl(path);
      await expect(prepareDatabase(loadDatabaseConfig())).rejects.toThrow(/unmanaged/);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("validates schema names and builds escaped PostgreSQL URLs", () => {
    const previous = { ...process.env };
    try {
      process.env.DATABASE_URL = "";
      process.env.POSTGRES_DB = "room/name #?%";
      process.env.POSTGRES_USER = "user:@/?#%";
      process.env.POSTGRES_PASSWORD = "password:@/?#% +";
      process.env.POSTGRES_HOST = "::1";
      process.env.POSTGRES_PORT = "5544";
      const parsed = new URL(databaseUrlFromEnv());
      expect(decodeURIComponent(parsed.username)).toBe(process.env.POSTGRES_USER);
      expect(decodeURIComponent(parsed.password)).toBe(process.env.POSTGRES_PASSWORD);
      expect(parsed.host).toBe("[::1]:5544");
      expect(decodeURIComponent(parsed.pathname)).toBe(`/${process.env.POSTGRES_DB}`);
      expect(parsed.pathname).toContain("%2F");
      expect(parsed.search).toBe("");
      expect(parsed.hash).toBe("");

      process.env.DATABASE_URL = "postgres://localhost/test";
      for (const schema of ["public", "pg_catalog", "Bad", "two.parts", "a".repeat(64)]) {
        process.env.DATABASE_SCHEMA = schema;
        expect(() => loadDatabaseConfig()).toThrow(/DATABASE_SCHEMA/);
      }
      process.env.DATABASE_SCHEMA = "safe_schema_1";
      expect(loadDatabaseConfig().schema).toBe("safe_schema_1");
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, previous);
    }
  });
});
