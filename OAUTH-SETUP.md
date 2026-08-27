# Sign in with Google / Apple — setup and release runbook

The code is written and both projects typecheck and build. Nothing below is
optional-but-nice: until the console work and the environment variables are
done, the buttons render and then bounce back with
`?error=oauth_unavailable`. Email + password keeps working the whole time, so
there is no window where sign-in is broken.

**Order matters.** The website must be live with working providers *before* the
app build is submitted, because App Review taps those buttons and they call
production.

---

## What was built

**Website (`formcoach`)**

| File | What it does |
| --- | --- |
| `scripts/migrate-oauth.sql` | `user_oauth_identities`, `oauth_login_codes`, `users.password_hash` explicitly nullable |
| `lib/oauth.ts` | Provider URLs, ID-token verification against Google/Apple JWKS, Apple client-secret minting and token revocation |
| `lib/oauth-account.ts` | Verified identity → session; account linking; one-time codes for the app |
| `app/api/auth/oauth/[provider]/start` | Begins the flow (`?mode=mobile` for the app) |
| `app/api/auth/oauth/[provider]/callback` | `GET` for Google, `POST` for Apple's form_post |
| `app/api/auth/oauth/[provider]/native` | Apple's native iOS sign-in |
| `app/api/auth/oauth/exchange` | Trades the app's one-time code for a session JWT |
| `components/OAuthButtons.tsx` | The two buttons, on `/login` and `/signup` |

**App (`learnhoops-mobile`)**

| File | What it does |
| --- | --- |
| `components/SocialAuthButtons.tsx` | Apple's official button + a Google button |
| `lib/api.ts` | `appleSignIn()` (native sheet), `googleSignIn()` (system browser) |
| `app/auth.tsx` | Catches the `learnhoops://auth` deep link if the browser already closed |
| `app.json` | `usesAppleSignIn: true`, `expo-apple-authentication` plugin, build number 22 |

### How accounts are matched

1. A provider identity we have seen before → that account. (This is the only
   thing that recognises an Apple private-relay user on their second visit.)
2. Otherwise, the **verified** email is looked up in the same order password
   login uses: organization → team → additional coach → player. A coach who
   taps "Continue with Google" lands on their coach dashboard.
3. No match → a new player account with no password.

An unverified email is never used to find an existing account — that is the
exact hole that turns social login into account takeover.

---

## 1. Google credentials (~10 minutes)

1. <https://console.cloud.google.com> → your project → **APIs & Services →
   OAuth consent screen**. External. Fill in app name, support email, logo,
   the privacy policy URL `https://www.learnhoops.com/privacy`, and the
   authorized domain `learnhoops.com`.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origin: `https://www.learnhoops.com`
   - Authorized redirect URI:
     `https://www.learnhoops.com/api/auth/oauth/google/callback`
3. Copy the client ID and client secret.

You only need scopes `openid email profile`, which are non-sensitive — so **no
Google verification review is required** and the consent screen can be published
immediately.

There is deliberately no separate iOS client: the app runs this same web client
inside a system browser, which is what Google requires of native apps anyway.

## 2. Apple credentials (~30 minutes, plus DNS wait)

At <https://developer.apple.com/account/resources>:

1. **Identifiers → App IDs → `com.learnhoops.app`** → tick **Sign In with
   Apple** → Save. (Without this the app build's entitlement is invalid.)
2. **Identifiers → + → Services IDs.** Description "LearnHoops Web", identifier
   something like `com.learnhoops.web` — this is *not* the bundle id. Enable
   **Sign In with Apple → Configure**:
   - Primary App ID: `com.learnhoops.app`
   - Domains: `www.learnhoops.com`
   - Return URL:
     `https://www.learnhoops.com/api/auth/oauth/apple/callback`
3. Apple gives you `apple-developer-domain-association.txt`. Put it at
   `public/.well-known/apple-developer-domain-association.txt` in this repo,
   deploy, then press **Verify**. (Create the `.well-known` folder — it does not
   exist yet. Next serves `public/` as-is, so no config is needed.)
4. **Keys → + →** enable **Sign In with Apple**, configure it against the
   primary App ID, and download the `.p8`. **You can only download it once.**
   Note the Key ID shown next to it, and your Team ID (top right of the portal).

## 3. Environment variables

Add to production (`.env.local` on the cPanel box at `192.145.235.207`, and to
the Vercel project if you keep it as the rollback):

```
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
APPLE_SERVICES_ID=com.learnhoops.web
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
```

The whole `.p8` file including the BEGIN/END lines. Escaped `\n` also works if
your host dislikes multi-line values.

You do **not** need to fix `NEXT_PUBLIC_BASE_URL` on the box first. Redirect URIs
go through `lib/base-url.ts`, which refuses the stale `formcoach-psi.vercel.app`
value still sitting in Application Manager and falls back to
`https://www.learnhoops.com`. Worth correcting that variable anyway, but it is
not a blocker for this feature.

## 4. Database

`npm run build` runs the migrations, so a normal deploy applies
`migrate-oauth.sql` on its own. To do it ahead of time:

```bash
npm run migrate
```

The file is idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP NOT NULL`), so
running it twice is harmless. It adds two tables and touches no existing data.

## 5. Deploy the website

```bash
ssh learnhoops@192.145.235.207 'bash ~/box-update.sh'
```

Then check, signed out, in a private window:

- `/login` and `/signup` show both buttons above the password form
- Google → picks an account → lands on `/dashboard`
- Apple → including **Hide My Email** → lands on `/dashboard`
- Sign in with Google using the address of an existing password account →
  lands in *that* account, with its analyses and credits, not a new one
- A coach's address → `/team/dashboard`
- Password login still works, including for accounts that never touch a provider

---

## 6. Build and submit the app

**Do this only once the website above is verified.**

```bash
cd "/Users/joseph/Basketball AI/learnhoops-mobile"
```

1. **Refresh credentials first.** The new `usesAppleSignIn` entitlement means
   the old provisioning profile no longer matches. Let EAS regenerate it:

   ```bash
   eas credentials
   ```

   (Select iOS → production → let it sync. A build with a stale profile fails
   with a signing error that does not mention Sign in with Apple at all, which
   is a bad half-hour to spend.)

2. **Build.**

   ```bash
   eas build --platform ios --profile production
   ```

   Or push and let the existing GitHub Actions workflow do it.

3. **Test the build on a real device** via TestFlight before submitting —
   `expo-apple-authentication` cannot work in Expo Go, so this is the first
   point at which Apple sign-in is actually exercised.

4. **Submit the binary.**

   ```bash
   eas submit --platform ios --latest
   ```

   `eas.json` already has your Apple ID and `ascAppId 6770092311`.

5. **App Store Connect** → LearnHoops → **+ Version 1.1.0**:
   - Attach build 22.
   - What's New: *"Sign in with Apple and Google — get into your account in one
     tap, no password to remember."*
   - **App Privacy**: adding these does not change what you collect (still an
     email address, still linked to identity). If you already declare "Email
     Address → App Functionality", nothing to change.
   - **Sign in with Apple** appears under Account settings; confirm account
     deletion is still declared — the app already offers it and the server now
     revokes the Apple grant on delete, which is what Guideline 5.1.1(v)
     requires.
   - **App Review notes**: give them a working demo account, and add:
     *"This build adds Sign in with Apple and Google. Sign in with Apple is
     offered with equal prominence per Guideline 4.8. Deleting an account from
     Profile → Delete Account revokes the Sign in with Apple token server-side."*
   - Submit for review. Turn on **automatic release** unless you want to hold it.

Review is normally a day or two. If it comes back rejected, the two things
reviewers check on this feature are 4.8 (an equivalent privacy-preserving
option must be offered — Sign in with Apple is, and it is placed above Google)
and 5.1.1(v) (deletion must revoke). Both are handled.

### Android

The Play build is unaffected — the Apple button hides itself off iOS, and Google
works through the same browser flow. Ship it whenever; there is no equivalent of
Guideline 4.8 to satisfy.

---

## Known limits

- **A coach with several teams** who signs in with a provider lands on their
  first team and switches from the dashboard. The password flow asks which team
  up front; a redirect has no form to ask in.
- **Team codes** typed on the signup form are handed to the dashboard's existing
  join popup after the provider round trip, because joining needs a first name
  and last initial that no provider supplies. Ball-purchase credits and coach
  invite links *are* applied server-side and need no extra step.
- **Apple only sends a name once**, on the very first authorization. It is
  captured on that first request; if you ever wipe an account and the person
  signs in again, Apple sends nothing and they will have no nickname.
