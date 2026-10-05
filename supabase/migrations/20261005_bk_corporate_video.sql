-- TAYLORMADE/CREATIVE — Business video offers join the quote lane
--
-- 2026-10-05, Nelson: "add something for companies to book me for talking
-- video shoots where they talk to the camera", plus any other big-money items
-- missing from the photo/video pages. Three quote services, all on
-- /corporate-video/:
--   corporate-video  talking-head videos for companies (leadership, training,
--                    testimonials, explainers, recruiting, social clips)
--   content-day      the documented Content Day scope from the outreach engine
--                    (~/taylormade-creative/outreach/README.md): one day at the
--                    client's location, vertical video set + stills bank
--   video-podcast    hosts/guests on camera in the studio, cut into social clips
-- No posted prices: video is quoted on scope (Nelson's standing rule). The www
-- booking page pre-fills a brief for each via ?service=<slug>(&type=…).
--
-- Idempotent: re-running updates the rows in place.

begin;

insert into bk_services (slug, name, tagline, kind, legacy_service, duration_min, active, sort, location_ok)
values
  ('corporate-video', 'Corporate Talking-Head Video',
   'Your team on camera: leadership messages, training, testimonials, explainers, recruiting, social clips.',
   'project', 'brand_content', 120, true, 26, false),
  ('content-day', 'Content Day',
   'One shoot day at your location, edited into vertical videos plus a stills bank. Built to run for a quarter.',
   'project', 'brand_content', 480, true, 27, false),
  ('video-podcast', 'Video Podcast',
   'Hosts and guests on camera in the downtown Dallas studio, cut into short clips for social.',
   'project', 'brand_content', 120, true, 55, false)
on conflict (slug) do update
   set name           = excluded.name,
       tagline        = excluded.tagline,
       kind           = excluded.kind,
       legacy_service = excluded.legacy_service,
       active         = true,
       sort           = excluded.sort;

commit;
