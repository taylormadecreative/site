-- TAYLORMADE/CREATIVE — Senior photos launch switch (run AFTER the site is live)
--
-- scripts/apply-seniors.sh runs this only once www serves the /book/ redirect
-- for senior-* and the updated Birthday copy. It:
--   1. switches senior-mini / senior-full on
--   2. drops the Birthday Full deposit (Nelson 2026-09-30: "full price for
--      anything over $150"). Birthday Mini keeps its $75 deposit.
-- Guarded by a bk_config flag so a re-run can never undo a later edit made in
-- schedule.html (e.g. a senior session switched off, or a deposit put back).

begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.bk_config where key = 'launched_seniors_20260930') then
    update public.bk_services set active = true where slug in ('senior-mini', 'senior-full');
    update public.bk_services set deposit_cents = null, auto_balance = false
     where slug = 'birthday-full' and deposit_cents = 17500;
    insert into public.bk_config (key, value) values ('launched_seniors_20260930', now()::text);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
