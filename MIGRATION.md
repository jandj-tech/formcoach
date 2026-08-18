# Moving learnhoops.com off Vercel — $0/month

Goal: stop paying Vercel, without paying anything new and without rewriting the
app. The app runs unchanged on a free host; the database and video storage move
to free external services. Your existing cPanel is not a host for this app (it
runs PHP, not Node, and has no Postgres) — use it for the old PHP site instead.

Final bill after this: **cPanel only** (what you already pay). Vercel: cancelled.

---

## What only you can do (≈10 minutes, all free, no card required)

Create three accounts and paste the credentials into the new host's env vars:

1. **Neon** (https://neon.tech) — free Postgres. Create a project, copy the
   connection string (looks like `postgres://user:pass@host/db?sslmode=require`).
   This becomes `DATABASE_URL`.
2. **Cloudflare R2** (https://dash.cloudflare.com → R2) — free 10 GB object
   storage. Create a bucket (e.g. `learnhoops`), then create an R2 API token
   (Access Key ID + Secret). Enable a public dev URL or connect a custom
   domain for the bucket so uploaded frames are publicly readable.
3. **Render** (https://render.com) or **Netlify** (https://netlify.com) — free
   Node host. Connect this GitHub repo, pick "Next.js", and it deploys on push
   just like Vercel.

That's the whole manual part. Everything below is code/config I can drive.

---

## Environment variables to set on the new host

Copy every existing Vercel env var over, then change/add these:

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `learnhoops` |
| `S3_ACCESS_KEY_ID` | R2 access key id |
| `S3_SECRET_ACCESS_KEY` | R2 secret |
| `S3_PUBLIC_BASE_URL` | public base URL of the bucket (e.g. `https://cdn.learnhoops.com`) |
| `NEXT_PUBLIC_BASE_URL` | `https://learnhoops.com` (fixes email links; replaces the Vercel `VERCEL_URL` fallback) |

Keep all the others as-is: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`,
`TWILIO_*`, `RESEND_API_KEY`, `JWT_SECRET`, `META_*`, `YOUTUBE_*`, etc.

---

## Code: the R2 storage driver

The app already routes all server-side storage through `lib/storage.ts`. To
activate R2, add `@aws-sdk/client-s3` and fill in the `s3` branch:

```bash
npm i @aws-sdk/client-s3
```

```ts
// lib/storage.ts — replace the two notImplemented() calls with:
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.S3_BUCKET!
const PUBLIC = process.env.S3_PUBLIC_BASE_URL!

// in putObject, s3 branch:
await s3.send(new PutObjectCommand({
  Bucket: BUCKET, Key: key, Body: data as Buffer, ContentType: opts?.contentType,
}))
return { url: `${PUBLIC}/${key}` }

// in deleteObjects, s3 branch: map each url back to its key and DeleteObjectCommand
const keys = (Array.isArray(urls) ? urls : [urls]).map(u => u.replace(`${PUBLIC}/`, ''))
await Promise.all(keys.map(Key => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }))))
```

## Code: the one remaining Vercel-specific piece — video upload

`app/api/upload-video/route.ts` uses `@vercel/blob/client` `handleUpload` for
direct browser→storage upload (bypassing the serverless body-size limit). R2
needs a presigned-PUT equivalent:

- Server: return a presigned PUT URL via `@aws-sdk/s3-request-presigner`
  (`getSignedUrl(s3, new PutObjectCommand({Bucket, Key}), { expiresIn: 600 })`).
- Client (`components/.../upload`): `PUT` the file to that URL, then use
  `${S3_PUBLIC_BASE_URL}/${key}` as the video URL posted to `/api/analyze`.

This is the only real code change beyond the driver; I can do it once the R2
bucket exists so it's testable.

---

## Data migration (Postgres → Neon)

Option A (has data to keep): `pg_dump "$OLD_DATABASE_URL" | psql "$NEON_URL"`.
Option B (fresh): the build already runs `scripts/migrate.ts`; point
`DATABASE_URL` at Neon and it creates the schema on first deploy.

Existing video/frame files on Vercel Blob can be left to expire or bulk-copied
to R2; frames are regenerated per analysis, so only submitted videos matter.

---

## Cutover (do DNS LAST — this is what avoids downtime)

1. Deploy to Render/Netlify. It gives you a temp URL like
   `learnhoops.onrender.com`. **Vercel is still live and serving the domain.**
2. Test everything on the temp URL: login, upload, analysis, Stripe, email.
3. Only when it all works, repoint DNS: at your domain registrar, change the
   `learnhoops.com` records from Vercel's to the new host's target. TTL means
   it propagates over minutes to a couple hours; the old site keeps serving
   until it flips.
4. Watch the new site take traffic, confirm it's healthy, then **cancel the
   Vercel project**.
5. Rollback if needed: point DNS back at Vercel — instant safety net until you
   cancel.

## Meanwhile, the cPanel

Put the archived PHP site (`~/old-site-storage/`) on it so the box you pay for
isn't idle. That's what PHP shared hosting is for.
