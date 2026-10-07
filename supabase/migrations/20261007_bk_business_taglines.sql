-- TAYLORMADE/CREATIVE — booking-card taglines catch up with Nelson's answers (2026-10-07)
-- He helps with scripts and has a teleprompter; edits full podcast episodes and
-- takes creators as well as companies; does headshot booths at events.

begin;

update bk_services set tagline = 'Your team on camera, with script help and a teleprompter: leadership messages, training, testimonials, explainers, recruiting, social clips.'
 where slug = 'corporate-video';
update bk_services set tagline = 'For companies and creators: hosts and guests on camera in the downtown Dallas studio, edited into full episodes plus short clips.'
 where slug = 'video-podcast';
update bk_services set tagline = 'Team headshots for companies: $125/person at your office or $99/person in the Dallas studio. 10-person minimum. Event headshot booths too.'
 where slug = 'corporate-headshots';

commit;
