#!/bin/bash
# box-update.sh — self-contained deploy for the learnhoops "formcoach" Next.js app
# on this glibc-2.17 cPanel box (Passenger + Node 20, wasm-only swc).
# Idempotent: run as the learnhoops user any time to pull latest main and go live.
# Handles every box-specific quirk automatically, so no manual steps are needed:
#   - builds with webpack (Turbopack has no wasm bindings on this box)
#   - swaps the TS next.config for a CommonJS one (wasm-swc mis-transpiles .ts config)
#   - restarts via the standalone AppRoot's tmp/restart.txt (not the repo-root one)
#   - preserves .env.local + the start.js Passenger wrapper (the build wipes .next/)
#   - aborts before restarting if the build didn't produce a standalone server
set -euo pipefail

export PATH=$HOME/node20test/node-v20.18.1-linux-x64-glibc-217/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=1536
APP=$HOME/apps/formcoach
cd "$APP"
echo "node: $(node -v)  npm: $(npm -v)"

# --- preserve the Passenger startup wrapper (not in git; the build wipes .next/) ---
if [ -f .next/standalone/start.js ]; then
  cp -f .next/standalone/start.js "$HOME/start.js.deploybak"
fi
if [ ! -f "$HOME/start.js.deploybak" ]; then
  echo "FATAL: no start.js in standalone and no ~/start.js.deploybak to restore" >&2
  exit 1
fi

# --- pull latest main (origin fetch refspec is fixed to track all branches) ---
git fetch origin
git checkout -B main origin/main
echo "at commit: $(git rev-parse --short HEAD)"

# --- box config shim: neutralize the TS config, write an equivalent CommonJS one ---
# wasm-swc (forced by glibc 2.17) mis-compiles next.config.ts -> "Unexpected token
# 'export'". This CJS config needs no transpile. Keep in sync with the repo's
# next.config.ts if that changes upstream.
[ -f next.config.ts ] && mv -f next.config.ts next.config.ts.off || true
cat > next.config.js <<'CFG'
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() { return [{ source: '/:path*', headers: SECURITY_HEADERS }]; },
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
};
module.exports = nextConfig;
CFG

# --- install, migrate, build (webpack; Turbopack is unsupported on this box) ---
npm ci --no-audit --no-fund
npm run migrate
./node_modules/.bin/next build --webpack

# --- verify the standalone server exists BEFORE cutting over -------------------
if [ ! -f .next/standalone/server.js ]; then
  echo "FATAL: .next/standalone/server.js missing after build — NOT restarting" >&2
  exit 1
fi

# --- reassemble standalone (the build wipes these) ----------------------------
mkdir -p .next/standalone/public .next/standalone/.next/static .next/standalone/tmp
cp -a public/. .next/standalone/public/
cp -a .next/static/. .next/standalone/.next/static/
cp -f .env.local .next/standalone/.env.local
cp -f "$HOME/start.js.deploybak" .next/standalone/start.js

# --- sharp: restore the wasm fallback the standalone tracer drops -------------
# glibc here is 2.17, so sharp's native linux-x64 binary cannot dlopen (it wants
# GLIBCXX_3.4.20) and sharp falls back to @img/sharp-wasm32. The tracer copies
# that package's .js but not its sibling .wasm, so require('sharp') throws in
# production and /_next/image serves the raw multi-MB original or 502s.
cp -a node_modules/@img/. .next/standalone/node_modules/@img/
# maxmind (geo currency /api/region) is dropped by the tracer too — copy it + deps
cp -a node_modules/maxmind node_modules/mmdb-lib node_modules/tiny-lru .next/standalone/node_modules/ 2>/dev/null || true

# --- drop the optimized-image cache -------------------------------------------
# Failed optimizations get cached as full-size passthroughs and keep serving
# after sharp is healthy again.
rm -rf .next/standalone/.next/cache/images

# --- restart Passenger (AppRoot is the standalone dir) ------------------------
touch .next/standalone/tmp/restart.txt

# --- health check against the real vhost --------------------------------------
sleep 3
for p in / /login; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' --max-time 60 \
    --resolve learnhoops.com:443:192.145.235.207 "https://learnhoops.com$p" || true)
  echo "health $p -> $code"
done

# Image optimizer: a broken sharp still answers 200, just with the unresized
# original, so check the content type rather than the status code.
img=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' -A 'Mozilla/5.0' \
  -H 'Accept: image/avif,image/webp,image/*' --max-time 60 \
  --resolve learnhoops.com:443:192.145.235.207 \
  'https://learnhoops.com/_next/image?url=%2Ftraining-ball.png&w=828&q=75' || true)
echo "health /_next/image -> $img"
case "$img" in
  *webp*|*avif*) ;;
  *) echo "WARNING: image optimizer is not producing webp/avif — sharp is broken" >&2 ;;
esac

echo '=== BOX UPDATE DONE ==='
