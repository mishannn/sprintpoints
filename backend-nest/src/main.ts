import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp, corsOrigins } from "./app.setup";
import { loadDatabaseConfig } from "./config/database.config";
import { prepareDatabase } from "./database/prepare-database";

const logger = new Logger("Bootstrap");

async function main(): Promise<void> {
  process.env.TZ ||= "UTC";
  const args = new Set(process.argv.slice(2));

  if (args.has("-healthcheck") || args.has("--healthcheck")) {
    const healthy = await healthcheck();
    process.exit(healthy ? 0 : 1);
  }

  const database = loadDatabaseConfig();
  await prepareDatabase(database);
  if (args.has("-migrate") || args.has("--migrate")) {
    logger.log("schema migrations complete");
    return;
  }

  const app = await NestFactory.create(AppModule);
  configureApp(app, corsOrigins());
  const { host, port } = listenAddress();
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
  logger.log(`Sprint Points listening on ${host ? `${host}:` : ":"}${port}`);
}

function listenAddress(): { host: string | undefined; port: number } {
  const raw = process.env.LISTEN_ADDR || ":8000";
  if (/^\d+$/.test(raw)) {
    return { host: undefined, port: Number(raw) };
  }
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return { host: raw.slice(1, end), port: Number(raw.slice(end + 2)) };
  }
  const separator = raw.lastIndexOf(":");
  if (separator < 0) {
    return { host: raw || undefined, port: 8000 };
  }
  return {
    host: raw.slice(0, separator) || undefined,
    port: Number(raw.slice(separator + 1)) || 8000,
  };
}

async function healthcheck(): Promise<boolean> {
  const { port } = listenAddress();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    await response.body?.cancel();
    return response.status === 200;
  } catch {
    return false;
  }
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
