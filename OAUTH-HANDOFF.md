# Google / Apple sign-in — session handoff

**Last updated:** 2026-08-27
**Read `OAUTH-SETUP.md` alongside this** — that file is the full runbook, this
file is *where we actually got to* and what is blocking.

If you are a fresh Claude session: the code is written, committed and verified.
What remains is console configuration in the Apple and Google developer portals,
which only the account owner can do, plus a deploy.

---

## 🔴 We are blocked here, right now

Configuring the **Services ID** in the Apple Developer portal.

The Services ID `com.learnhoops.web` has been **created**, but on its detail page
**no "Configure" button appears** next to the Sign In with Apple checkbox, so the
domain and return URL cannot be entered.

Last thing suggested, not yet confirmed working: tick **Sign In with Apple** →
**Save** (top right) → confirm the dialog → reopen the Services ID from the
Identifiers list; the Configure button normally appears only after that first
save.

**Next question to ask the user:** on the `com.learnhoops.web` page — is there a
**Save** or an **Edit** button top right, is the Sign In with Apple checkbox
ticked/greyed/unticked, and what text sits on that row? Their pasted screen text
has diagnosed two earlier problems faster than guessing did.

Alternative if it stays stuck: offer to look at the portal through their
logged-in Chrome (`mcp__claude-in-chrome`), read-only, asking before any click.

---

## Values collected so far

| Env var | Value | Status |
| --- | --- | --- |
| `APPLE_TEAM_ID` | `9UUL9KK2JH` | ✅ confirmed |
| `APPLE_KEY_ID` | `WRQ5VXZ542` | ✅ confirmed |
| `APPLE_PRIVATE_KEY` | `.p8` file, see below | ✅ verified it signs |
| `APPLE_SERVICES_ID` | `com.learnhoops.web` | ⚠️ created, not configured |
| `GOOGLE_OAUTH_CLIENT_ID` | — | ❌ not started |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | ❌ not started |

### The Apple private key

- File: `~/Documents/learnhoops-apple-key/AuthKey_WRQ5VXZ542.p8`
- ✅ Moved out of `~/Downloads` on 2026-08-27 and verified still importable.
  Permissions tightened to `600` on the file, `700` on the directory.
- **Never** put it in this repo. This repo is public.
- ⚠️ Its contents were pasted into a chat session on 2026-08-27. Rotating it is
  a ~2 minute job now that the App ID is set up correctly, and worth offering.
- Verified working: imports as ES256 and signs a valid Apple client secret with
  `iss=9UUL9KK2JH`, `sub=com.learnhoops.web`, `aud=https://appleid.apple.com`.
  So `appleClientSecret()` in `lib/oauth.ts` is proven, not assumed.

---

## Apple portal — what is already done

- ✅ **App ID `com.learnhoops.app`**: Sign In with Apple enabled, set as
  **primary** App ID. (This took two attempts — the first Save did not stick,
  and the symptom was "There are no identifiers available that can be associated
  with the key" on the Keys screen.)
- ✅ **Key** `Learnhoops Sign In` / `WRQ5VXZ542`, Sign in with Apple, downloaded.
- ✅ **Email relay** — Services → *Sign in with Apple for Email Communication*:
  both `learnhoops.com` (domain) and `noreply@learnhoops.com` (address)
  registered, both showing SPF status.
- ✅ **Services ID `com.learnhoops.web`** created.
- ❌ Services ID not configured (primary App ID / domain / return URL).
- ❌ Domain association file not downloaded, so **Verify** has not been attempted.

### Values the Services ID needs when Configure finally opens

- Primary App ID: `com.learnhoops.app`
- Domains and Subdomains: `www.learnhoops.com`
- Return URL: `https://www.learnhoops.com/api/auth/oauth/apple/callback`

Verification **will fail** until the downloaded file is live at
`https://www.learnhoops.com/.well-known/apple-developer-domain-association.txt`.
That is expected and is the deploy gate described below.

---

## Code state

Both repos are **committed but NOT pushed**. Nothing is on a remote, so nothing
can deploy yet.

### `formcoach`

- Branch: `fix/org-approval-link-resend` (**not** a branch I chose — other
  sessions kept switching branches under this working tree; see Gotchas)
- `beba329` — Sign in with Google and Apple
- `220440f` — OAuth exchange returns a readable error instead of a bare 500

Committed files: `lib/oauth.ts`, `lib/oauth-account.ts`,
`app/api/auth/oauth/**`, `components/OAuthButtons.tsx`,
`scripts/migrate-oauth.sql`, `scripts/migrate.ts`, `app/login/page.tsx`,
`app/api/auth/login/route.ts`, `app/api/auth/delete-account/route.ts`,
`OAUTH-SETUP.md`.

⚠️ **Two files were deliberately left uncommitted** because they hold another
session's in-progress Turnstile / anti-bot work *and* the OAuth changes:

- `app/signup/page.tsx` — contains the `<OAuthButtons>` block **and** Turnstile
- `.env.local.example` — contains the provider vars **and** the captcha vars

**Consequence:** deploying only `beba329`+`220440f` gives you the buttons on
`/login` but **not** on `/signup`. Whoever commits the Turnstile work sweeps up
the OAuth half automatically (`git add -A`).

### `learnhoops-mobile`

- Branch: `fix/analyze-frame-extraction`
- `710a36e` — Sign in with Google and Apple

Current `app.json`: **version `1.0.1`**, **buildNumber `22`**,
`usesAppleSignIn: true`, `expo-apple-authentication` plugin registered.

📌 An earlier chat message told the user to create version **1.1.0** in App Store
Connect. That is now **wrong** — another session set the version to **1.0.1**
("the 1.0.0 train is closed at Apple"). Use **1.0.1, build 22**.

---

## Verified working (don't re-litigate these)

Run against a real production build on a local port:

| Check | Result |
| --- | --- |
| `/api/auth/oauth/google/start` with no credentials | → `/login?error=oauth_unavailable` |
| `/api/auth/oauth/apple/start` with no credentials | → `/login?error=oauth_unavailable` |
| `/api/auth/oauth/facebook/start` | 404 |
| `native` on a non-Apple provider | 404 |
| `exchange` with a bad code | clean JSON error, not a bare 500 |
| Apple `.p8` → ES256 client secret | signs correctly |
| `npx tsc --noEmit`, `npx eslint`, `npx next build` (web) | pass |
| `npx tsc --noEmit` (app) | pass |

The first two matter: **the site can be deployed before any credentials exist.**
Buttons appear, fail politely, password login is untouched.

---

## Remaining steps, in order

1. **Finish the Apple Services ID** (the blocker above) and download the domain
   association file.
2. **Google Cloud Console** — OAuth consent screen (External, privacy URL
   `https://www.learnhoops.com/privacy`, authorized domain `learnhoops.com`),
   then Credentials → OAuth client ID → **Web application**:
   - JS origin `https://www.learnhoops.com`
   - Redirect URI `https://www.learnhoops.com/api/auth/oauth/google/callback`
   - Scopes are non-sensitive, so **no Google verification review is needed**.
3. **Put the Apple file** at
   `public/.well-known/apple-developer-domain-association.txt`
   (the `public/.well-known/` directory has already been created).
4. **Push and merge**, then deploy:
   `ssh learnhoops@192.145.235.207 'bash ~/box-update.sh'`
   The build runs `migrate-oauth.sql` automatically.
5. **Back in Apple** → click **Verify** → add the return URL → Save.
6. **cPanel Application Manager** → add the six env vars → restart.
   While there, `NEXT_PUBLIC_BASE_URL` is still the retired
   `formcoach-psi.vercel.app` and should be corrected to
   `https://www.learnhoops.com` — no longer a blocker (see Gotchas) but wrong.
7. **Test on the live site**, signed out: Google; Apple incl. *Hide My Email*;
   Google using an existing password account's address → must land in **that**
   account with its credits; a coach's address → `/team/dashboard`; password
   login still works.
8. **App**: `eas credentials` (regenerate the profile — the new entitlement
   invalidates the old one), `eas build --platform ios --profile production`,
   TestFlight on a real device, `eas submit --platform ios --latest`.
9. **App Store Connect** → version **1.0.1**, build **22**. Review notes must
   mention Guideline 4.8 (Sign in with Apple offered with equal prominence, and
   placed above Google) and 5.1.1(v) (account deletion revokes the Apple token
   server-side). Both are implemented.

---

## Gotchas found this session — do not re-discover these

1. **Concurrent sessions move the branches.** Other Claude sessions are working
   in both trees and checked out different branches three times while this work
   was uncommitted. That is why the commits landed on unrelated branch names.
   **Check `git branch --show-current` before assuming anything.**
2. **`NEXT_PUBLIC_BASE_URL` on the box is the retired
   `formcoach-psi.vercel.app`.** `lib/oauth.ts` originally read it directly,
   which would have built redirect URIs both providers reject. Fixed — it now
   goes through `lib/base-url.ts`, which refuses stale origins and falls back to
   `https://www.learnhoops.com`.
3. **`/api/auth/oauth/exchange` threw straight out of the handler** when
   `oauth_login_codes` was missing — a blank failure in the app, nothing in the
   log. Fixed in `220440f`.
4. **Root-domain SPF authorizes Google Workspace, not Resend.**
   `learnhoops.com` → `include:_spf.google.com`; the Resend/SES authorization
   lives on `send.learnhoops.com`. Mail delivers today via DKIM alignment, and
   Apple accepted the relay registration, but if *Hide My Email* users ever stop
   receiving mail, this is the first thing to check.
5. **App Store version is 1.0.1, not 1.1.0.** See above.
6. **Apple's portal caches hard.** "There are no identifiers available" on the
   Keys screen meant the App ID save had not stuck. Sign out and back in, not
   just a refresh.
7. A **GateGuard hook** in this environment demands a facts preamble before the
   first Bash call and before creating or first-editing any file. Just state
   callers / prior art / schemas / the verbatim user instruction, then retry the
   identical call.

---

## Design decisions worth not re-opening

- **No auth library.** Every account type (player, coach, org, admin) is already
  a `jose`-signed JWT in its own cookie. A framework would have wanted to own
  that. Providers hand back a verified identity; turning one into a session was
  a few lines of existing code.
- **An email is only trusted to find an existing account when the provider
  verified it.** Matching on an unverified address is how social login becomes
  account takeover.
- **Apple is native in the app, Google is not.** Google forbids embedded web
  views for native OAuth, so Google runs the website flow inside
  `ASWebAuthenticationSession` and returns through `learnhoops://auth` carrying a
  **one-time code**, never the session JWT — a JWT in a deep link is visible to
  the OS, any handler, and our own logs.
- **Account lookup order matches password login** (org → team → coach → player),
  so a coach signing in with Google lands on their coach dashboard.
- **Apple private-relay users are recognised by `sub`**, not email — their
  address matches nothing.

## Known limits (documented, deliberate)

- A coach with several teams lands on their first team and switches from the
  dashboard; the password flow asks up front, but a redirect has no form to ask in.
- Team codes typed at signup are handed to the dashboard's existing
  `?joinTeam=` popup, because joining needs a first name and last initial no
  provider supplies. Ball-purchase credits and coach invites **are** applied
  server-side with no extra step.
- Apple sends a user's name only on the very first authorization. It is captured
  then; wipe the account and sign in again and there is no nickname.
