# Path A — run learnhoops.com on the cPanel box (Passenger/Node)

The app is a Next.js 16 Node app. It can only run on this account once the
**Application Manager (Passenger) with Node.js** is enabled — verified missing
on 2026-08-11 (the account API returned *"You do not have the feature
passengerapps"*; plan offers PHP 5.5–8.2 only). Database (Neon) and video
storage (R2) stay external — see MIGRATION.md.

## Step 0 — what the hosting provider must enable (only they can)

Send them the request in the chat. It must turn on, for the `learnhoops` account:
- **Application Manager / Phusion Passenger with a Node.js runtime (Node 20+)** —
  Next.js 16 requires Node 20+.
- **cPanel Terminal** (or SSH with our IP whitelisted) — needed to run
  `npm ci` and `next build` on the box.
- Confirm the per-process **memory limit** (the build needs ~1–2 GB) and the
  **proxy request timeout** (the analysis endpoint runs up to 300s —
  `app/api/analyze/route.ts` `maxDuration = 300`; a short Passenger/Apache
  timeout will kill it).

## Step 1 — secrets (only you can)

    npm i -g vercel && vercel env pull .env.local

Brings every secret over (`DATABASE_URL`=Neon, `ANTHROPIC_API_KEY`,
`STRIPE_*`, `TWILIO_*`, `RESEND_API_KEY`, `JWT_SECRET`, `META_*`, `YOUTUBE_*`)
plus the storage vars from MIGRATION.md. These get entered into Application
Manager's env-var UI for the app.

## Step 2 — get the code on the box

Use cPanel **Git Version Control** to clone `jandj-tech/formcoach` (needs a
deploy token for the private repo), or upload a build. App root e.g.
`/home/learnhoops/apps/formcoach`.

## Step 3 — build (via Terminal/SSH once enabled)

    cd ~/apps/formcoach
    npm ci
    STORAGE_DRIVER=s3 npm run build   # runs migrate.ts against Neon, then next build

Recommended: add `output: 'standalone'` to `next.config.ts` so Passenger runs
the self-contained `.next/standalone/server.js`. **Verify this against THIS
(modified) Next 16 at build time** — docs aren't shipped in node_modules, so
don't assume upstream behavior.

## Step 4 — register the Passenger app

In Application Manager: app root = the repo dir, **application startup file** =
`.next/standalone/server.js` (standalone) or a small `server.js` that boots
Next, Node version 20+, environment = production. Add all env vars from Step 1.
Passenger mounts it at the domain root.

## Step 5 — cutover (DNS LAST)

Test on the box's temporary hostname first; repoint `learnhoops.com` DNS only
after login/upload/analysis/Stripe/email all pass; keep Vercel as instant
rollback until you cancel it. Full checklist in MIGRATION.md.

## Known risks on shared hosting

- **300s analysis** may exceed the Passenger/Apache proxy timeout → confirm the
  limit with the provider; may need the analysis moved to a background job.
- **Build memory** on a shared plan may be too low for `next build`.
- Entry-process / CPU caps under load.
