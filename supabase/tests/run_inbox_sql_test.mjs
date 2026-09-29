// Runs the inbox migration + its SQL test against a stub schema in PGlite (no real database touched).
// Usage: node supabase/tests/run_inbox_sql_test.mjs [--no-migration]
import { PGlite } from "/Users/nelsontaylor/.cache/pglite-rig/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const db = new PGlite();
const notices = [];
const run = async (label, sql) => {
  try { await db.exec(sql); }
  catch (e) { console.error(`FAIL in ${label}: ${e.message}`); process.exit(1); }
};
await run("stub schema", readFileSync(here + "inbox_stub_schema.sql", "utf8"));
if (!process.argv.includes("--no-migration")) {
  await run("migration", readFileSync(here + "../migrations/20260923_bk_inbox.sql", "utf8"));
  await run("migration re-run (idempotent)", readFileSync(here + "../migrations/20260923_bk_inbox.sql", "utf8"));
}
// the test ends with RAISE NOTICE; PGlite surfaces notices via onNotice on query
await db.query("select 1", [], { onNotice: (n) => notices.push(n.message) });
await run("test", "begin;\n" + readFileSync(here + "20260923_bk_inbox_test.sql", "utf8") + "\nrollback;");
const calls = await db.query("select count(*)::int n from net.calls");
console.log(`INBOX SQL TESTS PASSED (net.http_post calls after rollback: ${calls.rows[0].n})`);
