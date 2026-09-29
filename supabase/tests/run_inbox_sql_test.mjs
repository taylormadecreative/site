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
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
if (!process.argv.includes("--no-migration")) {
  const mig = readFileSync(here + "../migrations/20260923_bk_inbox.sql", "utf8");
  await db.exec("alter table public.bk_projects disable trigger bk_projects_touch; update public.bk_projects set updated_at = now() - interval '45 days'; alter table public.bk_projects enable trigger bk_projects_touch;");
  const before = (await db.query("select updated_at::text u from public.bk_projects order by created_at limit 1")).rows[0].u;
  await run("migration", mig);
  const after = (await db.query("select updated_at::text u from public.bk_projects order by created_at limit 1")).rows[0].u;
  if (before !== after) fail(`migration touched updated_at on existing projects (${before} -> ${after})`);
  // an inquiry that arrives between two applies must still need a reply after a re-run
  await db.exec("select public.bk_submit_inquiry('Between Runs', 'between@example.com', 'other')");
  await run("migration re-run (idempotent)", mig);
  const still = (await db.query("select inbox_handled_at from public.bk_projects where client_email = 'between@example.com'")).rows[0];
  if (still.inbox_handled_at !== null) fail("re-running the migration marked a new inquiry as handled");
  await db.exec("delete from public.bk_projects where client_email = 'between@example.com'");
}
// the test ends with RAISE NOTICE; PGlite surfaces notices via onNotice on query
await db.query("select 1", [], { onNotice: (n) => notices.push(n.message) });
await run("test", "begin;\n" + readFileSync(here + "20260923_bk_inbox_test.sql", "utf8") + "\nrollback;");
const calls = await db.query("select count(*)::int n from net.calls");
console.log(`INBOX SQL TESTS PASSED (net.http_post calls after rollback: ${calls.rows[0].n})`);
