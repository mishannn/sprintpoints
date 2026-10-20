import { Client } from "pg";
import { DataSource } from "typeorm";
import { DatabaseConfig } from "../config/database.config";

/**
 * Creates the isolated target schema and applies TypeORM migrations before the
 * HTTP server starts. PostgreSQL startup is serialized with an advisory lock.
 * Existing tables without this app's migration ledger are rejected instead of
 * being silently adopted.
 */
export async function prepareDatabase(config: DatabaseConfig): Promise<void> {
  if (config.driver === "postgres") {
    const client = new Client({ connectionString: config.url });
    await client.connect();
    const lockKey = `sprintpoints-nest-schema-${config.schema}`;
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1)::bigint)", [lockKey]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${config.schema}"`);
      await runMigrations(config);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [lockKey]);
      } finally {
        await client.end();
      }
    }
    return;
  }

  await runMigrations(config);
}

async function runMigrations(config: DatabaseConfig): Promise<void> {
  const dataSource = new DataSource(config.options);
  await dataSource.initialize();
  try {
    await assertManagedTarget(dataSource, config);
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

async function assertManagedTarget(dataSource: DataSource, config: DatabaseConfig): Promise<void> {
  const tables = await dataSource.query(
    config.driver === "postgres"
      ? `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'`
      : `SELECT name FROM sqlite_master WHERE type = 'table'`,
    config.driver === "postgres" ? [config.schema] : [],
  );
  const names = (tables as Array<{ name: string }>)
    .map((row) => row.name)
    .filter((name) => !(config.driver === "sqlite" && name.startsWith("sqlite_")));
  if (names.length > 0 && !names.includes("nestjs_migrations")) {
    throw new Error("target database contains unmanaged tables; explicit migration required");
  }
}
