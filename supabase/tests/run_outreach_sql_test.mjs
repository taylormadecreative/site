// Runs the outreach migration (twice: idempotent) + its SQL test in PGlite. No real database touched.
// Usage: node supabase/tests/run_outreach_sql_test.mjs
import { PGlite } from "/Users/nelsontaylor/.cache/pglite-rig/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const db = new PGlite();
const run = async (label, sql) => {
  try { await db.exec(sql); } catch (e) { console.error(`FAIL in ${label}: ${e.message}`); process.exit(1); }
};
await run("inbox stub", readFileSync(here + "inbox_stub_schema.sql", "utf8"));
await run("outreach stub", readFileSync(here + "outreach_stub_schema.sql", "utf8"));
const mig = readFileSync(here + "../migrations/20261008_bk_outreach.sql", "utf8");
await run("migration", mig);
await run("migration re-run (idempotent)", mig);
await run("test", "begin;\n" + readFileSync(here + "20261008_bk_outreach_test.sql", "utf8") + "\nrollback;");
const left = await db.query("select count(*)::int n from public.bk_outreach_pitches");
if (left.rows[0].n !== 0) { console.error("FAIL: test rows survived the rollback"); process.exit(1); }
const settings = await db.query("select count(*)::int n from public.bk_outreach_settings");
if (settings.rows[0].n !== 1) { console.error("FAIL: settings row missing"); process.exit(1); }
console.log("OUTREACH SQL TESTS PASSED");
