import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});
after(() => vite.close());
const { parseCsv, serializeIssuesToJiraCsv } = await vite.ssrLoadModule("/src/features/manage-issues/model/jiraCsv.ts");

test("imports comma-separated, quoted and multiline Jira fields", () => {
  const csv = '\uFEFFSummary,Description\r\n"A, one","line 1\nline 2"\r\n"B ""quoted""",value\r\n';
  assert.deepEqual(parseCsv(csv), {
    headers: ["Summary", "Description"],
    rows: [["A, one", "line 1\nline 2"], ['B "quoted"', "value"]],
  });
});

test("preserves the comma-only format for a single-column file", () => {
  assert.deepEqual(parseCsv("Summary\nFirst\nSecond\n"), {
    headers: ["Summary"],
    rows: [["First"], ["Second"]],
  });
  assert.deepEqual(parseCsv(""), { headers: [], rows: [] });
});

test("rejects malformed quoted fields", () => {
  assert.throws(() => parseCsv('Summary\n"unterminated'), /Quoted field unterminated/);
});

test("exports values that round-trip through CSV parsing", () => {
  const issue = { title: 'A, "quoted" task', description: "line 1\nline 2", estimate: "5", link: "https://jira.example/TASK-2" };
  const csv = serializeIssuesToJiraCsv([issue]);
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ["Summary", "Issue key", "Issue Type", "Status", "Description", "Story Points", "Issue URL"]);
  assert.deepEqual(rows[0], [issue.title, "TASK-2", "Story", "To Do", issue.description, "5", issue.link]);
});
