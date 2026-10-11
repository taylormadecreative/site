-- JENEL STUDIOS — podcast prep note: raw files are included
--
-- 2026-10-10, Nelson: "yes they leave with their file i can upload them to
-- dropbox for them to download or they should bring a drive". The prep email
-- for studio-podcast now says so. Idempotent.

update bk_services
   set prep_notes = 'Your confirmation email has the exact address and access details. The podcast set, cameras, and mics are ours, and we run the recording, so bring your guests and your topic. You leave with your raw files: bring a drive, or we''ll send you a Dropbox link to download them. If you added the edit, have your logo and branding with you at the shoot; your edited episode comes back within 3–4 days. Your session runs inside your booked time.'
 where slug = 'studio-podcast';
