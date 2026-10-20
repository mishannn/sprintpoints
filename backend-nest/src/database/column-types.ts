/**
 * The TypeORM column type for application timestamps. PostgreSQL uses its
 * native timestamp type while SQLite exposes the same values through
 * `datetime`. The configuration is fixed when the process starts.
 */
function sqliteConfigured(env: NodeJS.ProcessEnv): boolean {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL.startsWith("sqlite://");
  }
  return !(env.POSTGRES_DB && env.POSTGRES_USER && env.POSTGRES_PASSWORD);
}

export const TIMESTAMP_COLUMN_TYPE: "timestamp" | "datetime" = sqliteConfigured(process.env) ? "datetime" : "timestamp";
