import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { loadDatabaseConfig } from "../src/config/database.config";
import { prepareDatabase } from "../src/database/prepare-database";

export type ApiResult = {
  status: number;
  body: any;
  headers: Headers;
  text: string;
};

export type ApiFixture = {
  app: INestApplication;
  url: string;
  databasePath: string;
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<ApiResult>;
  createRoom: () => Promise<{ result: any; state: any }>;
  addMember: (code: string, name?: string, spectator?: boolean) => Promise<any>;
  seed: (sql: string) => void;
  close: () => Promise<void>;
};

export async function createFixture(origins: string[] = ["*"]): Promise<ApiFixture> {
  const directory = mkdtempSync(join(tmpdir(), "sprintpoints-nest-"));
  const databasePath = join(directory, "api.sqlite3");
  process.env.DATABASE_URL = `sqlite:////${databasePath.replace(/^\//, "")}`;
  delete process.env.DATABASE_SCHEMA;
  delete process.env.POSTGRES_DB;
  delete process.env.POSTGRES_USER;
  delete process.env.POSTGRES_PASSWORD;

  await prepareDatabase(loadDatabaseConfig());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useLogger(false);
  configureApp(app, origins);
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();

  const request = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<ApiResult> => {
    const requestHeaders = { ...headers };
    const init: RequestInit = { method, headers: requestHeaders };
    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${url}${path}`, init);
    const text = await response.text();
    let parsed: any;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed, headers: response.headers, text };
  };

  const createRoom = async () => {
    const response = await request("POST", "/api/rooms", {
      roomName: "Planning",
      participantName: "Host",
      defaults: { facilitatorName: "Facilitator", firstStoryTitle: "First story", roomName: "Default" },
    });
    if (response.status !== 201) {
      throw new Error(`create room status=${response.status} body=${response.text}`);
    }
    return { result: response.body, state: response.body.state };
  };

  const addMember = async (code: string, name = "Member", spectator = false) => {
    const response = await request("POST", `/api/rooms/${code}/join`, { name, isSpectator: spectator });
    if (response.status !== 201) {
      throw new Error(`join room status=${response.status} body=${response.text}`);
    }
    return response.body;
  };

  const seed = (sql: string) => {
    const database = new Database(databasePath);
    try {
      database.pragma("foreign_keys = ON");
      database.exec(sql);
    } finally {
      database.close();
    }
  };

  const close = async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  };

  return { app, url, databasePath, request, createRoom, addMember, seed, close };
}
