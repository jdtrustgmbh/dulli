# Dulli

A calm, self-hostable **family planner**: one shared calendar, tasks with rewards, meal plan, shopping lists and a wall display, on the devices you already own. Dulli is a responsive PWA (phone, tablet, laptop, wall screen), available in **English and German**.

> **Dulli auf Deutsch:** Dulli ist ein ruhiger Familienplaner zum Selbst-Hosten: gemeinsamer Kalender, Aufgaben mit Belohnungen, Essensplan, Einkaufslisten und eine Wandanzeige. Die Anleitung zum Selbst-Hosten mit zwei Docker-Containern steht unten und in [docs/self-hosting.md](docs/self-hosting.md).

## Hosted version

Don't want to run a server? Dulli is also available as a hosted subscription at **[dulli.jdtrust.de](https://dulli.jdtrust.de)**, operated by JD Trust GmbH. (*Auf Deutsch: Dulli gibt es auch als gehostetes Abo unter [dulli.jdtrust.de](https://dulli.jdtrust.de), ganz ohne eigenen Server.*)

## Features

- **Calendar:** month, week, 5-day, day and per-person ("profiles") views; recurring events, reminders, public holidays by region, moon phases. Events for everyone span all profile columns.
- **Tasks and rewards:** per-person task boards with daily/weekly routines, coins for completed tasks, treasure chests to spend them on.
- **Meals and lists:** weekly meal plan with a recipe box, ingredients flow into the shopping list; any number of shared lists.
- **External calendars (read-only):** Google Calendar, CalDAV (iCloud, Nextcloud, Fastmail, ...) and ICS links. Credentials are encrypted at rest.
- **Wall display and photo frame:** shared display mode, picture mode and quiet hours, child lock with PIN.
- **Households:** invite family members, profiles with colors and photos, night mode, data export, account deletion.
- **Installable and offline-friendly:** PWA with a service worker; works on phone, tablet and desktop browsers.

## Quick start: two containers (app + PostgreSQL)

You need Docker with the Compose plugin.

```bash
git clone https://github.com/jdtrustgmbh/dulli.git && cd dulli
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD (openssl rand -hex 24) and, if you like, BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD
docker compose up -d --build
```

Open <http://localhost:3000>. The first start creates the owner account from `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD`. If you left the password empty, a random one is printed once:

```bash
docker compose logs app | grep bootstrap
```

Invite the rest of your family from **Settings -> Who has access?**. Put the app behind HTTPS (for example with Caddy or Traefik) before you expose it to the internet, see [docs/self-hosting.md](docs/self-hosting.md) for a reverse-proxy example, Google Calendar setup, backups and upgrades.

## Run without Docker

Needs Node.js 22+. With `DATABASE_URL` the app uses PostgreSQL. Without it, set `STATE_FILE=data/state.json` to keep the state in a JSON file (otherwise it lives in memory only).

```bash
npm ci
STATE_FILE=data/state.json BOOTSTRAP_EMAIL=you@example.com BOOTSTRAP_PASSWORD=change-me npm start
```

## Configuration

All settings are environment variables, listed with comments in [`.env.example`](.env.example): database, first login, credential encryption key$1


## Legal pages

This edition does not ship imprint, privacy policy or terms pages. If you offer Dulli to people outside your own household, add the pages your jurisdiction requires.

## Development

```bash
npm ci
npx playwright install chromium
npm run check        # syntax
npm run verify       # core smoke tests
npm run test:all     # every test group (browser tests via Playwright)
npm start            # http://localhost:3000
```

Project layout and architecture notes: [docs/architecture.md](docs/architecture.md). In short: `server/` is a small Node.js server, `public/` holds the framework-free PWA, `tests/` the Playwright and HTTP tests. Design guidance lives in [docs/design.md](docs/design.md), offline behavior in [docs/offline.md](docs/offline.md). Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md); report security issues as described in [SECURITY.md](SECURITY.md).

## License

Dulli is free software under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version as a network service, you must offer its source code to the users of that service.

The Dulli name and the logos in `branding/` and `public/assets/brand/` are not covered by the code license: you may use them to refer to this project, but please remove or replace them in your own fork or hosted offering.
