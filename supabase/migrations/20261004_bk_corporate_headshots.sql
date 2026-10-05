-- TAYLORMADE/CREATIVE — Corporate (team) headshots join the quote lane
--
-- Offer (Nelson, 2026-10-04): team headshots for companies, on-site at the
-- client's office OR in the downtown Dallas studio, 10-person minimum, one
-- retouched headshot per person, extra editing sold as add-ons. Per-person
-- pricing lives on /corporate-headshots/ and /pricing/; the group total depends
-- on headcount and add-ons, so this is a kind='project' (quote) service, not
-- instant book. www /book/?service=corporate-headshots selects it and pre-fills
-- the brief (team size, dates, office address).
--
-- Idempotent: re-running updates the row in place.

begin;

insert into bk_services (slug, name, tagline, kind, legacy_service, duration_min, active, sort, location_ok)
values (
  'corporate-headshots',
  'Corporate Headshots',
  'Team headshots for companies: $125/person at your office or $99/person in the Dallas studio. 10-person minimum.',
  'project',
  'photography',
  120,
  true,
  25,      -- first quote card: after the instant-book sessions (10–16), before branding (30)
  false
)
on conflict (slug) do update
   set name           = excluded.name,
       tagline        = excluded.tagline,
       kind           = excluded.kind,
       legacy_service = excluded.legacy_service,
       active         = true,
       sort           = excluded.sort;

commit;
