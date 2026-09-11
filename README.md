# FORGE

A habit tracker: FastAPI + MongoDB + React, self-hosted behind Traefik and a Cloudflare Tunnel.
Live at **[forge.zerp.me](https://forge.zerp.me)**.

The product is a vehicle. What is worth reading here is the audit trail: this
started life as a generated scaffold — 59 of the 86 commits at the root of
history are machine-written `auto-commit` entries, and `.emergent/` still holds
the job manifest — and the work since has been turning that into something that
holds up in production. If you are evaluating whether I can reason about a system
I did not write, that is the part to read.

Start with `git log`. The commit messages carry the reasoning; this file is a map.

---

## Four problems worth your time

### 1. A green build that shipped a broken site

Production served a frontend compiled without an API host. Every request became
`/undefined/api/...`, hit the nginx SPA fallback, and came back as **HTML with a
200**. Nobody could sign in. The backend was healthy throughout, the build had
succeeded, and CI was green.

Root cause: Vite inlines `VITE_BACKEND_URL` at *build* time, `.dockerignore`
excludes `.env`, and compose was passing `env_file` to the *runtime* nginx
container. Nothing ever reached the compiler.

The fix that matters is not the build arg — it is that
[`frontend/Dockerfile`](frontend/Dockerfile#L38-L54) now asserts on the **output**:
the compiled JS must contain the expected host, and must not contain
`undefined/api`. Verified against all three shapes — correct build passes, missing
arg fails before wasting a compile, arg-present-but-not-reaching-the-build fails on
the output assertion.

The negative assertion alone is worthless, and that is the interesting part. While
investigating, I grepped the live bundle for `undefined/api`, found nothing, and
nearly cleared a deployment that was in fact broken — the minifier had folded the
concatenation to `void 0+"/api"`, joined at runtime. **Positive assertions survive
your toolchain; negative ones don't.**

### 2. A crash that passed lint, build, and every test

One entry in a list kept an emoji `icon` key after the rest became `Icon`
components. The page rendered `<undefined />` and threw React error #130. Lint
passed. The production build passed. All tests passed. The only thing that caught
it was loading the page.

[`frontend/src/screens.render.test.jsx`](frontend/src/screens.render.test.jsx)
now mounts all nine screens in jsdom, which catches the whole class: undefined
components, bad hook calls, destructuring undefined during first paint.

I confirmed it works by reintroducing the exact bug: the build still succeeds, the
render test fails with "Element type is invalid." A regression test you have not
watched fail is a guess.

### 3. Two silent-failure modes, turned into build failures

A bulk replace of `bg-orange-50` → `bg-accent-soft` also matched inside
`bg-orange-500`, leaving `bg-accent-soft0` on 24 elements. Tailwind emits nothing
for an unknown class, so the notification toggles lost their colour with no error
anywhere. Separately, raw palette steps creeping back in were what left ~40 colours
with no dark-mode variant to begin with.

Both are now test failures, not review items —
[`tokens.test.js`](frontend/src/tokens.test.js) parses every source file and
rejects malformed token names, raw palette steps, and orphaned `dark:` variants.

The companion, [`contrast.test.js`](frontend/src/contrast.test.js), checks the
palette against WCAG AA in both themes. Every contrast failure found in review was
token-level, not screen-level — one value slightly too light failed identically on
nine screens at once. 41 failures went to 0, and the causes were almost all in the
palette: `--text-subtle` failed AA in *both* themes; the light accent cleared only
3.56:1, and since contrast is symmetric it failed both as text *and* as a fill. The
test comment states what it cannot catch (a component pairing two valid tokens
badly), because a test that overstates its coverage is worse than none.

### 4. Client and server disagreed about what day it was

Every client date came from `new Date().toISOString()` — UTC — while the server
stamped completions using the timezone on the user record. For anyone off UTC there
was a window each day where the dashboard queried one date and the server wrote
another, and the checkmark appeared to reset.

Fixed by making [`frontend/src/utils/date.js`](frontend/src/utils/date.js) the
single date authority, with day arithmetic on UTC-midnight dates built from
`YYYY-MM-DD` strings so a DST transition cannot shift it. Verified with
`Pacific/Midway` while UTC was a day ahead.

The same audit found the streak displayed 0 every morning — `compute_global_streak`
broke on the first incomplete day starting from *today*, so a 30-day streak read 0
from midnight until the last habit was ticked. Today is now a grace day: it extends
the streak when complete, is forgiven when not, and any earlier gap still ends it.

---

## Decisions

**Semantic tokens, not a palette.** `tokens.css` defines `surface` / `ink` /
`accent` as space-separated RGB with `<alpha-value>`. Components never name a
colour. This makes "a value with no dark variant" structurally impossible rather
than a thing to remember, and it is enforced by the tests above.

**Build-time config is a correctness problem.** The frontend's API host cannot be a
runtime env var — Vite inlines it. That single fact caused the outage in §1,
and it is why the Dockerfile asserts on the artifact and the deploy workflow
re-fetches the shipped bundle to check it.

**Scheduler slots are claimed, not fired.** The notification job runs every minute
against a grace window, deduping on a per-slot `last_daily_sent` date
([`backend/notifications.py`](backend/notifications.py#L116-L166)), so a restart
inside the window neither double-sends nor drops the send.

**TTL indexes only act on BSON dates.** MongoDB's TTL monitor silently ignores
anything else, so rows written before the index existed — with ISO *strings* —
would have sat there forever. [`migrate_token_expiry.py`](backend/migrate_token_expiry.py)
converts them; dry-run by default, idempotent, and it leaves an unparseable expiry
alone rather than guessing.

**Deleting beats adding.** Of 46 files in `components/ui/`, application code
imported two. Recharts was the heaviest dependency in the tree, imported for two
charts, and its hardcoded `stroke="#374151"` was wrong in one theme by
construction — both are now hand-drawn SVG that reads from the tokens.

---

## Measured

| | Before | Now |
|---|---|---|
| Frontend initial load | 283,951 B gzipped, no route splitting | 125 kB gzipped, route-split |
| Frontend runtime dependencies | 53 | **7** |
| Frontend source files | 73 | 40 |
| Contrast failures (7 screens × 2 themes) | 41 | **0** |
| Production build | tens of seconds (CRA) | **~0.95 s** (Vite) |
| Tests | 0 | **57 pytest + 66 vitest** |

Before-numbers are from the commits that changed them, measured over HTTP rather
than estimated. Reproduce the current ones with `yarn build` and `pytest`.

Backend is 1,936 lines across 9 modules, plus three one-off migration scripts.
36 endpoints, 7 rate-limited.

---

## Running it

```bash
# Backend — needs MONGO_URL and JWT_SECRET_KEY in backend/.env
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server:app --reload --port 8001

# Frontend
cd frontend && yarn install && VITE_BACKEND_URL=http://localhost:8001 yarn dev

# Tests
cd backend && pytest          # 57 unit; -m integration needs a live server
cd frontend && yarn test      # 66
```

Docker: `docker compose -f compose.yaml up -d --build`. The `-f` is load-bearing —
`compose.dev.yaml` is opt-in precisely because a file named
`docker-compose.override.yml` auto-merges into a bare `docker compose`, which is how
a localhost API host once got baked into a production image. Full notes in
[DEPLOYMENT.md](DEPLOYMENT.md).

AI insights are bring-your-own-key: each account adds an OpenAI key in Settings,
validated against the API before it is stored, encrypted at rest, never returned to
the client. Without one, insights fall back to templates.

---

## Known limits

- The notification scheduler sweeps every user every minute. Fine at this size,
  wrong at any real one — it should be a per-slot query or a job queue.
- `manifest.json` still points at SVG icons; PWA install prompts want PNGs.
- The integration suite (`-m integration`) needs a live server and is deselected by
  default, so CI covers pure logic and render smoke tests only.
- No E2E tests. Every bug in §1 and §2 would have been caught by one.
