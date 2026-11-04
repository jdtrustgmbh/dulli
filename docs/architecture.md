# Architecture

Dulli is a framework-free progressive web app with a small Node.js server and PostgreSQL storage.

## Repository layout

```
.
├── server/              Node.js server (ES modules, no framework)
│   ├── index.mjs        HTTP server: routing, sessions, API, static files, persistence
│   ├── auth.mjs         password hashing, signed session cookies
│   ├── tenancy.mjs      per-household data bundle (what is stored, how it is serialized)
│   ├── secrets.mjs      AES-256-GCM encryption of calendar credentials at rest
│   ├── calendar-providers.mjs   Google / Microsoft OAuth helpers, ICS import, provider capability matrix
│   ├── caldav.mjs       read-only CalDAV client (discovery, REPORT with recurrence expansion)
│   └── stores.mjs       reminders, reward ledger, quick-capture parsing
├── public/              everything the browser gets (the server's static root)
│   ├── index.html       the app shell, login.html, join.html, display.html (wall display)
│   ├── sw.js            service worker (offline shell), manifest.webmanifest
│   ├── css/             base styles, design tokens, theme, controls, dark mode, mobile
│   ├── js/              core scripts: bootstrap (app.js), navigation, offline queue, calendar week view, i18n, wizard ...
│   ├── features/        one script (+ optional stylesheet) per feature: tasks, treasures, meals, lists, settings ...
│   └── assets/          brand logos and icons, fonts
├── tests/               Playwright and HTTP tests (*.test.mjs), helpers in tests/helpers
├── scripts/             check (syntax), verify (fast confidence run), run-tests (everything)
├── docs/                self-hosting, design, offline behavior, this file
├── branding/kit/        source files of the brand kit
├── Dockerfile, docker-compose.yml, .env.example
└── .github/workflows/   CI
```

## Runtime

- **State** is one JSON document per household plus one row per login. With `DATABASE_URL` they live in PostgreSQL (`jd_households`, `jd_accounts`, created on start); without it they are kept in a JSON state file (`STATE_FILE`) or in memory.
- **Tenancy:** every request is bound to the signed-in account's household; another household's data is never reachable. `server/tenancy.mjs` defines what belongs to a household.
- **Calendar connections** are read-only. Credentials are encrypted at rest with `CREDENTIALS_KEY` (or a key file in the data volume).
- **Realtime/offline:** the service worker caches the app shell; writes made offline are queued by `public/js/offline-ui.js` and replayed when the connection returns (see [offline.md](offline.md)).

## Front end

The browser loads `index.html` -> `js/app.js`, which boots the base UI and loads the remaining core scripts. `js/loader.js` then loads the feature scripts and stylesheets in a fixed order (the CSS cascade order). `features/extras.js` is the shared household store (`window.jdExtras`) that settings, profiles, tasks, meals and others persist into through `GET/PUT /api/extras`.

Texts are written in English in the source; German translations live in `js/i18n-ui.js` and in small dictionaries inside the feature scripts. The login and invitation pages are translated by `js/public-i18n.js`.

## Tests

`npm run verify` is the quick check before a commit; `npm run test:all` runs every group (about ten minutes). Each test starts its own throw-away server on a local port, so tests can run on a developer machine without any setup besides `npx playwright install chromium`.
