import { DataSourceOptions } from "typeorm";
import { entities } from "../database/entities";
import { InitialSchema1750000000000 } from "../database/migrations/1750000000000-initial-schema";

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_POSTGRES_SCHEMA = "sprintpoints_nest";
const DEFAULT_SQLITE_URL = "sqlite:///./sprintpoints-nest.sqlite3";

export type DatabaseConfig = {
  driver: "postgres" | "sqlite";
  url: string;
  schema: string;
  options: DataSourceOptions;
};

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = databaseUrlFromEnv(env);
  if (url.startsWith("sqlite://")) {
    const database = sqlitePath(url);
    const options: DataSourceOptions = {
      type: "better-sqlite3",
      database,
      entities,
      migrations: [InitialSchema1750000000000],
      migrationsTableName: "nestjs_migrations",
      synchronize: false,
      migrationsRun: false,
      logging: false,
      timeout: 5000,
      prepareDatabase: (db) => {
        db.pragma("foreign_keys = ON");
        db.pragma("busy_timeout = 5000");
      },
    };
    return { driver: "sqlite", url, schema: "", options };
  }

  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error("unsupported database URL scheme");
  }

  const parsed = new URL(url);
  const schema = normalizedSchema(parsed.searchParams.get("search_path") || env.DATABASE_SCHEMA || DEFAULT_POSTGRES_SCHEMA);
  const connectionURL = stripSearchPath(url);

  const options: DataSourceOptions = {
    type: "postgres",
    url: connectionURL,
    schema,
    entities,
    migrations: [InitialSchema1750000000000],
    migrationsTableName: "nestjs_migrations",
    synchronize: false,
    migrationsRun: false,
    logging: false,
    useUTC: true,
    // Both the ORM connection and raw migration SQL must target the isolated
    // schema, and shared timestamp columns represent UTC wall time.
    extra: {
      options: `-c search_path=${schema} -c TimeZone=UTC`,
    },
  };
  return { driver: "postgres", url: connectionURL, schema, options };
}

export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }
  const db = env.POSTGRES_DB;
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  if (db && user && password) {
    const host = env.POSTGRES_HOST || "localhost";
    const port = env.POSTGRES_PORT || "5432";
    const connection = new URL("postgresql://localhost");
    connection.username = encodeURIComponent(user);
    connection.password = encodeURIComponent(password);
    connection.hostname = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    connection.port = port;
    connection.pathname = `/${encodeURIComponent(db)}`;
    return connection.toString();
  }
  return DEFAULT_SQLITE_URL;
}

function normalizedSchema(value: string): string {
  const schema = value.trim();
  if (!SCHEMA_NAME.test(schema) || schema === "public" || schema.startsWith("pg_")) {
    throw new Error(`invalid DATABASE_SCHEMA "${value}": use a lowercase identifier, excluding public and pg_* schemas`);
  }
  return schema;
}

function stripSearchPath(raw: string): string {
  const parsed = new URL(raw);
  parsed.searchParams.delete("search_path");
  return parsed.toString();
}

function sqlitePath(raw: string): string {
  let path = raw.slice("sqlite://".length);
  const queryIndex = path.indexOf("?");
  if (queryIndex >= 0) {
    path = path.slice(0, queryIndex);
  }
  if (path.startsWith("//")) {
    return path.slice(1);
  }
  if (path.startsWith("/")) {
    return path.slice(1);
  }
  return path;
}
