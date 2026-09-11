# FORGE

A habit tracker with a FastAPI backend, MongoDB, and a React frontend, self-hosted behind Traefik and a Cloudflare Tunnel. It runs at [forge.zerp.me](https://forge.zerp.me).

The app began as a generated scaffold. The first commit is that scaffold, squashed from the 60 machine-written commits it arrived as and left attributed to the generator; every commit after it is hand-written. It worked well enough to demo and badly enough to be unusable: the production frontend was compiled without an API host and nobody could sign in, the streak counter read zero every morning, and the service worker had never successfully cached anything. Most of the work in this repository is the audit that followed, and the decisions below came out of specific failures rather than from a design document.

## Architecture, and why

### The frontend's API host is asserted in the compiled bundle, not just passed to the build

Production served a frontend with no API host. Every request resolved to `/undefined/api/...`, hit the nginx SPA fallback, and came back as HTML with a 200 status. The backend was healthy the whole time and the build had succeeded.

The obvious fix is to pass `VITE_BACKEND_URL` as a Docker build argument, since Vite inlines it at compile time and a runtime `env_file` cannot reach it. I did that, and then added a check that the argument is non-empty. That check is necessary and not sufficient: a value can be supplied and still not reach the compiler. So after `yarn build`, the image greps the emitted JavaScript and fails unless it contains the expected host ([`frontend/Dockerfile:38-54`](frontend/Dockerfile)).

The assertion is positive on purpose. While investigating the outage I grepped the live bundle for `undefined/api`, found nothing, and nearly concluded the deployment was fine. The minifier had folded the concatenation to `void 0+"/api"`, joined at runtime, which no search for the literal string would ever find. A negative assertion only holds if the searcher can predict how the toolchain will mangle the thing being searched for. A positive one does not depend on that.

What it cost: the image is no longer environment-agnostic. One image per API host, and the same bundle cannot be promoted from staging to production. The assertion is also coupled to how Rollup emits string literals, so a change in that area breaks the build rather than the app — which is the direction I wanted, but it is a real maintenance cost.

### The Fernet key is derived from the configured secret rather than being one

Each account stores its own OpenAI key, so the key has to be recoverable rather than hashed. Fernet is the obvious choice, and it requires exactly 32 url-safe-base64 bytes.

The `ENCRYPTION_KEY` already deployed decodes to 48 bytes. It had been generated with `openssl rand -hex 32`, which is a perfectly good secret and not a Fernet key. Taking the textbook path would have meant `Fernet(ENCRYPTION_KEY)` raising at import, which is how the feature would have shipped: correct-looking in review, dead on arrival in production, and only discoverable by a user trying to save a key.

Instead the Fernet key is derived: `Fernet(urlsafe_b64encode(sha256(ENCRYPTION_KEY).digest()))` ([`backend/security.py:18-27`](backend/security.py)). SHA-256 is a weak KDF, which does not matter here because the input is already a high-entropy random secret rather than a user password. Determinism is the property that matters — restarts must be able to read ciphertext written before them.

What it cost: a non-standard construction that a future reader has to stop and understand, and a rotation story that is quieter than it should be. Rotating `ENCRYPTION_KEY` does not raise; `decrypt_value` returns `None` and every affected account silently reads as having no key on file ([`backend/security.py:48-57`](backend/security.py)). That degradation is deliberate — one unreadable key should not crash an unrelated insight request — but it means a botched rotation looks like users mass-deleting their keys.

### One date authority, and day arithmetic that a DST transition cannot move

Every client date came from `new Date().toISOString()`, which is UTC, while the server stamped completions with the timezone stored on the user record. For anyone not on UTC there was a window each day where the dashboard queried one date and the server had written another, and the checkmark appeared to reset.

The obvious fix is to send the client's timezone along with each request. I made the account timezone the single source instead, with all day arithmetic in [`frontend/src/utils/date.js`](frontend/src/utils/date.js) operating on UTC-midnight dates constructed from `YYYY-MM-DD` strings. Doing the arithmetic at UTC midnight is what makes a DST transition unable to shift a day boundary; doing it on local `Date` objects does not survive the hour that repeats. The server mirrors this in `get_user_today` ([`backend/logic.py:46-53`](backend/logic.py)). I checked it with `Pacific/Midway` while UTC was a day ahead.

The same pass found the streak reading zero every morning: `compute_global_streak` stopped at the first incomplete day starting from today, so a 30-day streak showed as 0 from midnight until the last habit was ticked. Today is now a grace day — it extends the streak when complete, is forgiven when not, and any earlier gap still ends it ([`backend/logic.py:70-112`](backend/logic.py)).

What it cost: native `Date` arithmetic and locale handling are off the table, day maths runs on string keys, and every query site now has to resolve a timezone. Seven `try/except ZoneInfo` blocks across `server.py`, `logic.py` and `achievements.py` are the visible price of that.

### The database holds the one invariant that matters

A double-tap on a habit, or two tabs open, could write two completions for the same habit on the same day, which inflates points, streaks and achievements.

The obvious guard is to check for an existing row before inserting. That check is still there because it avoids an exception in the common case, but it is advisory — between the read and the write, anything can happen. The guard is a unique index on `(user_id, habit_id, date)` ([`backend/db.py:14-16`](backend/db.py)). The endpoint catches `DuplicateKeyError` and returns the row that won rather than raising, which makes the POST idempotent ([`backend/server.py:401-424`](backend/server.py)).

What it cost: recording a habit more than once a day is now impossible by construction, which forecloses a feature someone will eventually want. The lost race also pays a failed round trip to Mongo. Worse, index creation is wrapped in a `try/except` so that pre-existing duplicate data cannot crash startup — and the fallback is a *non-unique* index ([`backend/db.py:13-24`](backend/db.py)). The concurrency guard can therefore disappear at boot, leaving a warning in the log and an endpoint that looks fine.

### Charts are hand-drawn SVG, and colour is a test failure rather than a review comment

Recharts was the heaviest dependency in the tree and was imported for one area chart and one bar chart. It also hardcoded its grid and axis colours per theme (`stroke="#374151"`), so it was wrong in one of the two themes by construction. Replacing it with hand-drawn SVG that reads the same tokens as everything else removed the dependency and fixed the theming in the same change.

That only works if the tokens themselves hold, and they did not. A bulk replacement of `bg-orange-50` with `bg-accent-soft` also matched inside `bg-orange-500`, leaving `bg-accent-soft0` on 24 elements. Tailwind emits nothing at all for an unknown class, so those elements lost their colour with no error in the build, in lint, or in review. [`frontend/src/tokens.test.js`](frontend/src/tokens.test.js) now parses every source file and rejects malformed token names, raw palette steps, and orphaned `dark:` variants. [`frontend/src/contrast.test.js`](frontend/src/contrast.test.js) checks the palette against WCAG AA in both themes.

What it cost: both tests parse source with regular expressions, so they are brittle and will reject legitimate new patterns until someone updates the allowed list. Ad-hoc one-off colours are banned outright. And `contrast.test.js` states in its own comment what it cannot see — a component that pairs two individually valid tokens badly, such as white text on a light fill, passes it.

## Running it

The test suite needs no configuration. Everything else needs `backend/.env`, which is gitignored.

```bash
git clone https://github.com/kritish08/forge.git && cd forge
```

Backend:

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt   # -r requirements.txt has no pytest
.venv/bin/python -m pytest                      # 57 pass, 18 integration tests deselected
```

`requirements.txt` alone is enough to run the server but not to test it — pytest and pyflakes live in `requirements-dev.txt` so they stay out of the production image. Installing the wrong one gives you `No module named pytest`.

To start the server, create `backend/.env` with at least `MONGO_URL`, `DB_NAME` and `JWT_SECRET_KEY`. Without `MONGO_URL` the import fails immediately with `KeyError: 'MONGO_URL'` from [`backend/db.py:5`](backend/db.py), before any server starts.

```bash
.venv/bin/uvicorn server:app --reload --port 8001
```

Frontend:

```bash
cd frontend
yarn install
yarn test                                        # 66 pass, no env needed
VITE_BACKEND_URL=http://localhost:8001 yarn dev  # http://localhost:3000
```

`VITE_BACKEND_URL` is required and its absence is silent. `yarn build` with the variable unset **succeeds** — it does not warn — and emits a bundle whose axios base URL is `undefined + "/api"`, so every request goes to `/undefined/api/...` and the dev server answers with the app shell instead of JSON. The Docker build refuses this; a bare `yarn build` does not.

Docker, for production:

```bash
DOMAIN_NAME=example.com docker compose -f compose.yaml up -d --build
```

The `-f compose.yaml` is load-bearing. `compose.dev.yaml` has to be asked for by name because Compose auto-merges any file called `docker-compose.override.yml` into a bare `docker compose` command, which is how a `localhost` API host once got compiled into a production image. `DOMAIN_NAME` must be set — see the first item under "What's imperfect" for what happens when it is not. Full deployment notes are in [DEPLOYMENT.md](DEPLOYMENT.md).

## What's imperfect

**An unset `DOMAIN_NAME` passes every build guard.** Compose interpolates it into `VITE_BACKEND_URL: https://api-${DOMAIN_NAME}`, so an unset variable yields the non-empty string `https://api-`. I built a bundle with that value and ran the Dockerfile's three checks against it by hand: the non-empty test passes, the bundle does contain `https://api-`, and there is no `undefined/api`. All three pass and the shipped app points at an invalid host. The guard I wrote for the original outage does not cover its nearest neighbour.

**The scheduler's two jobs have opposite failure modes, and the comments claim otherwise.** `daily_reminder_job` sends and then records the send ([`backend/notifications.py:131-166`](backend/notifications.py)), so a crash in between re-sends on the next tick. `weekly_summary_job` records first and then sends ([`backend/notifications.py:191-193`](backend/notifications.py)), so a crash in between drops the email. Both are at-least-once and at-most-once respectively; both comments describe them as firing exactly once. Neither ordering is wrong on its own, but I have not decided which each job should have, so the code and its documentation currently disagree.

**Running more than one backend replica would double every notification.** APScheduler runs in-process ([`backend/server.py:806-813`](backend/server.py)) and the dedupe is a read-then-write rather than a conditional update, so two instances would both find the slot unsent and both send. `compose.yaml` pins `container_name`, which makes horizontal scaling fail loudly rather than quietly, but nothing states the constraint.

**`achievements` has no index at all.** It is absent from [`backend/db.py`](backend/db.py) while being queried in five places, including on every check-in via `check_and_award_achievements`. Every one of those is a collection scan. Its dedupe is a read-then-insert with no unique index behind it, so concurrent check-ins award the same badge more than once. Four simultaneous completions against a fresh account produced five achievement rows for three distinct achievements — `first_checkin` three times and `perfect_day` twice. This is the lesson from the completions index, not carried across.

**Rate limits are shared across all clients, not applied per client.** slowapi keys on `get_remote_address`, which returns `request.client.host`. uvicorn does rewrite that from `X-Forwarded-For` — `proxy_headers` defaults to `True`, so my first reading of this was wrong — but only when the immediate peer appears in `forwarded_allow_ips`, which defaults to `127.0.0.1`. Traefik reaches the backend over a Docker bridge network and is therefore not trusted, so every request keys to Traefik's address. Running the app with the peer outside the trust list, twenty logins carrying twenty distinct `X-Forwarded-For` values hit the 429 at request sixteen: one 15-per-minute bucket for all of them. In production that means three password-reset requests per hour and fifteen logins per minute for the entire internet combined, and one user can lock everyone out of sign-in. The fix is `--forwarded-allow-ips` set to the proxy network ([`compose.yaml:28`](compose.yaml)), not `--proxy-headers`, which is already on.

**`PUT /habits/{id}` does not clamp priority, and `POST /habits` does.** `create_habit` bounds it to 1–3 ([`backend/server.py:346`](backend/server.py)); `update_habit` writes whatever arrives ([`backend/server.py:359-361`](backend/server.py)), and `points_earned` is snapshotted from it at completion time ([`backend/server.py:413`](backend/server.py)). Run against a database: creating a habit with `priority: 9999` stores 3, then updating the same habit to `priority: 9999` returns 200 and stores it, and the next check-in is worth 9999 points — enough to reach level 10 of 10 from a single tap.

**The access token sits in `localStorage` with a 24-hour lifetime and no revocation.** The refresh token is an httpOnly cookie, but the credential that authorises every request is readable by any script on the page, and nothing on the server can invalidate it — logout and password reset both clear refresh tokens only. There is also no Content-Security-Policy, or any other security header, anywhere in [`frontend/nginx.conf`](frontend/nginx.conf).

**The push endpoint is validated against the internal network, not DNS-rebinding-proof.** A stored push subscription is attacker-controlled and the server POSTs to it, which was an authenticated SSRF that reflected the target's response body to the caller. The endpoint is now required to be https and to resolve entirely off the private, loopback, link-local and reserved ranges, checked both when it is stored and again before each send ([`backend/notifications.py`](backend/notifications.py), `push_endpoint_is_safe`); the test endpoint no longer returns the upstream body. Resolution happens at check time and again in the HTTP client, so a determined DNS-rebinding attacker keeps a narrow window — closing it fully needs connection-level IP pinning that pywebpush does not expose.

**The service worker's cache is never purged.** `activate` deletes caches whose name differs from `CACHE`, but that name is the constant `forge-v2` ([`frontend/public/service-worker.js:24`](frontend/public/service-worker.js)), so hashed assets from every past deploy accumulate indefinitely. The same file promises a precache manifest "with the Vite migration and vite-plugin-pwa"; the Vite migration shipped and `vite-plugin-pwa` was never added.

**Most of the read path loads entire histories into memory.** `/analytics/stats`, `/analytics/patterns`, `/ai/insight`, `check_and_award_achievements` and the daily reminder job each pull a user's complete completion history with `.to_list(10000)` and aggregate in a Python loop. There is no aggregation pipeline and no pagination. This is adequate at the current size and is the first thing that would break under real load.

**Unmeasured.** The `?since=` parameter on `/completions`, the client-side cache, and parallel habit creation during onboarding were all changed for speed and none were benchmarked before or after. The client cache also has no expiry — `useCachedQuery` writes a timestamp on every entry and never reads it, so entries live until an explicit invalidation or a page reload.

**No end-to-end tests.** The only suite that exercises HTTP routes is marked `integration` and deselected by default, so CI covers pure logic, token handling, encryption and render smoke tests. Nothing tests authorisation — no test asserts that one user cannot modify another's habit, even though that rule is enforced in query filters across five endpoints.

## Stack

- Python 3.11, FastAPI, Motor, APScheduler, slowapi, python-jose, passlib/bcrypt, cryptography
- React 19, Vite 6, Tailwind CSS 3, React Router; seven runtime dependencies total
- MongoDB (Atlas in production)
- Vitest and Testing Library; pytest and pyflakes
- Docker, nginx, Traefik, Cloudflare Tunnel
- GitHub Actions: pytest, a pyflakes undefined-name gate, vitest, eslint and a production build on every push. eslint is its own step rather than part of the build, because Vite — unlike Create React App under `CI=true` — does not lint during compilation, so nothing would otherwise fail on a lint error.
- OpenAI, per-account key, supplied by the user

## Licence

No licence file is present, so default copyright applies and no permissions are granted.
