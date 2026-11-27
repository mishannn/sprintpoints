#!/usr/bin/env node
/**
 * Import a Sprint Points JSON dump into the Worker.
 *
 * Produce the dump from the old admin endpoint (or `postgres_export.sql`),
 * then run:
 *
 *   ADMIN_TOKEN=... node scripts/import-dump.mjs \
 *     --url https://sprintpoints.example.com --dump sprintpoints-dump.json
 *
 * The import replaces all rows, validates references first, and is safe to
 * re-run. Verify with `--verify`, which downloads the exported state and
 * compares row counts with the dump.
 */

import { readFile } from "node:fs/promises";

const TABLES = ["rooms", "participants", "issues", "votes"];

function parseArgs(argv) {
  const args = { verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify") {
      args.verify = true;
    } else if (arg === "--url") {
      args.url = argv[++index];
    } else if (arg === "--dump") {
      args.dump = argv[++index];
    } else if (arg === "--token") {
      args.token = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.token = args.token || process.env.ADMIN_TOKEN;
  return args;
}

async function request(method, url, token, body) {
  const response = await fetch(url, {
    method,
    headers: {
      "X-Admin-Token": token,
      "User-Agent": "sprintpoints-migrate/1.0",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} -> ${response.status}: ${raw}`);
  }
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.dump) {
    throw new Error("Usage: import-dump.mjs --url <base> --dump <file> [--token <token>] [--verify]");
  }
  if (!args.token) {
    throw new Error("ADMIN_TOKEN is required");
  }

  const base = args.url.replace(/\/$/, "");
  const dump = JSON.parse(await readFile(args.dump, "utf8"));

  for (const table of TABLES) {
    dump[table] ??= [];
    console.log(`source ${table}: ${dump[table].length} rows`);
  }

  const imported = await request("POST", `${base}/api/admin/import`, args.token, dump);
  console.log("import:", imported.status, imported.body);

  if (args.verify) {
    const exported = await request("GET", `${base}/api/admin/export`, args.token);
    if (!exported.body) {
      throw new Error(`export failed: ${exported.status}`);
    }
    for (const table of TABLES) {
      const source = dump[table].length;
      const target = (exported.body[table] || []).length;
      const marker = source === target ? "ok" : "MISMATCH";
      console.log(`${marker.padEnd(9)} ${table}: source=${source} worker=${target}`);
      if (source !== target) {
        process.exitCode = 1;
        return;
      }
    }
    const sourceIds = new Set(dump.rooms.map((room) => `${room.id}\u0000${room.code}`));
    const targetIds = new Set(exported.body.rooms.map((room) => `${room.id}\u0000${room.code}`));
    if (
      sourceIds.size !== targetIds.size ||
      [...sourceIds].some((value) => !targetIds.has(value))
    ) {
      throw new Error("room ids/codes differ between source and worker");
    }
    console.log("ok        room ids and codes match");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
