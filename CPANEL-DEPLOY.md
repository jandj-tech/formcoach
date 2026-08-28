# Path A — run learnhoops.com on the cPanel box (Passenger/Node)

> **STATUS (2026-08-28): HISTORICAL — this path was taken and then abandoned.**
> The box ran learnhoops.com for roughly a week (last box-era upload
> 2026-08-28T00:36Z) and production is now **back on Vercel**. Nothing here is
> a current deploy instruction: deploys happen on `git push` to `main`, and
> `scripts/box-update.sh` is dead tooling.
>
> Kept, not deleted, because it is the only record of why the box behaved the
> way it did (glibc 2.17 vs prebuilt native binaries, wasm-swc, the sharp
> `@img` copy, the image-cache wipe). If the box is ever revived, start here —
> and re-verify every claim, since the box itself has drifted.
>
> Still load-bearing in the app source, so do not "clean it up":
> - `next.config.ts` gates `output: 'standalone'` behind `!process.env.VERCEL`.
>   On Vercel that gate must stay — standalone output breaks Vercel's
>   file-tracing step (`ENOENT .next/next-server.js.nft.json`).
> - `outputFileTracingIncludes` for `lib/geo/country.mmdb` is needed on Vercel
>   too, since the raw `fs.readFileSync` in `lib/region.ts` is untraceable.


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

## Day-to-day deploys — `scripts/box-update.sh`

Once the box is set up, deploys run one script:

    ssh learnhoops-box 'bash ~/box-update.sh'

Use the `learnhoops-box` ssh-config alias. The bare `learnhoops@<ip>` form skips
the `IdentityFile` and fails with `Permission denied (publickey)`.

**`scripts/box-update.sh` in this repo is the source of truth, but the box runs
its own copy at `~/box-update.sh`.** Nothing syncs them automatically — after
editing the script here, push it to the box:

    scp scripts/box-update.sh learnhoops-box:box-update.sh

The script is checked in because it encodes fixes that are invisible in the app
source and that a rebuilt box would silently lose. It is idempotent; re-run it
any time.

### Why the script looks strange

The box is glibc 2.17, which is older than several prebuilt native binaries
shipped in `node_modules`. Each workaround exists because the native path fails:

- **Builds with `--webpack`.** `@next/swc-linux-x64-gnu` needs `GLIBC_2.27` and
  cannot load, so swc falls back to wasm; Turbopack has no wasm bindings here.
  Expect a wall of `Attempted to load @next/swc-linux-x64-gnu` warnings in every
  build log — they are not failures.
- **Swaps `next.config.ts` for a generated CommonJS `next.config.js`.** wasm-swc
  mis-compiles the TS config (`Unexpected token 'export'`). Keep the generated
  config in sync if `next.config.ts` changes upstream.
- **Re-copies `node_modules/@img` into the standalone output.** `sharp`'s native
  binary needs `GLIBCXX_3.4.20` and falls back to `@img/sharp-wasm32`, but the
  standalone tracer copies that package's `.js` without its `.wasm`. Without this
  step `require('sharp')` throws and `/_next/image` either 502s under concurrent
  requests or silently serves the **unresized original** — a 2.25 MB PNG — with a
  `200`. This broke the shop gallery on 2026-08-26.
- **Wipes `.next/standalone/.next/cache/images`.** Failed optimizations are
  cached as full-size passthroughs and keep serving after sharp is healthy again.

### Health checks

The script aborts before restarting if the build produced no standalone server,
then checks the live vhost after the restart. The image check asserts the
**content type**, not the status code, because a broken optimizer still answers
`200` — just with the original bytes. A good run ends:

    health / -> 200
    health /login -> 200
    health /_next/image -> 200 image/webp
    === BOX UPDATE DONE ===

`image/png` on that last line means sharp is broken again.
