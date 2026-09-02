-- Repair for the 2026-09-02 incident: S3_PUBLIC_BASE_URL on production held a
-- localhost value, so iOS-app analyses stored media URLs like
-- http://localhost:3000/api/media/<key> — blank Shot Frames and video for app
-- users even though the objects exist in R2 and serve fine from the real
-- origin. lib/storage.ts s3PublicBase() now guards against stale origins;
-- this rewrites the rows that were written while the value was bad.
--
-- Idempotent: once repaired, the WHERE clause matches nothing.
UPDATE analyses SET
  frame_urls = CASE WHEN frame_urls IS NULL THEN NULL ELSE
    array(SELECT replace(u, 'http://localhost:3000', 'https://www.learnhoops.com') FROM unnest(frame_urls) u)
  END,
  video_url = replace(video_url, 'http://localhost:3000', 'https://www.learnhoops.com')
WHERE COALESCE(frame_urls[1], '') LIKE 'http://localhost%'
   OR COALESCE(video_url, '') LIKE 'http://localhost%';
